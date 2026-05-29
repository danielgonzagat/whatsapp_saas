import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { MindJson } from '../../mind.types';

export interface GlobalPriorArmEntry {
  arm: string;
  aggregateAlpha: number;
  aggregateBeta: number;
  aggregateMean: number;
  aggregatePulls: number;
  aggregateWins: number;
  workspaceCount: number;
}

export interface GlobalPrior {
  decisionType: string;
  arms: GlobalPriorArmEntry[];
  totalPulls: number;
  meanSuccessRate: number;
}

type MindGlobalPriorDelegate = {
  createMany(input: {
    data: Array<{
      id: string;
      workspaceId?: string | null;
      domain: string;
      predicate: string;
      context: Prisma.InputJsonObject;
      mean: number;
      variance: number;
      samples: number;
      anonymizedBy: string;
    }>;
    skipDuplicates: boolean;
  }): Promise<unknown>;
  deleteMany(input: {
    where: { domain: string; predicate: string; workspaceId?: null };
  }): Promise<unknown>;
};

function hasGlobalPriorDelegate(
  prisma: PrismaService,
): prisma is PrismaService & { mindGlobalPrior: MindGlobalPriorDelegate } {
  const candidate = Object(prisma) as { mindGlobalPrior?: Partial<MindGlobalPriorDelegate> };
  return (
    typeof candidate.mindGlobalPrior?.createMany === 'function' &&
    typeof candidate.mindGlobalPrior?.deleteMany === 'function'
  );
}

