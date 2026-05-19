/**
 * UTP-HEALTHYMONEY-008 — Healthy vs Unhealthy Dashboard.
 *
 * Aggregator that composes the full dashboard payload:
 * revenue quality breakdown, active blocks, brand wear signal,
 * and all three projections (margin, refund, support).
 *
 * Implements B0.7: dashboard receita boa vs ruim.
 */
import type {
  BrandWearSignal,
  HealthyVsUnhealthyDashboard,
  MarginProjection,
  RefundRiskProjection,
  RevenueQualityScore,
  SupportCostProjection,
  UnhealthySaleBlock,
  RevenueQualityTier,
} from './healthy-money.types';

export interface DashboardInput {
  readonly qualityScore: RevenueQualityScore;
  readonly activeBlocks: readonly UnhealthySaleBlock[];
  readonly brandWear?: BrandWearSignal | undefined;
  readonly marginProjection?: MarginProjection | undefined;
  readonly refundProjection?: RefundRiskProjection | undefined;
  readonly supportProjection?: SupportCostProjection | undefined;
  readonly nowMs: number;
}

export function buildDashboard(input: DashboardInput): HealthyVsUnhealthyDashboard {
  const score = input.qualityScore;

  const qualityBreakdown: Record<RevenueQualityTier, number> = {
    excellent: 0,
    good: 0,
    neutral: 0,
    caution: 0,
    toxic: 0,
  };
  qualityBreakdown[score.tier] = score.totalRevenueCents;

  const healthyRatio =
    score.totalRevenueCents > 0
      ? Math.round((score.healthyRevenueCents / score.totalRevenueCents) * 100) / 100
      : 0;

  return {
    workspaceId: score.workspaceId,
    windowStart: score.assessmentWindowStart,
    windowEnd: score.assessmentWindowEnd,
    totalRevenueCents: score.totalRevenueCents,
    healthyRevenueCents: score.healthyRevenueCents,
    unhealthyRevenueCents: score.unhealthyRevenueCents,
    healthyRatio,
    qualityBreakdown,
    activeBlocks: input.activeBlocks,
    brandWear: input.brandWear,
    refundProjection: input.refundProjection,
    marginProjection: input.marginProjection,
    supportProjection: input.supportProjection,
    generatedAt: new Date(input.nowMs).toISOString(),
  };
}
