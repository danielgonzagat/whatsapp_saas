/**
 * UTP-HEALTHYMONEY-005 — Brand Wear Detector.
 *
 * Detects cumulative reputation and brand health signals from
 * operational events: chargeback trends, refund velocity,
 * handoff cascades, negative sentiment surges, and objection
 * repeat patterns.
 *
 * Implements B0.7: desgaste de marca como redutor de qualidade
 * de receita. Kloel pode recusar venda ruim para proteger marca.
 */
import type { SpineEventRef } from '../mind/mind.types';
import type { BrandWearSignal, BrandWearSignalKind } from './healthy-money.types';
import { countEvents, clampScore } from './healthy-money.types';

export interface BrandWearInput {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly windowDays: number;
  readonly nowMs: number;
}

export function detectBrandWear(input: BrandWearInput): BrandWearSignal {
  const refunded = countEvents(input.events, 'commerce.payment.refunded');
  const chargedBack = countEvents(input.events, 'commerce.payment.charged_back');
  const handoffs = countEvents(input.events, 'commerce.whatsapp.handoff_to_human');
  const objections = countEvents(input.events, 'commerce.lead.objection_raised');
  const churnRisks = countEvents(input.events, 'commerce.post_sale.churn_risk_detected');
  const approved = countEvents(input.events, 'commerce.payment.approved');
  const lost = countEvents(input.events, 'commerce.lead.lost');

  const signals: BrandWearSignalKind[] = [];

  if (refunded > 0 && approved > 0 && refunded / approved > 0.15) {
    signals.push('refund_velocity');
  }
  if (chargedBack > 0) {
    signals.push('chargeback_trend');
  }
  if (handoffs > Math.max(1, approved) * 0.5) {
    signals.push('handoff_cascade');
  }
  if (objections > Math.max(1, approved) * 0.3) {
    signals.push('repeat_objection');
  }
  if (churnRisks > Math.max(1, approved) * 0.1) {
    signals.push('churn_acceleration');
  }
  if (lost > approved && approved > 0) {
    signals.push('conversation_dropout');
  }
  if (chargedBack >= 2 || refunded >= 5) {
    signals.push('reputation_flag');
  }

  const refundSeverity = approved > 0 ? Math.min(1, refunded / approved) : 0;
  const chargebackSeverity = chargedBack > 0 ? Math.min(1, chargedBack * 0.5) : 0;
  const handoffSeverity = approved > 0 ? Math.min(1, (handoffs / Math.max(1, approved)) * 0.5) : 0;
  const objectionSeverity =
    approved > 0 ? Math.min(1, (objections / Math.max(1, approved)) * 0.3) : 0;
  const churnSeverity = approved > 0 ? Math.min(1, (churnRisks / Math.max(1, approved)) * 0.4) : 0;

  const rawWear =
    refundSeverity * 0.25 +
    chargebackSeverity * 0.3 +
    handoffSeverity * 0.2 +
    objectionSeverity * 0.15 +
    churnSeverity * 0.1;

  const brandWearScore = clampScore(rawWear);
  const wearThresholdExceeded = brandWearScore >= 0.7;

  const recoveryDaysEstimated = Math.round(brandWearScore * 30);

  return {
    workspaceId: input.workspaceId,
    brandWearScore: Math.round(brandWearScore * 100) / 100,
    wearThresholdExceeded,
    signals,
    cumulativeWearDays: input.windowDays,
    recoveryDaysEstimated,
    assessedAt: new Date(input.nowMs).toISOString(),
  };
}
