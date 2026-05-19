/**
 * UTP-HEALTHYMONEY-003 — Refund Risk Projector.
 *
 * Projects refund risk based on historical refund and chargeback
 * rates, objection patterns, and handoff frequency. Outputs
 * estimated refund rate and monetary exposure.
 *
 * Implements B0.7: refund risk weighing on revenue quality.
 */
import type { SpineEventRef } from '../mind/mind.types';
import type { RefundRiskProjection } from './healthy-money.types';
import { countEvents } from './healthy-money.types';

export interface RefundRiskInput {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  readonly totalRevenueCents: number;
  readonly nowMs: number;
}

export function projectRefundRisk(input: RefundRiskInput): RefundRiskProjection {
  const refunded = countEvents(input.events, 'commerce.payment.refunded');
  const chargedBack = countEvents(input.events, 'commerce.payment.charged_back');
  const approved = countEvents(input.events, 'commerce.payment.approved');
  const objections = countEvents(input.events, 'commerce.lead.objection_raised');
  const handoffs = countEvents(input.events, 'commerce.whatsapp.handoff_to_human');

  const riskFactors: string[] = [];

  const baseRefundRate = approved > 0 ? (refunded + chargedBack) / approved : 0;

  const objectionMultiplier = 1 + Math.min(0.5, (objections / Math.max(1, approved)) * 0.3);
  const handoffMultiplier = 1 + Math.min(0.3, (handoffs / Math.max(1, approved)) * 0.2);

  const adjustedRate = baseRefundRate * objectionMultiplier * handoffMultiplier;
  const estimatedRefundRate = Math.min(1, adjustedRate);

  if (estimatedRefundRate > 0.5) {
    riskFactors.push('high_refund_rate');
  }
  if (chargedBack > 0) {
    riskFactors.push('chargeback_history');
  }
  if (objections > approved * 0.3) {
    riskFactors.push('elevated_objections');
  }
  if (handoffs > approved * 0.4) {
    riskFactors.push('frequent_handoffs');
  }

  const estimatedRefundCents = Math.round(input.totalRevenueCents * estimatedRefundRate);

  return {
    workspaceId: input.workspaceId,
    refundRiskScore: Math.round(estimatedRefundRate * 100) / 100,
    estimatedRefundRate: Math.round(estimatedRefundRate * 10000) / 10000,
    estimatedRefundCents,
    totalRevenueCents: input.totalRevenueCents,
    riskFactors,
    projectedAt: new Date(input.nowMs).toISOString(),
  };
}