@Injectable()
export class MindGlobalPriorService {
  private readonly logger = StructuredLogger.from(MindGlobalPriorService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async listWorkspaceIds(): Promise<string[]> {
    const workspaces = await this.prisma.workspace.findMany({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return workspaces.map((workspace) => workspace.id);
  }

  async getPrior(decisionType: string): Promise<GlobalPrior> {
    const startedAt = Date.now();

    const workspaceIds = await this.listWorkspaceIds();
    const arms =
      workspaceIds.length > 0
        ? await this.prisma.mindBanditArm.findMany({
            where: { workspaceId: { in: workspaceIds }, decisionType, pulls: { gt: 0 } },
            select: {
              workspaceId: true,
              arm: true,
              alpha: true,
              beta: true,
              pulls: true,
              wins: true,
            },
          })
        : [];

    const grouped = new Map<
      string,
      {
        arm: string;
        totalAlpha: number;
        totalBeta: number;
        totalPulls: number;
        totalWins: number;
        workspaces: Set<string>;
      }
    >();

    for (const row of arms) {
      const existing = grouped.get(row.arm);
      if (existing) {
        existing.totalAlpha += row.alpha;
        existing.totalBeta += row.beta;
        existing.totalPulls += row.pulls;
        existing.totalWins += row.wins;
        existing.workspaces.add(row.workspaceId);
      } else {
        grouped.set(row.arm, {
          arm: row.arm,
          totalAlpha: row.alpha,
          totalBeta: row.beta,
          totalPulls: row.pulls,
          totalWins: row.wins,
          workspaces: new Set([row.workspaceId]),
        });
      }
    }

    let totalPulls = 0;
    let totalWins = 0;

    const armEntries: GlobalPriorArmEntry[] = [];
    for (const [, entry] of grouped) {
      totalPulls += entry.totalPulls;
      totalWins += entry.totalWins;
      armEntries.push({
        arm: entry.arm,
        aggregateAlpha: entry.totalAlpha,
        aggregateBeta: entry.totalBeta,
        aggregateMean:
          entry.totalAlpha + entry.totalBeta > 0
            ? entry.totalAlpha / (entry.totalAlpha + entry.totalBeta)
            : 0,
        aggregatePulls: entry.totalPulls,
        aggregateWins: entry.totalWins,
        workspaceCount: entry.workspaces.size,
      });
    }

    armEntries.sort((a, b) => b.aggregatePulls - a.aggregatePulls);

    const meanSuccessRate = totalPulls > 0 ? totalWins / totalPulls : 0;
    await this.persistPriorSnapshot(decisionType, armEntries);

    this.logger.debug({
      operation: 'mind.global_prior.get_prior',
      status: 'ok',
      durationMs: Date.now() - startedAt,
      decisionType,
      armCount: armEntries.length,
      totalPulls,
    });

    return {
      decisionType,
      arms: armEntries,
      totalPulls,
      meanSuccessRate,
    };
  }

  async suggestedPrior(input: {
    arm: string;
    decisionType: string;
    fallbackAlpha?: number;
    fallbackBeta?: number;
  }): Promise<{ alpha: number; beta: number; fromGlobal: boolean }> {
    const prior = await this.getPrior(input.decisionType);

    const match = prior.arms.find((a) => a.arm === input.arm);
    if (match && match.aggregatePulls >= 50) {
      return {
        alpha: match.aggregateAlpha,
        beta: match.aggregateBeta,
        fromGlobal: true,
      };
    }

    return {
      alpha: input.fallbackAlpha ?? 1,
      beta: input.fallbackBeta ?? 1,
      fromGlobal: false,
    };
  }

  async lookupPrior(
    domain: string,
    predicate: string,
    context: MindJson,
  ): Promise<{ alpha: number; beta: number } | null> {
    const prior = await this.prisma.mindGlobalPrior.findFirst({
      where: {
        workspaceId: null,
        domain,
        predicate,
        context: { equals: context as Prisma.InputJsonValue },
      },
    });
    if (!prior) {
      return null;
    }

    const { mean, variance } = prior;
    if (variance <= 0 || mean <= 0 || mean >= 1) {
      return null;
    }

    const k = (mean * (1 - mean)) / variance - 1;
    if (k <= 0) {
      return null;
    }

    return { alpha: mean * k, beta: (1 - mean) * k };
  }

  async getPriorFor(predicate: string): Promise<{ mean: number; samples: number } | null> {
    const prior = await this.prisma.mindGlobalPrior.findFirst({
      where: { workspaceId: null, predicate },
      select: { mean: true, samples: true },
      orderBy: { samples: 'desc' },
    });
    if (!prior || prior.samples === 0) {
      return null;
    }
    return { mean: prior.mean, samples: prior.samples };
  }

  
    /**
     * Bridge method replacing {@link KloelGlobalPriorService#getPrior}.
     *
     * Queries `mindBanditArm` rows for the given `decisionType` + `action` (arm)
     * across ALL workspaces, aggregates alpha/beta totals, and returns the
     * Beta-posterior mean together with total pull count as `observations`.
     *
     * Returns `null` when no arm data exists (triggers default belief in
     * `mixWithGlobalPrior`, identical to the legacy behaviour).
     *
     * The `channel` parameter is accepted for API symmetry with
     * `KloelGlobalPriorService.getPrior` but is currently not stored on
     * `mindBanditArm` rows; a future migration can add a `channel` column and
     * narrow the query without breaking callers.
     */
    async getPriorTuple(
      _channel: string,
      decisionType: string,
      action: string,
    ): Promise<{ mean: number; observations: number } | null> {
      const BETA_PRIOR_ALPHA = 1;
      const BETA_PRIOR_BETA = 1;

      const rows = await this.prisma.mindBanditArm.findMany({
        where: { decisionType, arm: action, pulls: { gt: 0 } },
        select: { alpha: true, beta: true, pulls: true },
      });

      if (rows.length === 0) {
        return null;
      }

      let totalAlpha = BETA_PRIOR_ALPHA;
      let totalBeta = BETA_PRIOR_BETA;
      let totalPulls = 0;

      for (const row of rows) {
        totalAlpha += row.alpha;
        totalBeta += row.beta;
        totalPulls += row.pulls;
      }

      const mean = totalAlpha / (totalAlpha + totalBeta);

      return { mean, observations: totalPulls };
    }

  /**
   * Bridge method replacing {@link KloelGlobalPriorService#recordObservation}.
   *
   * Feeds a resolved decision outcome back into the cross-workspace
   * (`workspaceId = null`) global prior, persisted to the canonical
   * `mindGlobalPrior` table — NOT the deprecated `kloelGlobalPrior`.
   *
   * Exact success counts are kept in `context.successes` so the running
   * Bernoulli `mean`/`variance` stay precise across upserts (no lossy
   * `round(mean * samples)` drift). Runs in a transaction so the
   * read-modify-write of `samples`/`successes` is atomic under concurrency.
   */
  async recordObservation(
    channel: string,
    decisionType: string,
    action: string,
    success: boolean,
  ): Promise<void> {
    const startedAt = Date.now();
    const predicate = `bandit-obs:${decisionType}:${action}`;
    const id = predicate.slice(0, 191);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.mindGlobalPrior.findFirst({
        where: { workspaceId: null, domain: 'global_anonymous', predicate },
        select: { id: true, samples: true, mean: true, context: true },
      });

      if (existing) {
        const prevCtx = (existing.context ?? {}) as { successes?: number };
        const prevSuccesses =
          typeof prevCtx.successes === 'number'
            ? prevCtx.successes
            : Math.round(existing.mean * existing.samples);
        const samples = existing.samples + 1;
        const successes = prevSuccesses + (success ? 1 : 0);
        const mean = successes / samples;
        await tx.mindGlobalPrior.update({
          where: { id: existing.id },
          data: {
            samples,
            mean,
            variance: mean * (1 - mean),
            context: { channel, action, successes },
          },
        });
      } else {
        const successes = success ? 1 : 0;
        const mean = successes;
        await tx.mindGlobalPrior.create({
          data: {
            id,
            workspaceId: null,
            domain: 'global_anonymous',
            predicate,
            context: { channel, action, successes },
            mean,
            variance: mean * (1 - mean),
            samples: 1,
            anonymizedBy: 'policy_outcome_observation',
          },
        });
      }
    });

    this.logger.debug({
      operation: 'mind.global_prior.record_observation',
      status: 'ok',
      durationMs: Date.now() - startedAt,
      channel,
      decisionType,
      action,
      success,
    });
  }

  async listTopPriors(
    limit: number,
  ): Promise<Array<{ predicate: string; mean: number; samples: number }>> {
    return this.prisma.mindGlobalPrior.findMany({
      where: { workspaceId: null },
      select: { predicate: true, mean: true, samples: true },
      orderBy: { samples: 'desc' },
      take: limit,
    });
  }

  async listDecisionTypes(): Promise<string[]> {
    const decisionTypes = new Set<string>();
    const workspaceIds = await this.listWorkspaceIds();

    if (workspaceIds.length > 0) {
      const rows = await this.prisma.mindBanditArm.findMany({
        where: { workspaceId: { in: workspaceIds }, pulls: { gt: 0 } },
        select: { decisionType: true },
        distinct: ['decisionType'],
        orderBy: { decisionType: 'asc' },
      });
      for (const row of rows) {
        decisionTypes.add(row.decisionType);
      }
    }

    return Array.from(decisionTypes).sort();
  }

  private async persistPriorSnapshot(
    decisionType: string,
    arms: GlobalPriorArmEntry[],
  ): Promise<void> {
    if (arms.length === 0 || !hasGlobalPriorDelegate(this.prisma)) {
      return;
    }

    const predicate = `bandit:${decisionType}`;
    await this.prisma.mindGlobalPrior.deleteMany({
      where: { domain: 'global_anonymous', predicate, workspaceId: null },
    });
    await this.prisma.mindGlobalPrior.createMany({
      data: arms.map((arm) => ({
        id: `${decisionType}:${arm.arm}`.slice(0, 191),
        workspaceId: null,
        domain: 'global_anonymous',
        predicate,
        context: { arm: arm.arm },
        mean: arm.aggregateMean,
        variance:
          arm.aggregateAlpha + arm.aggregateBeta > 0
            ? (arm.aggregateMean * (1 - arm.aggregateMean)) /
              (arm.aggregateAlpha + arm.aggregateBeta + 1)
            : 0.25,
        samples: arm.aggregatePulls,
        anonymizedBy: 'workspace_aggregate_bandit',
      })),
      skipDuplicates: true,
    });
  }
}
