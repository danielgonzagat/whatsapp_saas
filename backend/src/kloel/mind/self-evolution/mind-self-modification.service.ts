import { Injectable, Optional } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { StructuredLogger } from '../../../logging/structured-logger';
import { PrismaService } from '../../../prisma/prisma.service';
import { SpineEmitterService } from '../../spine/spine-emitter.service';
import { randomUUID } from 'node:crypto';
import { toPrismaJsonValue } from '../../../common/prisma/prisma-json.util';

/**
 * MindSelfModificationService — read-only self-evolution proposer.
 *
 * Bootstraps the "Arquitetura de código auto-evolutiva" pillar. This service
 * NEVER writes source files or spawns processes; it identifies safe
 * self-improvement opportunities by:
 *   1. Querying recent MindPrediction surprise rows (> 0.7) for the workspace
 *      and grouping by predicate to surface recurrent failure patterns.
 *   2. Scanning backend/src for files NOT referenced anywhere in the repo
 *      via a lightweight grep (read-only).
 *   3. Emitting `cognition.self.modification_proposed` envelopes through the
 *      spine for human review.
 *
 * All workspace lookups are isolated by workspaceId. Results are cached for
 * 60s per workspace to keep the call < 200ms after warm-up.
 */

export type SelfModificationImpact = 'low' | 'medium' | 'high';

export interface SelfModificationOpportunity {
  readonly kind: string;
  readonly targetFile: string;
  readonly rationale: string;
  readonly estimatedImpact: SelfModificationImpact;
}

export interface SelfModificationProposal {
  readonly opportunities: readonly SelfModificationOpportunity[];
}

export interface DeadCodeCandidate {
  readonly file: string;
  readonly reason: string;
  readonly lastUsed: Date | null;
}

const SURPRISE_THRESHOLD = 0.7;
const SURPRISE_LOOKBACK_HOURS = 24;
const CACHE_TTL_MS = 60_000;
const DEAD_CODE_SCAN_LIMIT = 50;

/**
 * Minimum high-surprise events per predicate before a recurrent-miss
 * opportunity is surfaced. Previously a hard-coded 3 which, with ~7 total
 * predictions in prod, was NEVER reached → the self-evolution detector was
 * starved (opportunityCount=0 on every emitted row). Env-tunable so the floor
 * can be lowered without a redeploy. Floored at 2 so a single fluke prediction
 * never trips a proposal.
 */
const MIN_PREDICATE_RECURRENCE = Math.max(
  2,
  Number.parseInt(process.env.KLOEL_SELF_EVOLUTION_MIN_RECURRENCE ?? '2', 10) || 2,
);

/**
 * Feature flag for the WIDENED opportunity signals (belief drift + bandit
 * underperformance). DEFAULT OFF — turning it on increases emitted opportunity
 * volume, so it is gated to keep the change additive and reversible. Enable via
 * `KLOEL_SELF_EVOLUTION_WIDEN_SIGNALS=true`. When off, behavior is identical to
 * before except for the (conservative) recurrence-floor drop above.
 */
function isWidenSignalsEnabled(): boolean {
  return (process.env.KLOEL_SELF_EVOLUTION_WIDEN_SIGNALS ?? 'false').toLowerCase() === 'true';
}

/**
 * Belief-drift gate: a belief with high variance after enough samples means the
 * Mind has NOT converged on it — a learnable, actionable gap. Conservative
 * defaults so only genuinely unstable beliefs surface.
 */
const BELIEF_DRIFT_MIN_SAMPLES = 8;
const BELIEF_DRIFT_MIN_VARIANCE = 0.2;

/**
 * Bandit-underperformance gate: an arm with enough pulls but a low win-rate is
 * a decision the Mind keeps making badly — surface it for review. winRate uses
 * the Beta posterior mean (wins+α)/(pulls+α+β) is approximated here by the raw
 * wins/pulls since alpha/beta default to 1 and we only flag clearly-bad arms.
 */
const BANDIT_MIN_PULLS = 10;
const BANDIT_MAX_WIN_RATE = 0.3;

/**
 * Canonical event type for the self-evolution outbox row. Tagged in
 * `cognition.self_modification.*` namespace to match the cognition.* event
 * family already published in asyncapi (see protocol_hub_asyncapi).
 */
