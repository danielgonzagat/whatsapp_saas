/**
 * UTP-HEALTHYMONEY-001 — Revenue Quality Scorer.
 *
 * Scores the quality of revenue based on four signals:
 * margin health, refund risk, support cost burden, and brand wear.
 * Aggregates into a RevenueQualityScore with tier classification.
 *
 * Implements B0.7: revenue weighted by margin, refund risk,
 * projected support, churn, LTV, reputational risk, brand wear.
 */
import type { SpineEventRef } from '../mind/mind.types';
import type {
  RevenueQualityScore,
  BrandWearSignal,
  MarginProjection,
  RefundRiskProjection,
  SupportCostProjection,
} from './healthy-money.types';
import { clampScore, tierFromScore, countEvents } from './healthy-money.types';

export interface QualityScorerInput {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  readonly marginProjection?: MarginProjection | undefined;
  readonly refundProjection?: RefundRiskProjection | undefined;
  readonly supportProjection?: SupportCostProjection | undefined;
  readonly brandWear?: BrandWearSignal | undefined;
  readonly nowMs: number;
}

export function scoreRevenueQuality(input: QualityScorerInput): RevenueQualityScore {
  const approved = countEvents(input.events, 'commerce.payment.approved');
  const refunded = countEvents(input.events, 'commerce.payment.refunded');
  const chargedBack = countEvents(input.events, 'commerce.payment.charged_back');
  const declines = countEvents(input.events, 'commerce.payment.declined');
  const handoffs = countEvents(input.events, 'commerce.whatsapp.handoff_to_human');
  const objections = countEvents(input.events, 'commerce.lead.objection_raised');

  const rawRevenueEvents = approved;
  const totalRevenueEstimate = rawRevenueEvents * 10_000;

  const marginScore = input.marginProjection
    ? clampScore(input.marginProjection.projectedMarginPct / 100)
    : 0.5;

  const refundScore = computeRefundScore(refunded, chargedBack, approved);
  const supportScore = computeSupportBurdenScore(handoffs, objections, approved);
  const brandScore = input.brandWear ? clampScore(1 - input.brandWear.brandWearScore) : 0.8;

  const raw = marginScore * 0.3 + refundScore * 0.3 + supportScore * 0.2 + brandScore * 0.2;

  const adjustedScore = applyDecay(raw, declines, approved);
  const tier = tierFromScore(adjustedScore);

  const healthyRevenueCents = Math.round(totalRevenueEstimate * adjustedScore);
  const unhealthyRevenueCents = totalRevenueEstimate - healthyRevenueCents;

  return {
    workspaceId: input.workspaceId,
    assessmentWindowStart: new Date(input.windowStartMs).toISOString(),
    assessmentWindowEnd: new Date(input.windowEndMs).toISOString(),
    tier,
    aggregateScore: Math.round(adjustedScore * 100) / 100,
    marginScore: Math.round(marginScore * 100) / 100,
    refundRiskScore: Math.round(refundScore * 100) / 100,
    supportCostScore: Math.round(supportScore * 100) / 100,
    brandWearScore: Math.round(brandScore * 100) / 100,
    totalRevenueCents: totalRevenueEstimate,
    healthyRevenueCents,
    unhealthyRevenueCents,
    assessedAt: new Date(input.nowMs).toISOString(),
  };
}

function computeRefundScore(refunded: number, chargedBack: number, approved: number): number {
  if (approved === 0) {
    return 0.5;
  }
  const penaltyRatio = (refunded + chargedBack * 2) / approved;
  return clampScore(1 - penaltyRatio);
}

function computeSupportBurdenScore(handoffs: number, objections: number, approved: number): number {
  if (approved === 0) {
    return 0.5;
  }
  const burdenRatio = (handoffs * 0.5 + objections * 0.3) / approved;
  return clampScore(1 - burdenRatio);
}

function applyDecay(baseScore: number, declines: number, approved: number): number {
  if (approved === 0) {
    return baseScore;
  }
  const declinePenalty = Math.min(0.3, (declines / (approved + declines)) * 0.5);
  return clampScore(baseScore - declinePenalty);
}
