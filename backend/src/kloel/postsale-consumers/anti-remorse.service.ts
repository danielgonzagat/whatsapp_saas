import { Injectable } from '@nestjs/common';
import type { SpineEventRef } from '../mind/mind.types';
import type { AntiRemorseControl, AntiRemorseSignal, DetectionInput } from './postsale-consumers.types';
import {
  clamp,
  daysSince,
  filterByWorkspace,
  filterByWorkspaceAndEntity,
  latestEvent,
} from './postsale-consumers.types';

const REMORSE_WINDOW_HOURS = 24;
const OBJECTION_RECOVERY_LOOKBACK_HOURS = 48;
const HIGH_RISK_THRESHOLD = 0.6;
const RECENT_OBJECTION_RISK_WEIGHT = 0.6;

@Injectable()
export class AntiRemorseService {
  public assess(input: DetectionInput, refundRisk?: number): AntiRemorseSignal {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = input.entityRef
      ? filterByWorkspaceAndEntity(input.events, input.workspaceId, input.entityRef)
      : filterByWorkspace(input.events, input.workspaceId);
    const riskFactors: string[] = [];
    let remorseRiskScore = 0;

    const paymentEvent = latestEvent(wsEvents, 'commerce.payment.approved');
    const entityRef = input.entityRef ?? paymentEvent?.entityRef ?? { entityType: 'order', entityId: 'unknown' };
    if (!paymentEvent) {
      return finalize(input.workspaceId, entityRef, '', 0, [], false, 'monitor', nowMs);
    }

    const hoursSincePayment = daysSince(paymentEvent.occurredAt, nowMs) * 24;
    if (hoursSincePayment > REMORSE_WINDOW_HOURS) {
      return finalize(input.workspaceId, entityRef, paymentEvent.eventId, 0, [], false, 'none', nowMs);
    }

    const objectionRecoveryDetected = hasRecentPriorObjection(wsEvents, paymentEvent, entityRef);
    if (objectionRecoveryDetected) {
      remorseRiskScore += RECENT_OBJECTION_RISK_WEIGHT;
      riskFactors.push('recent_objection_before_purchase');
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
      objectionRecoveryDetected || remorseRiskScore >= HIGH_RISK_THRESHOLD
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
      objectionRecoveryDetected,
      recommendedAction,
      nowMs,
    );
  }
}

function hasRecentPriorObjection(
  events: readonly SpineEventRef[],
  paymentEvent: SpineEventRef,
  entityRef: { readonly entityType: string; readonly entityId: string },
): boolean {
  const paymentTs = Date.parse(paymentEvent.occurredAt);
  if (!Number.isFinite(paymentTs)) {
    return false;
  }

  return events.some((event) => {
    if (
      event.eventName !== 'commerce.lead.objection_raised' ||
      event.entityRef?.entityType !== entityRef.entityType ||
      event.entityRef?.entityId !== entityRef.entityId
    ) {
      return false;
    }

    const objectionTs = Date.parse(event.occurredAt);
    if (!Number.isFinite(objectionTs) || objectionTs >= paymentTs) {
      return false;
    }

    const hoursBeforePayment = (paymentTs - objectionTs) / (1000 * 60 * 60);
    return hoursBeforePayment <= OBJECTION_RECOVERY_LOOKBACK_HOURS;
  });
}

function finalize(
  workspaceId: string,
  entityRef: { readonly entityType: string; readonly entityId: string },
  paymentEventId: string,
  score: number,
  riskFactors: readonly string[],
  objectionRecoveryDetected: boolean,
  recommendedAction: AntiRemorseSignal['recommendedAction'],
  nowMs: number,
): AntiRemorseSignal {
  return {
    workspaceId,
    entityRef,
    paymentEventId,
    remorseRiskScore: Math.round(score * 100) / 100,
    riskFactors,
    objectionRecoveryDetected,
    recommendedAction,
    control: buildControl(recommendedAction, objectionRecoveryDetected),
    assessedAt: new Date(nowMs).toISOString(),
  };
}

function buildControl(
  recommendedAction: AntiRemorseSignal['recommendedAction'],
  objectionRecoveryDetected: boolean,
): AntiRemorseControl {
  switch (recommendedAction) {
    case 'send_reassurance':
      return {
        riskClass: 'R2',
        requiresHumanApproval: true,
        safeNextStep: objectionRecoveryDetected
          ? 'Draft an owner-reviewed reassurance message that respects the previously resolved objection, resets expectations, and points to first value without urgency or upsell.'
          : 'Draft a reassurance message for owner review that confirms expectations, offers help, and avoids urgency or upsell.',
        leadOutcomeGuardrail: objectionRecoveryDetected
          ? 'Customer must feel the prior concern was respected and not reopened as pressure; do not imply blame, urgency, or a need to justify the purchase.'
          : 'Customer must leave more certain about what they bought, what happens next, and how to get help; do not pressure, upsell, or imply blame.',
        rollback: objectionRecoveryDetected
          ? 'If the owner rejects the draft, the customer signals regret, or first-value evidence stays absent, do not send and keep the case in human review.'
          : 'If confidence is low or the owner rejects the draft, do not send; keep the case in human review and monitor for refund or support signals.',
        ...(objectionRecoveryDetected
          ? {
              objectionRecoveryGuardrail:
                'Do not classify the purchase as no-regret until first value or explicit satisfaction evidence appears.',
            }
          : {}),
      };

    case 'send_welcome':
      return {
        riskClass: 'R2',
        requiresHumanApproval: false,
        safeNextStep:
          'Prepare a short welcome message that sets the first useful step and keeps the owner able to pause outbound sending.',
        leadOutcomeGuardrail:
          'Customer must get clarity on first value without being pushed into another purchase or extra commitment.',
        rollback:
          'If the customer replies with confusion, refund intent, or support friction, pause automation and escalate to a human.',
      };

    case 'monitor':
      return {
        riskClass: 'R1',
        requiresHumanApproval: false,
        safeNextStep: 'Stay silent and keep watching for support, refund, inactivity, or satisfaction signals.',
        leadOutcomeGuardrail:
          'Avoid adding noise when the customer has not shown remorse risk; silence is safer than a weak post-sale touch.',
        rollback: 'If a new risk signal appears, reassess before recommending each outbound message.',
      };

    case 'none':
    default:
      return {
        riskClass: 'R1',
        requiresHumanApproval: false,
        safeNextStep: 'No anti-remorse action is needed because the remorse window has passed.',
        leadOutcomeGuardrail:
          'Do not reopen a settled post-sale moment without fresh evidence of confusion, risk, or support need.',
        rollback: 'Keep the customer in normal post-sale monitoring.',
      };
  }
}
