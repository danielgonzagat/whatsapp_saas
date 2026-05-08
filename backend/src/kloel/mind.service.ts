import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MindBeliefService } from './mind-belief.service';
import { MindCaseMemoryService } from './mind-case-memory.service';
import { MindEventProcessorService } from './mind-event-processor.service';
import { MindPerceptionService } from './mind-perception.service';
import { MindPolicyService } from './mind-policy.service';
import { MindSurpriseService } from './mind-surprise.service';
import type { MindTick } from './mind.types';
import { MindWorkspaceStateService } from './mind-workspace-state.service';
import {
  KNOWN_DECISION_TYPES,
  TONE_OPTIONS,
  resolveAggressivenessBaseline,
  resolveAudioBaseline,
  resolveCouponBaseline,
  resolveToneBaseline,
} from './mind-decision-baselines';

function chosenConfidence(result: {
  chosen: string;
  decision: { candidates: Array<{ action: string; beliefMean: number }> };
}): number {
  return (
    result.decision.candidates.find((candidate) => candidate.action === result.chosen)
      ?.beliefMean ??
    result.decision.candidates[0]?.beliefMean ??
    0
  );
}

@Injectable()
export class MindService {
  private readonly logger = new Logger(MindService.name);
  private readonly watermarks = new Map<string, Date>();
  private readonly activeTicks = new Set<string>();

  constructor(
    private readonly perception: MindPerceptionService,
    private readonly surprise: MindSurpriseService,
    private readonly beliefs: MindBeliefService,
    private readonly policy: MindPolicyService,
    private readonly state: MindWorkspaceStateService,
    private readonly events: MindEventProcessorService,
    private readonly cases: MindCaseMemoryService,
  ) {}

  async tick(workspaceId: string): Promise<MindTick> {
    const empty: MindTick = {
      workspaceId,
      perceived: 0,
      predicted: 0,
      resolved: 0,
      surpriseTotal: 0,
      beliefsUpdated: 0,
      decisionsMade: 0,
      durationMs: 0,
    };

    const leaseOwner = randomUUID();
    if (this.activeTicks.has(workspaceId)) {
      return empty;
    }
    this.activeTicks.add(workspaceId);
    const leaseAcquired = await this.state.tryAcquireTickLease(workspaceId, leaseOwner);
    if (!leaseAcquired) {
      this.activeTicks.delete(workspaceId);
      return empty;
    }

    try {
      const startedAt = Date.now();
      const fallbackWatermark =
        this.watermarks.get(workspaceId) ?? new Date(Date.now() - 24 * 3600 * 1000);
      const watermark = await this.state.watermark(workspaceId, fallbackWatermark);
      const events = await this.perception.since(workspaceId, watermark);

      let predicted = 0;
      let resolved = 0;
      let surpriseTotal = 0;
      let beliefsUpdated = 0;

      for (const event of events) {
        const result = await this.events.process(event);
        predicted += result.predicted;
        resolved += result.resolved;
        surpriseTotal += result.surpriseTotal;
        beliefsUpdated += result.beliefsUpdated;
      }

      const expiredSurprise = await this.surprise.sweepExpired(workspaceId);
      if (expiredSurprise > 0) {
        surpriseTotal += expiredSurprise;
        beliefsUpdated += 1;
      }

      let decisionsMade = 0;
      for (const decisionType of KNOWN_DECISION_TYPES) {
        decisionsMade += await this.policy.sweepExpiredOutcomes({
          workspaceId,
          decisionType,
          maxAgeHours: 48,
          outcome: 0,
        });
      }

      const nextWatermark = events.length ? events[events.length - 1].occurredAt : watermark;

      this.watermarks.set(workspaceId, nextWatermark);

      const tick: MindTick = {
        workspaceId,
        perceived: events.length,
        predicted,
        resolved,
        surpriseTotal,
        beliefsUpdated,
        decisionsMade,
        durationMs: Date.now() - startedAt,
      };

      if (events.length > 0 || expiredSurprise > 0 || decisionsMade > 0) {
        this.logger.log(
          `tick workspace=${workspaceId} perceived=${tick.perceived} predicted=${predicted} resolved=${resolved} surprise=${surpriseTotal.toFixed(3)} decisions=${decisionsMade} ms=${tick.durationMs}`,
        );
      }

      await this.state.recordSuccess({
        tick,
        lastWatermark: nextWatermark,
        health: {
          status: 'ok',
          expiredSurprise,
          eventCount: events.length,
        },
      });
      return tick;
    } catch (error: unknown) {
      await this.state.recordFailure(workspaceId, error);
      throw error;
    } finally {
      this.activeTicks.delete(workspaceId);
      await this.state.releaseTickLease(workspaceId, leaseOwner);
    }
  }

