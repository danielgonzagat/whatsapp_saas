import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { StructuredLogger } from '../../../logging/structured-logger';
import { PrismaService } from '../../../prisma/prisma.service';
import { MindSurpriseService } from '../inference/mind-surprise.service';
import { SpineEmitterService } from '../../spine/spine-emitter.service';

const MAX_CASES = 500;
const RECENCY_HALF_LIFE_MS = 7 * 24 * 3600 * 1000;
const DEFAULT_CONFIDENCE = 0.5;
const SIMILARITY_THRESHOLD = 0.3;
const EDGE_LEARNING_RATE = 0.3;

const TOKEN_RE = /[\p{L}\p{N}]+/gu;

function tokenize(text: string): string[] {
  const matches: string[] = text.toLowerCase().match(TOKEN_RE) ?? [];
  return Array.from(new Set(matches.filter((token) => token.length > 2))).slice(0, 80);
}

function jaccard(left: string[], right: string[]): number {
  const l = new Set(left);
  const r = new Set(right);
  const intersection = [...l].filter((token) => r.has(token)).length;
  const union = new Set([...l, ...r]).size;
  return union > 0 ? intersection / union : 0;
}

function recencyWeight(occurredAt: Date, now: number): number {
  const ageMs = now - occurredAt.getTime();
  return Math.exp(-(Math.log(2) * ageMs) / RECENCY_HALF_LIFE_MS);
}

interface EffectEntry {
  effect: string;
  totalWeight: number;
  outcomeSum: number;
  count: number;
}

@Injectable()
export class MindCausalModelService {
  private readonly logger = StructuredLogger.from(MindCausalModelService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly surprise?: MindSurpriseService,
    @Optional() private readonly spine?: SpineEmitterService,
  ) {
    this.logger.debug?.('MindCausalModelService initialized');
  }

