import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { StructuredLogger } from '../../../logging/structured-logger';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * A single, contradiction between the freshly-derived self-model and the
 * previous persisted version. Recorded inline on the new row so drift in
 * self-belief is queryable without recomputation.
 */
export interface SelfModelContradiction {
  field: string;
  was: unknown;
  now: unknown;
  reason: string;
}

/**
 * The derived self-description. Plain JSON-serializable shape so it round-trips
 * through the JSONB columns of {@link RAC_MindSelfModel}.
 */
export interface DerivedSelfModel {
  beliefsAboutSelf: Record<string, unknown>;
  decisionPatterns: Record<string, unknown>;
  knownLimits: Record<string, unknown>;
  derivedFrom: Record<string, unknown>;
}

/**
 * Retention bounds for the append-only self-model timeline.
 *
 * snapshot() runs every long-tick (~30s) and appends a row that is NEVER
 * updated. Left unbounded the table grows ~120 rows/hour/workspace and was
 * verified in prod at 2.6M rows. prune() keeps the timeline durable but bounded:
 * the {@link SELF_MODEL_RETENTION_VERSIONS} newest versions per workspace are
 * always kept, and any older row beyond a {@link SELF_MODEL_RETENTION_DAYS}-day
 * floor is reaped. The two bounds are OR'd: a version survives if it is among
 * the newest N OR younger than the day floor, so a slow workspace never loses
 * its only recent history and a busy one stays capped.
 */
export const SELF_MODEL_RETENTION_VERSIONS = 200;
export const SELF_MODEL_RETENTION_DAYS = 90;

/**
 * MindSelfModelService — persistent, versioned self-model timeline.
 *
 * Each cycle it derives a self-description (beliefs_about_self,
 * decision_patterns, known_limits) from the workspace's existing
 * MindWorkspaceState + the most recent MindDailyReport, compares it against the
 * previous persisted version, flags contradictions, and APPENDS a new
 * versioned row. Rows are never updated or deleted — the history is durable.
 */
@Injectable()
export class MindSelfModelService {
  private readonly logger = StructuredLogger.from(MindSelfModelService.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.debug?.(`MindSelfModelService initialized`);
  }

  /**
   * Derive the current self-model purely from already-persisted Mind data.
   * No side effects — safe to call for inspection.
   */
  async derive(workspaceId: string): Promise<DerivedSelfModel> {
    const [state, latestReport] = await Promise.all([
      this.prisma.mindWorkspaceState.findUnique({ where: { workspaceId } }),
      this.prisma.mindDailyReport.findFirst({
        where: { workspaceId },
        orderBy: { reportDate: 'desc' },
      }),
    ]);

    const tickCount = state?.tickCount ?? 0;
    const surpriseWindow = state?.surpriseWindow ?? 0;
    const perceivedWindow = state?.perceivedWindow ?? 0;
    const openDecisions = state?.openDecisions ?? 0;
    const lastError = state?.lastError ?? null;
    const health = (state?.health ?? {}) as Record<string, unknown>;

    const reportMetrics = (latestReport?.metrics ?? null) as Record<string, unknown> | null;
    const lifts = Array.isArray(reportMetrics?.lifts)
      ? (reportMetrics?.lifts as Array<Record<string, unknown>>)
      : [];

    // beliefs_about_self — what the Mind currently holds true about itself.
    const beliefsAboutSelf: Record<string, unknown> = {
      hasOperated: tickCount > 0,
      maturity: tickCount >= 100 ? 'experienced' : tickCount > 0 ? 'learning' : 'cold-start',
      observedTicks: tickCount,
      perceivesEnvironment: perceivedWindow > 0,
      healthStatus: typeof health.status === 'string' ? health.status : 'unknown',
    };

    // decision_patterns — how the Mind has been behaving.
    const positiveLifts = lifts.filter(
      (lift) => typeof lift.lift === 'number' && lift.lift > 0,
    ).length;
    const decisionPatterns: Record<string, unknown> = {
      openDecisions,
      surpriseLevel: surpriseWindow,
      cautious: surpriseWindow > perceivedWindow,
      measuredDecisionTypes: lifts.length,
      decisionTypesWithPositiveLift: positiveLifts,
      bestLift: lifts.reduce<number>(
        (best, lift) => (typeof lift.lift === 'number' ? Math.max(best, lift.lift) : best),
        0,
      ),
    };

    // known_limits — what the Mind knows it cannot (yet) do well.
    const knownLimits: Record<string, unknown> = {
      lastError,
      hasRecentFailure: lastError != null,
      degradedSubsystems: Object.entries(health)
        .filter(([, value]) => value === 'down' || value === 'degraded' || value === 'disconnected')
        .map(([key]) => key),
      coldStart: tickCount === 0,
      noLiftEvidence: lifts.length === 0,
    };

    return {
      beliefsAboutSelf,
      decisionPatterns,
      knownLimits,
      derivedFrom: {
        hadState: state != null,
        hadReport: latestReport != null,
        reportDate: latestReport?.reportDate?.toISOString() ?? null,
        lastTickAt: state?.lastTickAt?.toISOString() ?? null,
      },
    };
  }

