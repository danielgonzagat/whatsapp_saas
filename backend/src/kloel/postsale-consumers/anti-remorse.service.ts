import { Injectable } from '@nestjs/common';
import type { AntiRemorseSignal, DetectionInput } from './postsale-consumers.types';
import { clamp, daysSince, filterByWorkspace, latestEvent } from './postsale-consumers.types';

const REMORSE_WINDOW_HOURS = 24;
const HIGH_RISK_THRESHOLD = 0.6;

@Injectable()
export class AntiRemorseService {
  public assess(input: DetectionInput, refundRisk?: number): AntiRemorseSignal {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);
    const entityRef = input.entityRef ?? { entityType: 'order', entityId: 'unknown' };
    const riskFactors: string[] = [];
    let remorseRiskScore = 0;

    const paymentEvent = latestEvent(wsEvents, 'commerce.payment.approved');
    if (!paymentEvent) {
      return finalize(input.workspaceId, entityRef, '', 0, [], 'monitor', nowMs);
    }

    const hoursSincePayment = daysSince(paymentEvent.occurredAt, nowMs) * 24;
    if (hoursSincePayment > REMORSE_WINDOW_HOURS) {
      return finalize(input.workspaceId, entityRef, paymentEvent.eventId, 0, [], 'none', nowMs);
    }

    if (hoursSincePayment > 0.5) {
      remorseRiskScore += 0.15;
      riskFactors.push('time_since_purchase');
    }

    const hasSupportContact = wsEvents.some(
      (e) =>
        e.eventName === 'commerce.whatsapp.handoff_to_human' && daysSince(e.occurredAt, nowMs) < 1,
    );
    if (hasSupportContact) {
      remorseRiskScore += 0.2;
      riskFactors.push('support_handoff');
    }

    if (refundRisk !== undefined && refundRisk > 0.3) {
      remorseRiskScore += 0.25;
      riskFactors.push('elevated_refund_risk');
    }

    const hasPriorRefund = wsEvents.some((e) => e.eventName === 'commerce.payment.refunded');
    if (hasPriorRefund) {
      remorseRiskScore += 0.1;
      riskFactors.push('prior_refund_history');
    }

    remorseRiskScore = clamp(remorseRiskScore, 0, 1);
    const recommendedAction =
      remorseRiskScore >= HIGH_RISK_THRESHOLD
        ? 'send_reassurance'
        : remorseRiskScore > 0
          ? 'send_welcome'
          : 'monitor';

    return finalize(
      input.workspaceId,
      entityRef,
      paymentEvent.eventId,
      remorseRiskScore,
      riskFactors,
      recommendedAction,
      nowMs,
    );
  }
}

function finalize(
  workspaceId: string,
  entityRef: { readonly entityType: string; readonly entityId: string },
  paymentEventId: string,
  score: number,
  riskFactors: readonly string[],
  recommendedAction: AntiRemorseSignal['recommendedAction'],
  nowMs: number,
): AntiRemorseSignal {
  return {
    workspaceId,
    entityRef,
    paymentEventId,
    remorseRiskScore: Math.round(score * 100) / 100,
    riskFactors,
    recommendedAction,
    assessedAt: new Date(nowMs).toISOString(),
  };
}