  async inferCausality(
    workspaceId: string,
    action: string,
  ): Promise<{
    likelyEffects: Array<{ effect: string; confidence: number }>;
    basis: string;
  }> {
    try {
      const cases = await this.prisma.mindCase.findMany({
        where: { workspaceId, action },
        orderBy: { occurredAt: 'desc' },
        take: MAX_CASES,
      });

      if (cases.length === 0) {
        await this.emitInferred(workspaceId, action, [], 'no_historical_data');
        return { likelyEffects: [], basis: 'no_historical_data' };
      }

      const now = Date.now();
      const effectMap = new Map<string, EffectEntry>();

      for (const c of cases) {
        const rw = recencyWeight(c.occurredAt, now);
        const surpriseWeight = this.surprise
          ? this.surprise.computeSurprise(
              c.outcome != null ? Math.min(1, Math.max(0, c.outcome)) : 0.5,
              c.outcome != null && c.outcome > 0.5 ? 1 : 0,
            )
          : 1;
        const weight = rw * (1 + surpriseWeight * 0.5);

        const effect = c.caseType;
        const entry = effectMap.get(effect) ?? {
          effect,
          totalWeight: 0,
          outcomeSum: 0,
          count: 0,
        };
        entry.totalWeight += weight;
        if (c.outcome != null) {
          entry.outcomeSum += c.outcome * weight;
        }
        entry.count += 1;
        effectMap.set(effect, entry);
      }

      const totalWeight = [...effectMap.values()].reduce((s, e) => s + e.totalWeight, 0);
      const likelyEffects = [...effectMap.values()]
        .map((entry) => ({
          effect: entry.effect,
          confidence:
            totalWeight > 0
              ? Math.min(0.95, DEFAULT_CONFIDENCE + (entry.totalWeight / totalWeight) * 0.45)
              : DEFAULT_CONFIDENCE,
        }))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 10);

      const basis =
        cases.length >= 10
          ? 'strong_historical_pattern'
          : cases.length >= 3
            ? 'moderate_historical_pattern'
            : 'weak_historical_signal';

      await this.emitInferred(workspaceId, action, likelyEffects, basis);

      this.logger.log(
        `Causal inference workspace=${workspaceId} action="${action}" effects=${likelyEffects.length} basis=${basis}`,
      );

      return { likelyEffects, basis };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Causal inference failed workspace=${workspaceId}: ${message}`);
      return { likelyEffects: [], basis: 'error' };
    }
  }

  async simulateScenario(
    workspaceId: string,
    hypotheticalAction: string,
  ): Promise<{ expectedOutcome: string; uncertainty: number }> {
    try {
      const cases = await this.prisma.mindCase.findMany({
        where: { workspaceId },
        orderBy: { occurredAt: 'desc' },
        take: MAX_CASES,
      });

      if (cases.length === 0) {
        await this.emitSimulated(workspaceId, hypotheticalAction, 'unknown', 1.0);
        return { expectedOutcome: 'unknown', uncertainty: 1.0 };
      }

      const hTokens = tokenize(hypotheticalAction);
      if (hTokens.length === 0) {
        return { expectedOutcome: 'unknown', uncertainty: 1.0 };
      }

      const scored = cases
        .map((c) => ({
          case: c,
          sim: jaccard(hTokens, tokenize(c.action)),
        }))
        .filter((s) => s.sim >= SIMILARITY_THRESHOLD)
        .sort((a, b) => b.sim - a.sim);

      if (scored.length === 0) {
        await this.emitSimulated(workspaceId, hypotheticalAction, 'unknown', 1.0);
        return { expectedOutcome: 'unknown', uncertainty: 1.0 };
      }

      const now = Date.now();
      let weightedOutcome = 0;
      let totalWeight = 0;

      for (const s of scored.slice(0, 20)) {
        const rw = recencyWeight(s.case.occurredAt, now);
        const weight = rw * s.sim;
        if (s.case.outcome != null) {
          weightedOutcome += s.case.outcome * weight;
        }
        totalWeight += weight;
      }

      const avgOutcome = totalWeight > 0 ? weightedOutcome / totalWeight : 0.5;
      const uncertainty = scored.length < 3 ? 0.7 : scored.length < 10 ? 0.4 : 0.2;

      const outcomeLabel =
        avgOutcome > 0.7
          ? 'highly_positive'
          : avgOutcome > 0.5
            ? 'positive'
            : avgOutcome > 0.3
              ? 'neutral'
              : 'negative';

      await this.emitSimulated(workspaceId, hypotheticalAction, outcomeLabel, uncertainty);

      return { expectedOutcome: outcomeLabel, uncertainty };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Scenario simulation failed workspace=${workspaceId}: ${message}`);
      return { expectedOutcome: 'unknown', uncertainty: 1.0 };
    }
  }

  /**
   * BeliefGraph edge-weight updater (Y-7 world-model / causal pillar).
   *
   * Records an OBSERVED effect — action X led to outcome Y — as a directed,
   * reinforced edge in MindGraphEdge. The edge is keyed on the schema's unique
   * tuple ([workspaceId, fromNode, relation, toNode]) so repeated observations
   * upsert idempotently and accumulate strength rather than duplicating rows.
   *
   * Strength model (append-only, never destructive):
   *   - `samples` increments by 1 each observation.
   *   - `weight` (the edge "strength") is reinforced toward the observed
   *     outcome via a bounded exponential moving average so a single noisy
   *     observation cannot dominate, yet sustained signal raises confidence.
   *
   * Fail-open: any persistence error is logged and swallowed — a broken graph
   * write must never abort the mind tick.
   */
  async recordObservedEffect(
    workspaceId: string,
    action: string,
    effect: string,
    outcome: number,
  ): Promise<{ recorded: boolean; weight: number | null }> {
    if (!workspaceId || !action || !effect) {
      return { recorded: false, weight: null };
    }
    const observed = Math.min(1, Math.max(0, Number.isFinite(outcome) ? outcome : 0.5));
    const fromNode = `action:${action}`;
    const toNode = `effect:${effect}`;
    const relation = 'causes';

    try {
      const existing = await this.prisma.mindGraphEdge.findUnique({
        where: {
          workspaceId_fromNode_relation_toNode: {
            workspaceId,
            fromNode,
            relation,
            toNode,
          },
        },
        select: { weight: true, samples: true },
      });

      let nextWeight: number;
      let nextSamples: number;
      if (existing) {
        // Bounded EMA reinforcement toward the observed outcome.
        nextWeight = Math.min(
          1,
          Math.max(0, existing.weight * (1 - EDGE_LEARNING_RATE) + observed * EDGE_LEARNING_RATE),
        );
        nextSamples = existing.samples + 1;
        await this.prisma.mindGraphEdge.update({
          where: {
            workspaceId_fromNode_relation_toNode: {
              workspaceId,
              fromNode,
              relation,
              toNode,
            },
          },
          data: { weight: nextWeight, samples: nextSamples },
        });
      } else {
        nextWeight = observed;
        nextSamples = 1;
        await this.prisma.mindGraphEdge.create({
          data: {
            id: randomUUID(),
            workspaceId,
            fromNode,
            relation,
            toNode,
            weight: nextWeight,
            samples: nextSamples,
          },
        });
      }

      await this.spine?.emit({
        eventName: 'cognition.causal.edge_reinforced',
        workspaceId,
        truthMode: 'observed',
        provenance: {
          source: 'production',
          processor: 'MindCausalModelService',
          processorVersion: '1.0.0',
          schemaVersion: '1.0',
        },
        payload: { action, effect, outcome: observed, weight: nextWeight, samples: nextSamples },
      });

      this.logger.log(
        `Causal edge reinforced workspace=${workspaceId} ${fromNode}->${toNode} weight=${nextWeight.toFixed(
          3,
        )} samples=${nextSamples}`,
      );
      return { recorded: true, weight: nextWeight };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`recordObservedEffect failed workspace=${workspaceId}: ${message}`);
      return { recorded: false, weight: null };
    }
  }

  private async emitInferred(
    workspaceId: string,
    action: string,
    effects: Array<{ effect: string; confidence: number }>,
    basis: string,
  ): Promise<void> {
    await this.spine?.emit({
      eventName: 'cognition.causal.inferred',
      workspaceId,
      truthMode: 'inferred',
      provenance: {
        source: 'production',
        processor: 'MindCausalModelService',
        processorVersion: '1.0.0',
        schemaVersion: '1.0',
      },
      payload: { action, likelyEffects: effects, basis },
    });
  }

  private async emitSimulated(
    workspaceId: string,
    hypotheticalAction: string,
    expectedOutcome: string,
    uncertainty: number,
  ): Promise<void> {
    await this.spine?.emit({
      eventName: 'cognition.causal.simulated',
      workspaceId,
      truthMode: 'inferred',
      provenance: {
        source: 'production',
        processor: 'MindCausalModelService',
        processorVersion: '1.0.0',
        schemaVersion: '1.0',
      },
      payload: { hypotheticalAction, expectedOutcome, uncertainty },
    });
  }
}
