import { Injectable } from '@nestjs/common';
import type {
  DetectionInput,
  ExpansionFit,
  ExpansionSignalKind,
  PostSaleDecisionControl,
} from './postsale-consumers.types';
import { clamp, daysSince, filterByWorkspaceAndEntity, latestEvent } from './postsale-consumers.types';

const EXPANSION_WINDOW_DAYS = 60;

@Injectable()
export class ExpansionFitDetector {
  public assess(input: DetectionInput): ExpansionFit {
    const nowMs = input.nowMs ?? Date.now();
    const entityRef = input.entityRef ?? { entityType: 'customer', entityId: 'unknown' };
    const wsEvents = filterByWorkspaceAndEntity(input.events, input.workspaceId, input.entityRef);
    const signals: ExpansionSignalKind[] = [];
    let fitScore = 0;

    const payment = latestEvent(wsEvents, 'commerce.payment.approved');
    if (!payment) {
      return build(input.workspaceId, entityRef, false, 0, [], undefined, nowMs);
    }

    const memberProgressCount = wsEvents.filter(
      (e) =>
        e.eventName === 'commerce.member_area.progressed' &&
        daysSince(e.occurredAt, nowMs) < EXPANSION_WINDOW_DAYS,
    ).length;
    if (memberProgressCount >= 3) {
      fitScore += 0.3;
      signals.push('feature_adoption');
    }

    const paymentCount = wsEvents.filter(
      (e) =>
        e.eventName === 'commerce.payment.approved' &&
        daysSince(e.occurredAt, nowMs) < EXPANSION_WINDOW_DAYS,
    ).length;
    if (paymentCount >= 2) {
      fitScore += 0.25;
      signals.push('volume_growth');
    }

    const dealWonCount = wsEvents.filter(
      (e) =>
        e.eventName === 'commerce.crm.deal_won' &&
        daysSince(e.occurredAt, nowMs) < EXPANSION_WINDOW_DAYS,
    ).length;
    if (dealWonCount >= 2) {
      fitScore += 0.2;
      signals.push('enterprise_readiness');
    }

    const satisfaction = latestEvent(wsEvents, 'commerce.post_sale.satisfaction_signal_observed');
    const hasPositiveSatisfaction =
      satisfaction &&
      daysSince(satisfaction.occurredAt, nowMs) < EXPANSION_WINDOW_DAYS &&
      satisfaction.payload?.['sentimentLabel'] === 'positive';
    if (hasPositiveSatisfaction) {
      fitScore += 0.15;
    }

    const firstValue = latestEvent(wsEvents, 'commerce.post_sale.first_value_obtained');
    const hasFirstValue =
      firstValue !== undefined && daysSince(firstValue.occurredAt, nowMs) < EXPANSION_WINDOW_DAYS;
    if (hasFirstValue) {
      fitScore += 0.1;
      signals.push('complementary_need');
    }

    const hasRefund = wsEvents.some(
      (e) =>
        e.eventName === 'commerce.payment.refunded' &&
        daysSince(e.occurredAt, nowMs) < EXPANSION_WINDOW_DAYS,
    );
    if (hasRefund) {
      fitScore -= 0.3;
    }

    fitScore = clamp(fitScore, 0, 1);
    const hasRecentObjection = wsEvents.some(
      (e) =>
        e.eventName === 'commerce.lead.objection_raised' &&
        daysSince(e.occurredAt, nowMs) < EXPANSION_WINDOW_DAYS,
    );
    const expansionReady =
      fitScore >= 0.5 && hasFirstValue && Boolean(hasPositiveSatisfaction) && !hasRecentObjection;

    const suggestedExpansionOffer =
      expansionReady && fitScore >= 0.7
        ? 'premium_plan'
        : expansionReady
          ? 'add_on_module'
          : undefined;

    return build(
      input.workspaceId,
      entityRef,
      expansionReady,
      fitScore,
      signals,
      suggestedExpansionOffer,
      nowMs,
    );
  }
}

function build(
  workspaceId: string,
  entityRef: { readonly entityType: string; readonly entityId: string },
  ready: boolean,
  score: number,
  signals: readonly ExpansionSignalKind[],
  offer: string | undefined,
  nowMs: number,
): ExpansionFit {
  const control = buildControl(ready, score, signals);
  return {
    workspaceId,
    entityRef,
    expansionReady: ready,
    fitScore: Math.round(score * 100) / 100,
    signals,
    suggestedExpansionOffer: offer,
    control,
    assessedAt: new Date(nowMs).toISOString(),
  };
}

function buildControl(
  ready: boolean,
  score: number,
  signals: readonly ExpansionSignalKind[],
): PostSaleDecisionControl {
  void score;
  if (ready) {
    return {
      riskClass: 'R2',
      delegationMode: 'owner_review',
      safeNextStep: 'Draft an expansion suggestion for owner review only after confirming value and satisfaction.',
      uncertainty:
        'Expansion fit is inferred from behavioral signals, not observed buyer intent for a larger offer.',
      leadOutcomeGuardrail:
        'Expansion must improve the customer outcome and never use urgency, pressure, or recent satisfaction as leverage.',
      rollback:
        'Cancel the expansion suggestion and return to silent monitoring if any confusion, objection, refund, or discomfort appears.',
    };
  }

  return {
    riskClass: 'R1',
    delegationMode: 'silent_monitoring',
    safeNextStep: 'Keep expansion closed and continue observing value, satisfaction, and usage signals.',
    uncertainty:
      signals.length > 0
        ? 'Usage signals exist, but the proof is not enough to treat expansion as healthy.'
        : 'No reliable expansion evidence is available yet.',
    leadOutcomeGuardrail:
      'Do not suggest an expansion offer without first-value proof and positive satisfaction for this customer.',
    rollback: 'Keep the offer hidden and route owner pressure back to value-first follow-up.',
  };
}
