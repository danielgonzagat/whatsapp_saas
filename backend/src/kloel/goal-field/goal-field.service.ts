import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import type { SpineEventRef } from '../mind/mind.types';
import type { GoalFieldShadowAccumulatorService } from './goal-field.shadow-accumulator.service';
import { COGNITIVE_DETECTORS } from './detectors/cognitive.detectors';
import { COMMERCIAL_DETECTORS } from './detectors/commercial.detectors';
import { FINANCIAL_DETECTORS } from './detectors/financial.detectors';
import { OPS_UX_DETECTORS } from './detectors/operational-ux.detectors';
import { STRUCTURAL_DETECTORS } from './detectors/structural.detectors';
import {
  AggregatedTension,
  DIMENSION_WEIGHT,
  Detector,
  GoalCandidate,
  GoalEmissionResult,
  GoalFieldMode,
  Tension,
  entityKey,
  makeGoalId,
} from './goal-field.types';

/**
 * UTP-GOAL-AGG-001 + UTP-GOAL-EMERGE-001 + UTP-GOAL-SELECT-001
 *   + UTP-GOAL-SURVIVE-001 + UTP-GOAL-SHADOW-001 + UTP-GOAL-PROMOTE-001.
 *
 * The goal field orchestrator runs the registered detectors in a single
 * cycle and produces:
 *   - tensions (raw)
 *   - aggregated tensions (per entity, weighted by dimension)
 *   - goal candidates (those above emergence threshold)
 *   - promoted goals (selected by score, only when mode === 'active')
 *
 * Survival: the orchestrator tracks goals that don't reach a real outcome
 * within their TTL and demotes them — recorded via the `pruneStale` method.
 */
@Injectable()
export class GoalFieldService {
  private readonly logger = new Logger(GoalFieldService.name);
  private readonly liveGoals = new Map<string, GoalCandidate & { lastSeenMs: number }>();
  private readonly defaultDetectors: readonly Detector[];

  public constructor(
    @Optional() @Inject('GOAL_FIELD_DETECTORS') detectors?: readonly Detector[],
    @Optional() private readonly shadowAccumulator?: GoalFieldShadowAccumulatorService,
  ) {
    this.defaultDetectors = detectors ?? [
      ...COMMERCIAL_DETECTORS,
      ...COGNITIVE_DETECTORS,
      ...STRUCTURAL_DETECTORS,
      ...FINANCIAL_DETECTORS,
      ...OPS_UX_DETECTORS,
    ];
  }

  public registeredDetectors(): readonly Detector[] {
    return this.defaultDetectors;
  }

  public runCycle(input: {
    readonly events: readonly SpineEventRef[];
    readonly nowMs?: number;
    readonly mode?: GoalFieldMode;
    readonly emergenceThreshold?: number;
    readonly promotionTopK?: number;
  }): GoalEmissionResult {
    const nowMs = input.nowMs ?? Date.now();
    const mode = input.mode ?? 'shadow';
    const emergenceThreshold = input.emergenceThreshold ?? 0.6;
    const promotionTopK = input.promotionTopK ?? 5;

    const tensions: Tension[] = [];
    for (const det of this.defaultDetectors) {
      try {
        const detected = det.detect(input.events, nowMs);
        for (const t of detected) tensions.push(t);
      } catch (err) {
        this.logger.error(
          `detector ${det.name} threw — ${(err as Error).message}`,
        );
      }
    }

    const aggregated = this.aggregate(tensions);
    const candidates = this.emerge(aggregated, emergenceThreshold, nowMs);
    const selected = this.select(candidates, promotionTopK);

    const promoted =
      mode === 'active' ? this.gateByShadowEligibility(selected, nowMs) : [];
    if (mode === 'active') {
      for (const g of promoted) {
        this.liveGoals.set(g.goalId, { ...g, lastSeenMs: nowMs });
      }
    }

    const cycleAt = new Date(nowMs).toISOString();
    this.logger.debug(
      `goal-field cycle (${mode}) tensions=${tensions.length} aggregated=${aggregated.length} candidates=${candidates.length} promoted=${promoted.length}`,
    );
    return { mode, tensions, aggregated, candidates, promoted, cycleAt };
  }

