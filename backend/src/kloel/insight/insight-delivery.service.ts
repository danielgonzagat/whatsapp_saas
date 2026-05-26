/**
 * UTP-INSIGHT-DEL-001 — Insight Delivery Service.
 *
 * Chooses channel and timing for each insight based on its kind,
 * urgency (financial impact), confidence level, and maturity stage.
 * Non-deliverable insights are marked with a reason.
 */

import { Injectable } from '@nestjs/common';
import type {
  ChannelTiming,
  DeliveryDecision,
  MaturityStage,
  RankedInsight,
  RecommendedChannel,
} from './insight.types';

const STAGE_CHANNEL_FILTER: Readonly<Record<
  MaturityStage,
  readonly RecommendedChannel[]
>> = {
  validacao: ['whatsapp', 'email'],
  tracao: ['whatsapp', 'email', 'dashboard'],
  crescimento: ['whatsapp', 'email', 'dashboard'],
  maturidade: ['dashboard', 'report'],
  otimizacao: ['dashboard', 'report'],
};

/** Stable delivery-channel priority (whatsapp > email > dashboard > report > silent).
 *  Exported so peer delivery services (offer/...) consume the same ranking. */
export function channelPriority(channel: RecommendedChannel): number {
  switch (channel) {
    case 'whatsapp':
      return 5;
    case 'email':
      return 4;
    case 'dashboard':
      return 3;
    case 'report':
      return 2;
    case 'silent':
      return 1;
  }
}

@Injectable()
export class InsightDeliveryService {
  public decide(
    insight: RankedInsight,
  ): DeliveryDecision {
    const channel = insight.recommendedChannel;

    if (channel === 'silent') {
      return {
        insight,
        deliver: false,
        reason: 'insight marked for silent delivery',
      };
    }

    if (insight.maturityStage !== undefined) {
      const allowedChannels = STAGE_CHANNEL_FILTER[insight.maturityStage];
      if (allowedChannels && !allowedChannels.includes(channel)) {
        return {
          insight,
          deliver: false,
          reason: `channel ${channel} not appropriate for maturity stage ${insight.maturityStage}`,
        };
      }
    }

    return { insight, deliver: true };
  }

  public deliveryPlan(
    insights: readonly RankedInsight[],
  ): readonly ChannelTiming[] {
    const decisions = insights.map((i) => this.decide(i));
    const plans = new Map<string, ChannelTiming>();

    for (const d of decisions) {
      if (!d.deliver) continue;
      const i = d.insight;
      const channel = i.recommendedChannel;
      const timing = i.recommendedTiming;
      const priority = channelPriority(channel);

      const key = `${channel}:${timing}`;
      const existing = plans.get(key);
      if (!existing || priority > existing.priority) {
        plans.set(key, { channel, timing, priority });
      }
    }

    return Array.from(plans.values()).sort(
      (a, b) => b.priority - a.priority,
    );
  }
}