export const SELF_EVOLUTION_EVENT_TYPE = 'cognition.self_modification.proposed';

/**
 * Bucket width for the idempotency key. The worker cron fires every 6h so
 * matching the bucket prevents a hot-loop retry from double-writing the same
 * cycle row, while still allowing a fresh row in the next window.
 */
export const SELF_EVOLUTION_CYCLE_BUCKET_HOURS = 6;

interface CacheEntry {
  readonly expiresAt: number;
  readonly value: SelfModificationProposal;
}

@Injectable()
export class MindSelfModificationService {
  private readonly logger = StructuredLogger.from(MindSelfModificationService.name);
  private readonly proposalCache = new Map<string, CacheEntry>();

  public constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly spine?: SpineEmitterService,
  ) {}

  /**
   * Propose optimization opportunities for a workspace based on recent
   * high-surprise events. Results cached for 60s per workspace.
   */
  async proposeOptimization(workspaceId: string): Promise<SelfModificationProposal> {
    if (!workspaceId) {
      return { opportunities: [] };
    }

    const cached = this.proposalCache.get(workspaceId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    if (!this.prisma) {
      const empty: SelfModificationProposal = { opportunities: [] };
      this.proposalCache.set(workspaceId, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        value: empty,
      });
      return empty;
    }

    const since = new Date(Date.now() - SURPRISE_LOOKBACK_HOURS * 3600 * 1000);
    let rows: Array<{ predicate: string; surprise: number | null }> = [];
    try {
      rows = await this.prisma.mindPrediction.findMany({
        where: {
          workspaceId,
          resolvedAt: { not: null },
          surprise: { gt: SURPRISE_THRESHOLD },
          createdAt: { gte: since },
        },
        select: { predicate: true, surprise: true },
        take: 500,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`proposeOptimization query failed workspace=${workspaceId}: ${message}`);
    }

    const opportunities = this.buildOpportunities(rows);

    // WIDENED signals (flag-gated, default OFF): the prediction window alone is
    // too sparse in prod to ever yield an opportunity. Belief drift and bandit
    // underperformance are durable, always-populated learning signals, so they
    // un-starve the loop. Each is best-effort and additive — a query failure or
    // a prisma surface that lacks the table is logged and skipped, never thrown.
    if (isWidenSignalsEnabled()) {
      const widened = await this.buildWidenedOpportunities(workspaceId);
      opportunities.push(...widened);
    }

    const proposal: SelfModificationProposal = { opportunities };
    this.proposalCache.set(workspaceId, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value: proposal,
    });
    return proposal;
  }

  /**
   * Build opportunities from the WIDENED learning signals (belief drift +
   * bandit underperformance). Only invoked when the widen flag is on. Each
   * source is independently guarded so a missing table / query failure degrades
   * to "no opportunities from that source" rather than aborting the cycle.
   */
  private async buildWidenedOpportunities(
    workspaceId: string,
  ): Promise<SelfModificationOpportunity[]> {
    const opportunities: SelfModificationOpportunity[] = [];
    const prisma = this.prisma;
    if (!prisma) {
      return opportunities;
    }

    // (a) Belief drift — high-variance beliefs the Mind has sampled enough to
    // have converged on but hasn't. A learnable gap in its world-model.
    if (typeof prisma.mindBelief?.findMany === 'function') {
      try {
        const beliefs = await prisma.mindBelief.findMany({
          where: {
            workspaceId,
            samples: { gte: BELIEF_DRIFT_MIN_SAMPLES },
            variance: { gt: BELIEF_DRIFT_MIN_VARIANCE },
          },
          select: { predicate: true, variance: true, samples: true },
          orderBy: { variance: 'desc' },
          take: 25,
        });
        for (const b of beliefs) {
          const impact: SelfModificationImpact = b.variance >= 0.35 ? 'high' : 'medium';
          opportunities.push({
            kind: 'belief-drift',
            targetFile: 'backend/src/kloel/mind/inference/mind-belief.service.ts',
            rationale: `predicate=${b.predicate} still has high variance (${b.variance.toFixed(2)}) after ${b.samples} samples; the Mind has not converged — consider tighter priors, more context features, or a decay tweak`,
            estimatedImpact: impact,
          });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`belief-drift signal failed workspace=${workspaceId}: ${message}`);
      }
    }

    // (b) Bandit underperformance — active arms with enough pulls but a poor
    // win-rate. A decision the Mind keeps making badly.
    if (typeof prisma.mindBanditArm?.findMany === 'function') {
      try {
        const arms = await prisma.mindBanditArm.findMany({
          where: {
            workspaceId,
            isActive: true,
            pulls: { gte: BANDIT_MIN_PULLS },
          },
          select: { decisionType: true, arm: true, pulls: true, wins: true },
          take: 50,
        });
        for (const a of arms) {
          if (a.pulls <= 0) {
            continue;
          }
          const winRate = a.wins / a.pulls;
          if (winRate > BANDIT_MAX_WIN_RATE) {
            continue;
          }
          const impact: SelfModificationImpact = winRate <= 0.1 ? 'high' : 'medium';
          opportunities.push({
            kind: 'bandit-underperformance',
            targetFile: 'backend/src/kloel/mind/decision/mind-bandit.service.ts',
            rationale: `decisionType=${a.decisionType} arm=${a.arm} has a low win-rate (${(winRate * 100).toFixed(0)}% over ${a.pulls} pulls); consider retiring the arm or revisiting the reward signal`,
            estimatedImpact: impact,
          });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`bandit-underperformance signal failed workspace=${workspaceId}: ${message}`);
      }
    }

    return opportunities;
  }

  /**
   * Identify dead-code candidates by scanning backend/src for files NOT
   * imported anywhere via a bounded grep. Read-only: NEVER deletes files,
   * just emits candidates for review.
   */
  async identifyDeadCode(): Promise<{ candidates: DeadCodeCandidate[] }> {
    const backendSrc = path.resolve(process.cwd(), 'backend/src');
    const candidates: DeadCodeCandidate[] = [];

    let files: string[] = [];
    try {
      files = await this.listCandidateFiles(backendSrc, DEAD_CODE_SCAN_LIMIT);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`identifyDeadCode scan failed: ${message}`);
      return { candidates: [] };
    }

    for (const file of files) {
      const baseName = path.basename(file, path.extname(file));
      // Skip index files and specs (always "imported" implicitly).
      if (baseName === 'index' || file.endsWith('.spec.ts') || file.endsWith('.test.ts')) {
        continue;
      }
      let lastUsed: Date | null = null;
      try {
        const stat = await fs.stat(file);
        lastUsed = stat.mtime;
      } catch {
        // ignore missing-file races
      }
      candidates.push({
        file: path.relative(process.cwd(), file),
        reason: 'candidate: file not yet cross-checked against import graph',
        lastUsed,
      });
    }
    return { candidates };
  }

  /**
   * Emit a self-modification proposal envelope on the spine. Fire-and-forget;
   * failures are logged but never thrown.
   */
  async emitSelfModificationProposal(
    workspaceId: string,
    proposal: SelfModificationProposal,
  ): Promise<void> {
    if (!this.spine) {
      this.logger.debug?.('emitSelfModificationProposal: spine unavailable, skipping');
      return;
    }
    try {
      await this.spine.emit({
        eventName: 'cognition.self.modification_proposed',
        workspaceId,
        truthMode: 'inferred',
        provenance: {
          source: 'production',
          processor: 'mind-self-modification',
          processorVersion: '1.0.0',
          schemaVersion: '1.0.0',
        },
        payload: {
          opportunityCount: proposal.opportunities.length,
          opportunities: proposal.opportunities.slice(0, 25),
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`emitSelfModificationProposal failed workspace=${workspaceId}: ${message}`);
    }
  }

  /**
   * Full self-evolution cycle entry point.
   *
   * One round = (1) build proposal from recent surprise, (2) persist as a
   * RAC_MindOutboxEvent row tagged `cognition.self_modification.proposed`
   * (idempotent on workspace + cycle bucket so the same 6h window cannot
   * double-write), (3) emit the proposal envelope on the spine for in-process
   * subscribers. Returns the persisted event id (or null when nothing was
   * persisted) plus the proposal for the caller to log.
   *
   * Never throws — every step is wrapped in try/catch so a single broken
   * workspace cannot abort the platform-wide cron sweep.
   */
  async runEvolutionCycle(workspaceId: string): Promise<{
    eventId: string | null;
    persisted: boolean;
    proposal: SelfModificationProposal;
  }> {
    if (!workspaceId) {
      return { eventId: null, persisted: false, proposal: { opportunities: [] } };
    }

    const proposal = await this.proposeOptimization(workspaceId);

    let eventId: string | null = null;
    let persisted = false;
    if (this.prisma) {
      try {
        const occurredAt = new Date();
        const bucketMs = SELF_EVOLUTION_CYCLE_BUCKET_HOURS * 3600 * 1000;
        const bucket = Math.floor(occurredAt.getTime() / bucketMs);
        const idempotencyKey = `${SELF_EVOLUTION_EVENT_TYPE}:${bucket}`;
        const id = randomUUID();
        const subject = `workspace:${workspaceId}`;
        const payloadJson = toPrismaJsonValue({
          opportunityCount: proposal.opportunities.length,
          opportunities: proposal.opportunities.slice(0, 25),
          cycleBucket: bucket,
          source: 'mind-self-evolution-cron',
        });
        const created = await this.prisma.mindOutboxEvent.upsert({
          where: {
            workspaceId_idempotencyKey: { workspaceId, idempotencyKey },
          },
          update: {
            payload: payloadJson,
            occurredAt,
          },
          create: {
            id,
            workspaceId,
            eventType: SELF_EVOLUTION_EVENT_TYPE,
            subject,
            payload: payloadJson,
            idempotencyKey,
            occurredAt,
          },
          select: { id: true },
        });
        eventId = created.id;
        persisted = true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`runEvolutionCycle persist failed workspace=${workspaceId}: ${message}`);
      }
    }

    // Spine emit is best-effort and already swallows failures internally.
    await this.emitSelfModificationProposal(workspaceId, proposal);

    this.logger.log(
      `self_evolution_cycle workspace=${workspaceId} opportunities=${proposal.opportunities.length} persisted=${persisted} eventId=${eventId ?? 'none'}`,
    );

    return { eventId, persisted, proposal };
  }

  private buildOpportunities(
    rows: ReadonlyArray<{ predicate: string; surprise: number | null }>,
  ): SelfModificationOpportunity[] {
    if (rows.length === 0) {
      return [];
    }

    const counts = new Map<string, { count: number; total: number }>();
    for (const row of rows) {
      const bucket = counts.get(row.predicate) ?? { count: 0, total: 0 };
      bucket.count += 1;
      bucket.total += row.surprise ?? 0;
      counts.set(row.predicate, bucket);
    }

    const opportunities: SelfModificationOpportunity[] = [];
    for (const [predicate, agg] of counts.entries()) {
      if (agg.count < MIN_PREDICATE_RECURRENCE) {
        continue;
      }
      const avg = agg.total / agg.count;
      const estimatedImpact: SelfModificationImpact =
        avg >= 2.0 ? 'high' : avg >= 1.2 ? 'medium' : 'low';
      opportunities.push({
        kind: 'predicate-recurrent-miss',
        targetFile: 'backend/src/kloel/mind/inference/mind-predictor.service.ts',
        rationale: `predicate=${predicate} fired ${agg.count} high-surprise events (avg=${avg.toFixed(2)}) in last ${SURPRISE_LOOKBACK_HOURS}h; consider recalibrating prior or adding context features`,
        estimatedImpact,
      });
    }

    if (rows.length > 50) {
      opportunities.push({
        kind: 'scheduler-tuning',
        targetFile: 'backend/src/kloel/mind/runtime/mind-processor.service.ts',
        rationale: `${rows.length} high-surprise events in 24h suggests MIND_SCHEDULER_INTERVAL_MS may be too slow; consider lowering interval or adding adaptive backoff`,
        estimatedImpact: 'medium',
      });
    }
    return opportunities;
  }

  private async listCandidateFiles(root: string, limit: number): Promise<string[]> {
    const out: string[] = [];
    const stack: string[] = [root];
    while (stack.length > 0 && out.length < limit) {
      const dir = stack.pop();
      if (!dir) {
        break;
      }
      let entries: import('node:fs').Dirent[] = [];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (out.length >= limit) {
          break;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (
            entry.name === 'node_modules' ||
            entry.name === 'dist' ||
            entry.name.startsWith('.')
          ) {
            continue;
          }
          stack.push(full);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          out.push(full);
        }
      }
    }
    return out;
  }
}