  /**
   * UTP-GOAL-AGG-001: multidimensional aggregation per entity, weighted
   * by dimension (commercial dominance per Camada III + B0.1).
   */
  private aggregate(tensions: readonly Tension[]): readonly AggregatedTension[] {
    const acc = new Map<
      string,
      {
        weighted: number;
        contribs: Tension[];
        workspaceId?: string;
        entityRef?: { entityType: string; entityId: string };
        dominantDim: { dim: Tension['dimension']; score: number };
      }
    >();
    for (const t of tensions) {
      const key = entityKey(t);
      const cur = acc.get(key);
      const w = DIMENSION_WEIGHT[t.dimension] * t.severity;
      if (cur) {
        cur.weighted += w;
        cur.contribs.push(t);
        if (w > cur.dominantDim.score) {
          cur.dominantDim = { dim: t.dimension, score: w };
        }
      } else {
        acc.set(key, {
          weighted: w,
          contribs: [t],
          ...(t.workspaceId !== undefined ? { workspaceId: t.workspaceId } : {}),
          ...(t.entityRef !== undefined ? { entityRef: t.entityRef } : {}),
          dominantDim: { dim: t.dimension, score: w },
        });
      }
    }
    return [...acc.entries()].map(([key, v]) => {
      const a: AggregatedTension = {
        key,
        weightedSeverity: v.weighted,
        contributingTensions: v.contribs,
        dominantDimension: v.dominantDim.dim,
        ...(v.workspaceId !== undefined ? { workspaceId: v.workspaceId } : {}),
        ...(v.entityRef !== undefined ? { entityRef: v.entityRef } : {}),
      };
      return a;
    });
  }

  /**
   * UTP-GOAL-EMERGE-001: candidates above threshold become goals.
   * Impact = aggregated severity. Viability default = 0.7. Risk default
   * = 0.2. Score = impact * viability * (1 - risk).
   */
  private emerge(
    aggregated: readonly AggregatedTension[],
    threshold: number,
    nowMs: number,
  ): readonly GoalCandidate[] {
    const out: GoalCandidate[] = [];
    for (const a of aggregated) {
      if (a.weightedSeverity < threshold) continue;
      const impact = Math.min(1, a.weightedSeverity);
      const viability = a.dominantDimension === 'cognitive' ? 0.6 : 0.75;
      const risk = a.dominantDimension === 'financial' ? 0.3 : 0.2;
      const score = impact * viability * (1 - risk);
      const summary = `${a.dominantDimension}: ${a.contributingTensions[0]?.description ?? 'tensão agregada'}`;
      const candidate: GoalCandidate = {
        goalId: makeGoalId(),
        summary,
        ...(a.workspaceId !== undefined ? { workspaceId: a.workspaceId } : {}),
        ...(a.entityRef !== undefined ? { entityRef: a.entityRef } : {}),
        emergedAt: new Date(nowMs).toISOString(),
        impact,
        viability,
        risk,
        score,
        evidenceEventIds: a.contributingTensions.flatMap((t) => t.evidenceEventIds),
        contributingTensions: a.contributingTensions,
      };
      out.push(candidate);
    }
    return out;
  }

  /**
   * UTP-GOAL-SELECT-001: rank by score and cap to topK.
   */
  private select(
    candidates: readonly GoalCandidate[],
    topK: number,
  ): readonly GoalCandidate[] {
    return [...candidates].sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * UTP-GOAL-SURVIVE-001: prune live goals not refreshed within TTL.
   * Returns IDs that were demoted.
   */
  public pruneStale(nowMs: number, ttlMs = 24 * 60 * 60 * 1000): readonly string[] {
    const stale: string[] = [];
    for (const [id, g] of this.liveGoals) {
      if (nowMs - g.lastSeenMs > ttlMs) {
        stale.push(id);
        this.liveGoals.delete(id);
      }
    }
    if (stale.length > 0) {
      this.logger.log(`goal-field demoted ${stale.length} stale goal(s)`);
    }
    return stale;
  }

  /**
   * UTP-GOAL-SHADOW-001 / UTP-GOAL-PROMOTE-001:
   * When a workspace has a shadow accumulator, only goals belonging to
   * promotion-eligible workspaces (or global goals with no workspaceId)
   * pass through. Goals tied to non-eligible workspaces stay in shadow.
   */
  private gateByShadowEligibility(
    candidates: readonly GoalCandidate[],
    nowMs: number,
  ): readonly GoalCandidate[] {
    if (!this.shadowAccumulator) return candidates;
    const promoted: GoalCandidate[] = [];
    const blocked: GoalCandidate[] = [];
    for (const c of candidates) {
      if (
        !c.workspaceId ||
        this.shadowAccumulator.isPromotionEligible(c.workspaceId, nowMs)
      ) {
        promoted.push(c);
      } else {
        blocked.push(c);
      }
    }
    if (blocked.length > 0) {
      this.logger.log(
        `goal-field shadow gate blocked ${blocked.length} goal(s) — workspace(s) not promotion-eligible`,
      );
    }
    return promoted;
  }

  public liveGoalCount(): number {
    return this.liveGoals.size;
  }
}
