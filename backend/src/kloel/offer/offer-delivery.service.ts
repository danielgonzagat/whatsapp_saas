/**
 * UTP-OFFER-009 — Offer Delivery Service.
 *
 * Chooses channel and timing for each offer insight based on its kind,
 * urgency (impactMultiplicative), confidence level, and maturity stage.
 * Non-deliverable insights are marked with a reason.
 */

import { Injectable } from '@nestjs/common';
import type {
  ChannelTiming,
  DeliveryDecision,
  MaturityStage,
  RankedOfferInsight,
  RecommendedChannel,
} from './offer.types';
import { channelPriority } from '../insight/insight-delivery.service';

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

@Injectable()
export class OfferDeliveryService {
  public decide(
    insight: RankedOfferInsight,
  ): DeliveryDecision {
    const channel = insight.recommendedChannel;

    if (channel === 'silent') {
      return {
        insight,
        deliver: false,
        reason: 'offer insight marked for silent delivery',
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
    insights: readonly RankedOfferInsight[],
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