  query(workspaceId: string, predicate: string, subject?: string) {
    return this.beliefs.list(workspaceId, predicate, subject);
  }

  lift(workspaceId: string, decisionType: string, sinceDays = 14) {
    return this.policy.harness(workspaceId, decisionType, sinceDays);
  }

  async resolveAggressiveness(
    workspaceId: string,
    domain: string,
    soldRate: number,
    repliedRate: number,
    revenuePerSignal: number,
  ): Promise<{ aggressiveness: string; confidence: number; fallback: boolean }> {
    const baseline = resolveAggressivenessBaseline(soldRate, repliedRate, revenuePerSignal);

    const options = [
      {
        action: 'LOW',
        predicate: 'P(outcome|aggressiveness)',
        context: { domain, aggressiveness: 'LOW' },
      },
      {
        action: 'MEDIUM',
        predicate: 'P(outcome|aggressiveness)',
        context: { domain, aggressiveness: 'MEDIUM' },
      },
      {
        action: 'HIGH',
        predicate: 'P(outcome|aggressiveness)',
        context: { domain, aggressiveness: 'HIGH' },
      },
    ];

    const outcomeKey = `cia_aggressiveness:${workspaceId}:${Date.now()}`;

    const result = await this.policy.choose({
      workspaceId,
      subject: `workspace:${workspaceId}`,
      decisionType: 'cia_aggressiveness',
      context: { domain, soldRate, repliedRate, revenuePerSignal },
      options,
      baseline: baseline,
      outcomeKey,
    });

    return {
      aggressiveness: result.chosen,
      confidence: chosenConfidence(result),
      fallback: result.decision.fallbackActive,
    };
  }

  async resolveAudioVsText(
    workspaceId: string,
    channel: string,
    audioRatio: number,
  ): Promise<{ choice: string; confidence: number; fallback: boolean }> {
    const baseline = resolveAudioBaseline(channel, audioRatio);

    const memoryAction = await this.fetchCaseMemoryAction({
      workspaceId,
      caseType: 'audio_vs_text',
      text: `channel ${channel} audioRatio ${audioRatio.toFixed(2)}`,
      features: { channel },
      options: ['audio', 'text'],
      minSimilarCases: 3,
      minSimilarityTotal: 1.2,
    });

    const effectiveBaseline = memoryAction ?? baseline;

    const result = await this.policy.choose({
      workspaceId,
      subject: `workspace:${workspaceId}`,
      decisionType: 'audio_vs_text',
      context: { channel, audioRatio },
      options: [
        {
          action: 'audio',
          predicate: 'P(reply|message_type,hour,channel)',
          context: { channel, message_type: 'audio' },
        },
        {
          action: 'text',
          predicate: 'P(reply|message_type,hour,channel)',
          context: { channel, message_type: 'text' },
        },
      ],
      baseline: effectiveBaseline,
      outcomeKey: `audio_vs_text:${workspaceId}:${Date.now()}`,
    });

    return {
      choice: result.chosen,
      confidence: chosenConfidence(result),
      fallback: result.decision.fallbackActive,
    };
  }