  /**
   * Compare a freshly-derived self-model against the previous version and
   * return the set of contradictions (shifts in self-belief). Empty when the
   * self-model is stable or there is no prior version.
   */
  detectContradictions(
    previous: DerivedSelfModel | null,
    next: DerivedSelfModel,
  ): SelfModelContradiction[] {
    if (!previous) {
      return [];
    }

    const contradictions: SelfModelContradiction[] = [];
    const groups: Array<keyof Omit<DerivedSelfModel, 'derivedFrom'>> = [
      'beliefsAboutSelf',
      'decisionPatterns',
      'knownLimits',
    ];

    for (const group of groups) {
      const prevGroup = previous[group] ?? {};
      const nextGroup = next[group] ?? {};
      const keys = new Set([...Object.keys(prevGroup), ...Object.keys(nextGroup)]);
      for (const key of keys) {
        const was = prevGroup[key];
        const now = nextGroup[key];
        if (this.isContradiction(was, now)) {
          contradictions.push({
            field: `${group}.${key}`,
            was,
            now,
            reason: this.contradictionReason(was, now),
          });
        }
      }
    }

    return contradictions;
  }

  private isContradiction(was: unknown, now: unknown): boolean {
    // Boolean flips are always meaningful self-belief contradictions.
    if (typeof was === 'boolean' && typeof now === 'boolean') {
      return was !== now;
    }
    // String identity (e.g. maturity / healthStatus) flips.
    if (typeof was === 'string' && typeof now === 'string') {
      return was !== now;
    }
    return false;
  }

  private contradictionReason(was: unknown, now: unknown): string {
    if (typeof was === 'boolean' && typeof now === 'boolean') {
      return now ? 'self-belief became true (was false)' : 'self-belief became false (was true)';
    }
    return `self-description changed from "${String(was)}" to "${String(now)}"`;
  }

