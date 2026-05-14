import { Injectable } from '@nestjs/common';
import type { ExpansionFit, ExpansionSignalKind, DetectionInput } from './postsale-consumers.types';
import { clamp, daysSince, filterByWorkspace, latestEvent } from './postsale-consumers.types';

const EXPANSION_WINDOW_DAYS = 60;

@Injectable()
export class ExpansionFitDetector {
  public assess(input: DetectionInput): ExpansionFit {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);
    const entityRef = input.entityRef ?? { entityType: 'customer', entityId: 'unknown' };
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
    if (
      satisfaction &&
      daysSince(satisfaction.occurredAt, nowMs) < EXPANSION_WINDOW_DAYS &&
      satisfaction.payload?.['sentimentLabel'] === 'positive'
    ) {
      fitScore += 0.15;
    }

    const firstValue = latestEvent(wsEvents, 'commerce.post_sale.first_value_obtained');
    if (firstValue && daysSince(firstValue.occurredAt, nowMs) < EXPANSION_WINDOW_DAYS) {
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
    const expansionReady = fitScore >= 0.5;

    const suggestedExpansionOffer =
      fitScore >= 0.7
        ? 'premium_plan'
        : fitScore >= 0.5
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
  return {
    workspaceId,
    entityRef,
    expansionReady: ready,
    fitScore: Math.round(score * 100) / 100,
    signals,
    suggestedExpansionOffer: offer,
    assessedAt: new Date(nowMs).toISOString(),
  };
}
