import { Injectable } from '@nestjs/common';
import type { TestimonialReadiness, DetectionInput } from './postsale-consumers.types';
import { clamp, daysSince, filterByWorkspace, latestEvent } from './postsale-consumers.types';

const REFERRAL_COOLDOWN_DAYS = 30;
const MIN_PURCHASE_DAYS = 5;
const MAX_REFERRAL_PROMPTS = 3;

@Injectable()
export class ReferralPromptTimingAdvisor {
  public assess(input: DetectionInput): TestimonialReadiness {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);
    const entityRef = input.entityRef ?? { entityType: 'customer', entityId: 'unknown' };
    const reasons: string[] = [];
    let readinessScore = 0;

    const payment = latestEvent(wsEvents, 'commerce.payment.approved');
    if (!payment) {
      return buildResult(input.workspaceId, entityRef, false, 0, ['no_purchase'], 'silent', nowMs);
    }

    const daysSincePayment = daysSince(payment.occurredAt, nowMs);
    if (daysSincePayment < MIN_PURCHASE_DAYS) {
      reasons.push('too_soon_for_referral');
      return buildResult(input.workspaceId, entityRef, false, 0, reasons, 'silent', nowMs);
    }

    const priorPrompts = wsEvents.filter(
      (e) =>
        e.eventName === 'commerce.post_sale.testimonial_requested' &&
        daysSince(e.occurredAt, nowMs) < REFERRAL_COOLDOWN_DAYS,
    ).length;
    if (priorPrompts >= MAX_REFERRAL_PROMPTS) {
      reasons.push('max_referral_prompts_reached');
      return buildResult(input.workspaceId, entityRef, false, 0.2, reasons, 'silent', nowMs);
    }

    readinessScore += 0.2;

    const firstValue = latestEvent(wsEvents, 'commerce.post_sale.first_value_obtained');
    if (firstValue && daysSince(firstValue.occurredAt, nowMs) < REFERRAL_COOLDOWN_DAYS) {
      readinessScore += 0.3;
      reasons.push('value_experienced');
    }

    const satisfaction = latestEvent(wsEvents, 'commerce.post_sale.satisfaction_signal_observed');
    if (
      satisfaction &&
      daysSince(satisfaction.occurredAt, nowMs) < REFERRAL_COOLDOWN_DAYS
    ) {
      const sentiment = satisfaction.payload?.['sentimentLabel'];
      if (sentiment === 'positive') {
        readinessScore += 0.35;
        reasons.push('positive_satisfaction');
      } else if (sentiment === 'mixed') {
        readinessScore += 0.1;
      }
    }

    const hasRecentPayment = wsEvents.some(
      (e) =>
        e.eventName === 'commerce.payment.approved' &&
        daysSince(e.occurredAt, nowMs) < 90,
    );
    if (hasRecentPayment) {
      readinessScore += 0.15;
      reasons.push('active_payments');
    }

    readinessScore = clamp(readinessScore, 0, 1);
    const ready = readinessScore >= 0.55;
    const channel = readinessScore >= 0.7 ? 'whatsapp' : readinessScore >= 0.55 ? 'email' : 'silent';

    return buildResult(input.workspaceId, entityRef, ready, readinessScore, reasons, channel, nowMs);
  }
}

function buildResult(
  workspaceId: string,
  entityRef: { readonly entityType: string; readonly entityId: string },
  ready: boolean,
  score: number,
  reasons: readonly string[],
  channel: TestimonialReadiness['suggestedChannel'],
  nowMs: number,
): TestimonialReadiness {
  return {
    workspaceId,
    entityRef,
    ready,
    readinessScore: Math.round(score * 100) / 100,
    reasons,
    suggestedChannel: channel,
    assessedAt: new Date(nowMs).toISOString(),
  };
}