  async resolveTone(
    workspaceId: string,
    channel: string,
    repliedRate: number,
    soldRate: number,
    segment?: string,
  ): Promise<{ tone: string; confidence: number; fallback: boolean }> {
    const baseline = resolveToneBaseline(repliedRate, soldRate, channel);
    const context = segment ? { channel, segment } : { channel };

    const memoryAction = await this.fetchCaseMemoryAction({
      workspaceId,
      caseType: 'tom',
      text: `channel ${channel} repliedRate ${repliedRate.toFixed(2)} soldRate ${soldRate.toFixed(2)}${segment ? ` segment ${segment}` : ''}`,
      features: { channel, ...(segment ? { segment } : {}) },
      options: [...TONE_OPTIONS],
      minSimilarCases: 3,
      minSimilarityTotal: 1.2,
    });

    const effectiveBaseline = memoryAction ?? baseline;

    const result = await this.policy.choose({
      workspaceId,
      subject: `workspace:${workspaceId}`,
      decisionType: 'tom',
      context: { ...context, repliedRate, soldRate },
      options: TONE_OPTIONS.map((tone) => ({
        action: tone,
        predicate: 'P(reply|tone,objection_type,channel)',
        context: { ...context, tone },
      })),
      baseline: effectiveBaseline,
      outcomeKey: `tom:${workspaceId}:${Date.now()}`,
      utilitySuccess: 1,
      utilityFail: -0.1,
    });

    return {
      tone: result.chosen,
      confidence: chosenConfidence(result),
      fallback: result.decision.fallbackActive,
    };
  }

  async resolveCoupon(
    workspaceId: string,
    priceBand: string,
    soldRate: number,
    segment?: string,
  ): Promise<{ action: string; confidence: number; fallback: boolean }> {
    const baseline = resolveCouponBaseline(priceBand, soldRate);
    const context = segment ? { priceBand, segment } : { priceBand };

    const memoryAction = await this.fetchCaseMemoryAction({
      workspaceId,
      caseType: 'cupom',
      text: `priceBand ${priceBand} soldRate ${soldRate.toFixed(2)}${segment ? ` segment ${segment}` : ''}`,
      features: { priceBand, ...(segment ? { segment } : {}) },
      options: ['offer_coupon', 'no_coupon'],
      minSimilarCases: 3,
      minSimilarityTotal: 1.2,
    });

    const effectiveBaseline = memoryAction ?? baseline;

    const result = await this.policy.choose({
      workspaceId,
      subject: `workspace:${workspaceId}`,
      decisionType: 'cupom',
      context: { ...context, soldRate },
      options: [
        {
          action: 'offer_coupon',
          predicate: 'P(conversion|discount_offered,segment,price_band)',
          context: { ...context, discount_offered: 'yes' },
        },
        {
          action: 'no_coupon',
          predicate: 'P(conversion|discount_offered,segment,price_band)',
          context: { ...context, discount_offered: 'no' },
        },
      ],
      baseline: effectiveBaseline,
      outcomeKey: `cupom:${workspaceId}:${Date.now()}`,
      utilitySuccess: 1,
      utilityFail: -0.2,
    });

    return {
      action: result.chosen,
      confidence: chosenConfidence(result),
      fallback: result.decision.fallbackActive,
    };
  }

  private async fetchCaseMemoryAction(input: {
    caseType: string;
    features: Record<string, unknown>;
    minSimilarCases: number;
    minSimilarityTotal: number;
    options: readonly string[];
    text: string;
    workspaceId: string;
  }): Promise<string | null> {
    const similar = await this.cases.similar({
      workspaceId: input.workspaceId,
      caseType: input.caseType,
      text: input.text,
      features: input.features,
      limit: 30,
    });

    if (similar.length < input.minSimilarCases) {
      return null;
    }

    const actionScores = new Map<
      string,
      { similaritySum: number; outcomeSum: number; count: number }
    >();

    for (const row of similar) {
      if (!input.options.includes(row.action)) {
        continue;
      }

      const entry = actionScores.get(row.action) ?? {
        similaritySum: 0,
        outcomeSum: 0,
        count: 0,
      };

      entry.similaritySum += row.similarity;
      if (typeof row.outcome === 'number') {
        entry.outcomeSum += row.outcome;
      }
      entry.count += 1;

      actionScores.set(row.action, entry);
    }

    if (actionScores.size === 0) {
      return null;
    }

    let bestAction: string | null = null;
    let bestScore = -Infinity;

    for (const [action, entry] of actionScores) {
      const outcomeRate = entry.count > 0 ? entry.outcomeSum / entry.count : 0;
      const score = entry.similaritySum * 0.3 + outcomeRate * 0.7;

      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }

    const totalSimilarity = similar.reduce((sum, row) => sum + row.similarity, 0);
    if (totalSimilarity < input.minSimilarityTotal) {
      return null;
    }

    return bestAction;
  }
}
