import { Injectable } from '@nestjs/common';
import type { TestimonialReadiness, DetectionInput } from './postsale-consumers.types';
import { clamp, daysSince, filterByWorkspace, latestEvent } from './postsale-consumers.types';

const MIN_DAYS_SINCE_PURCHASE = 7;
const MAX_DAYS_SINCE_PURCHASE = 60;
const SATISFACTION_WINDOW_DAYS = 14;
const RECENCY_BONUS_DAYS = 21;

@Injectable()
export class TestimonialTimingAdvisor {
  public assess(input: DetectionInput): TestimonialReadiness {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);
    const entityRef = input.entityRef ?? { entityType: 'customer', entityId: 'unknown' };
    const reasons: string[] = [];
    let readinessScore = 0;

    const payment = latestEvent(wsEvents, 'commerce.payment.approved');
    if (!payment) {
      return finalize(
        input.workspaceId,
        entityRef,
        false,
        0,
        ['no_purchase_detected'],
        'silent',
        nowMs,
      );
    }

    const daysSincePayment = daysSince(payment.occurredAt, nowMs);
    if (daysSincePayment < MIN_DAYS_SINCE_PURCHASE) {
      reasons.push('too_soon_after_purchase');
      return finalize(input.workspaceId, entityRef, false, 0, reasons, 'silent', nowMs);
    }

    if (daysSincePayment > MAX_DAYS_SINCE_PURCHASE) {
      reasons.push('purchase_too_old');
      return finalize(input.workspaceId, entityRef, false, 0.1, reasons, 'silent', nowMs);
    }

    if (daysSincePayment <= RECENCY_BONUS_DAYS) {
      readinessScore += 0.2;
      reasons.push('recent_purchase');
    } else {
      readinessScore += 0.1;
    }

    const satisfaction = latestEvent(wsEvents, 'commerce.post_sale.satisfaction_signal_observed');
    if (satisfaction && daysSince(satisfaction.occurredAt, nowMs) < SATISFACTION_WINDOW_DAYS) {
      const payloadSentiment = satisfaction.payload?.['sentimentLabel'];
      if (payloadSentiment === 'positive') {
        readinessScore += 0.4;
        reasons.push('recent_positive_satisfaction');
      } else if (payloadSentiment === 'mixed') {
        readinessScore += 0.1;
        reasons.push('recent_mixed_satisfaction');
      }
    }

    const firstValue = latestEvent(wsEvents, 'commerce.post_sale.first_value_obtained');
    if (firstValue && daysSince(firstValue.occurredAt, nowMs) < RECENCY_BONUS_DAYS) {
      readinessScore += 0.25;
      reasons.push('first_value_obtained');
    }

    const memberProgress = wsEvents.filter(
      (e) =>
        e.eventName === 'commerce.member_area.progressed' && daysSince(e.occurredAt, nowMs) < 30,
    ).length;
    if (memberProgress >= 3) {
      readinessScore += 0.15;
      reasons.push('consistent_progress');
    }

    readinessScore = clamp(readinessScore, 0, 1);

    const ready = readinessScore >= 0.5;
    const suggestedChannel =
      readinessScore >= 0.7 ? 'whatsapp' : readinessScore >= 0.5 ? 'email' : 'silent';

    return finalize(
      input.workspaceId,
      entityRef,
      ready,
      readinessScore,
      reasons,
      suggestedChannel,
      nowMs,
    );
  }
}

function finalize(
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