  /**
   * Derive, diff against the latest persisted version, and APPEND a new
   * versioned self-model row. Returns the persisted row. Append-only — never
   * updates or deletes existing rows.
   */
  async snapshot(workspaceId: string) {
    const [derived, previousRow] = await Promise.all([
      this.derive(workspaceId),
      this.prisma.mindSelfModel.findFirst({
        where: { workspaceId },
        orderBy: { version: 'desc' },
      }),
    ]);

    const previousDerived: DerivedSelfModel | null = previousRow
      ? {
          beliefsAboutSelf: (previousRow.beliefsAboutSelf ?? {}) as Record<string, unknown>,
          decisionPatterns: (previousRow.decisionPatterns ?? {}) as Record<string, unknown>,
          knownLimits: (previousRow.knownLimits ?? {}) as Record<string, unknown>,
          derivedFrom: (previousRow.derivedFrom ?? {}) as Record<string, unknown>,
        }
      : null;

    const contradictions = this.detectContradictions(previousDerived, derived);
    const nextVersion = (previousRow?.version ?? 0) + 1;

    const row = await this.prisma.mindSelfModel.create({
      data: {
        id: randomUUID(),
        workspaceId,
        version: nextVersion,
        beliefsAboutSelf: derived.beliefsAboutSelf as Prisma.InputJsonValue,
        decisionPatterns: derived.decisionPatterns as Prisma.InputJsonValue,
        knownLimits: derived.knownLimits as Prisma.InputJsonValue,
        contradictions: contradictions as unknown as Prisma.InputJsonValue,
        derivedFrom: derived.derivedFrom as Prisma.InputJsonValue,
      },
    });

    if (contradictions.length > 0) {
      this.logger.warn('mind_self_model_contradictions', {
        workspaceId,
        version: nextVersion,
        count: contradictions.length,
        fields: contradictions.map((c) => c.field),
      });
    }

    // Best-effort retention sweep AFTER the append commits. Never blocks or
    // fails the snapshot — a prune error must not break the durable history.
    void this.prune(workspaceId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('mind_self_model_prune_failed', { workspaceId, message });
    });

    return row;
  }

  /**
   * Bound the append-only timeline for a workspace. Keeps the newest
   * {@link SELF_MODEL_RETENTION_VERSIONS} versions AND any row younger than the
   * {@link SELF_MODEL_RETENTION_DAYS}-day floor; deletes only rows that fail
   * BOTH. Idempotent and safe to call after every snapshot(). Returns the
   * number of rows reaped (0 when under the cap). Read APIs (timeline/latest)
   * are unaffected — they always read the newest versions, which prune keeps.
   */
  async prune(
    workspaceId: string,
    opts: { keepVersions?: number; maxAgeDays?: number } = {},
  ): Promise<{ deleted: number }> {
    if (!workspaceId) {
      return { deleted: 0 };
    }
    const keepVersions = Math.max(1, opts.keepVersions ?? SELF_MODEL_RETENTION_VERSIONS);
    const maxAgeDays = Math.max(1, opts.maxAgeDays ?? SELF_MODEL_RETENTION_DAYS);

    // Find the version cutoff: the Nth-newest version. Anything strictly below
    // it is a candidate for deletion (subject to the age floor).
    const boundaryRows = await this.prisma.mindSelfModel.findMany({
      where: { workspaceId },
      orderBy: { version: 'desc' },
      skip: keepVersions - 1,
      take: 1,
      select: { version: true },
    });
    const cutoffVersion = boundaryRows[0]?.version;
    if (cutoffVersion === undefined) {
      // Fewer than keepVersions rows exist — nothing is over the cap.
      return { deleted: 0 };
    }

    const ageFloor = new Date(Date.now() - maxAgeDays * 24 * 3600 * 1000);

    // Delete rows that are BOTH below the version cutoff AND older than the age
    // floor. The two conditions are AND'd here, which makes the kept set the
    // UNION (newest N OR younger than floor) — exactly the OR semantics above.
    const result = await this.prisma.mindSelfModel.deleteMany({
      where: {
        workspaceId,
        version: { lt: cutoffVersion },
        snapshotAt: { lt: ageFloor },
      },
    });

    if (result.count > 0) {
      this.logger.debug?.('mind_self_model_pruned', {
        workspaceId,
        deleted: result.count,
        keepVersions,
        maxAgeDays,
        cutoffVersion,
      });
    }
    return { deleted: result.count };
  }

  /**
   * Read the versioned self-model timeline for a workspace, newest first.
   */
  async timeline(workspaceId: string, take = 50) {
    return this.prisma.mindSelfModel.findMany({
      where: { workspaceId },
      orderBy: { version: 'desc' },
      take,
    });
  }

  /** The latest persisted self-model row, or null when none has been taken. */
  async latest(workspaceId: string) {
    return this.prisma.mindSelfModel.findFirst({
      where: { workspaceId },
      orderBy: { version: 'desc' },
    });
  }
}
