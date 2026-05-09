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
  resolveAggressivenessDecision,
  resolveAudioVsTextDecision,
  resolveCouponDecision,
  resolveMessageFormatDecision,
  resolveObjectionResponseDecision,
  resolveToneDecision,
} from './mind-catalog-decision-resolvers';
import {
  resolveAdAlertActionDecision,
  resolveBroadcastWindowDecision,
  resolveChannelChoiceDecision,
  resolveHumanTransferDecision,
  resolveProductOfferDecision,
} from './mind-commercial-decision-resolvers';
import { KNOWN_DECISION_TYPES } from './mind-decision-baselines';

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

  async retrieveSimilar(input: {
    caseType?: string;
    features?: Record<string, unknown>;
    limit?: number;
    text: string;
    workspaceId: string;
  }) {
    return this.cases.similar(input);
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
    return resolveAggressivenessDecision(
      this.policy,
      workspaceId,
      domain,
      soldRate,
      repliedRate,
      revenuePerSignal,
    );
  }

  async resolveAudioVsText(
    workspaceId: string,
    channel: string,
    audioRatio: number,
  ): Promise<{ choice: string; confidence: number; fallback: boolean }> {
    return resolveAudioVsTextDecision(this.policy, this.cases, workspaceId, channel, audioRatio);
  }

  async resolveTone(
    workspaceId: string,
    channel: string,
    repliedRate: number,
    soldRate: number,
    segment?: string,
  ): Promise<{ tone: string; confidence: number; fallback: boolean }> {
    return resolveToneDecision(
      this.policy,
      this.cases,
      workspaceId,
      channel,
      repliedRate,
      soldRate,
      segment,
    );
  }

  async resolveMessageFormat(
    workspaceId: string,
    channel: string,
    concept: string,
    supports: string[] = ['text'],
  ): Promise<{ format: string; confidence: number; fallback: boolean }> {
    return resolveMessageFormatDecision(
      this.policy,
      this.cases,
      workspaceId,
      channel,
      concept,
      supports,
    );
  }

  async resolveObjectionResponse(
    workspaceId: string,
    channel: string,
    concept: string,
    priceBand: string,
    product?: string,
  ): Promise<{ strategy: string; confidence: number; fallback: boolean }> {
    return resolveObjectionResponseDecision(
      this.policy,
      this.cases,
      workspaceId,
      channel,
      concept,
      priceBand,
      product,
    );
  }

  async resolveCoupon(
    workspaceId: string,
    priceBand: string,
    soldRate: number,
    segment?: string,
  ): Promise<{ action: string; confidence: number; fallback: boolean }> {
    return resolveCouponDecision(
      this.policy,
      this.cases,
      workspaceId,
      priceBand,
      soldRate,
      segment,
    );
  }

  async resolveHumanTransfer(
    workspaceId: string,
    channel: string,
    concept: string,
    ticketRisk: number,
    options?: { escalationInProgress?: boolean; humanAvailable?: boolean },
  ): Promise<{ action: string; confidence: number; fallback: boolean }> {
    return resolveHumanTransferDecision(
      this.policy,
      workspaceId,
      channel,
      concept,
      ticketRisk,
      options,
    );
  }

  async resolveChannelChoice(
    workspaceId: string,
    availableChannels: string[],
    segment?: string,
    hour?: number,
    concept?: string,
  ): Promise<{ channel: string; confidence: number; fallback: boolean }> {
    return resolveChannelChoiceDecision(
      this.policy,
      workspaceId,
      availableChannels,
      segment,
      hour,
      concept,
    );
  }

  async resolveProductOffer(
    workspaceId: string,
    segment: string,
    concept: string,
    priceBand: string,
    lastPurchase?: string,
  ): Promise<{ offer: string; confidence: number; fallback: boolean }> {
    return resolveProductOfferDecision(
      this.policy,
      workspaceId,
      segment,
      concept,
      priceBand,
      lastPurchase,
    );
  }

  async resolveBroadcastWindow(
    workspaceId: string,
    channel: string,
    segment: string,
    weekday?: string,
    fatigue?: number,
  ): Promise<{ window: string; confidence: number; fallback: boolean }> {
    return resolveBroadcastWindowDecision(
      this.policy,
      workspaceId,
      channel,
      segment,
      weekday,
      fatigue,
    );
  }

  async resolveAdAlertAction(
    workspaceId: string,
    metric: string,
    window: number,
    threshold: string,
    campaign?: string,
  ): Promise<{ action: string; confidence: number; fallback: boolean }> {
    return resolveAdAlertActionDecision(
      this.policy,
      workspaceId,
      metric,
      window,
      threshold,
      campaign,
    );
  }
}
