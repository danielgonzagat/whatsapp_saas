/**
 * UTP-HEALTHYMONEY-001..008 — Camada XIX (Healthy Money Optimization).
 *
 * Receita boa cresce e receita ruim cai simultaneamente.
 * Implements B0.7: otimizar dinheiro saudavel, nao volume bruto.
 *
 * Types: RevenueQualityScore, MarginProjection, RefundRiskProjection,
 * SupportCostProjection, BrandWearSignal, UnhealthySaleBlock, BlockerPolicy.
 */
import type { SpineEventRef } from '../mind/mind.types';

export type RevenueQualityTier = 'excellent' | 'good' | 'neutral' | 'caution' | 'toxic';

export interface RevenueQualityScore {
  readonly workspaceId: string;
  readonly assessmentWindowStart: string;
  readonly assessmentWindowEnd: string;
  readonly tier: RevenueQualityTier;
  readonly aggregateScore: number;
  readonly marginScore: number;
  readonly refundRiskScore: number;
  readonly supportCostScore: number;
  readonly brandWearScore: number;
  readonly totalRevenueCents: number;
  readonly healthyRevenueCents: number;
  readonly unhealthyRevenueCents: number;
  readonly assessedAt: string;
}

export interface MarginProjection {
  readonly workspaceId: string;
  readonly projectedMarginBps: number;
  readonly projectedMarginPct: number;
  readonly fixedCostCents: number;
  readonly variableCostCents: number;
  readonly revenueCents: number;
  readonly contributionMarginBps: number;
  readonly projectedAt: string;
}

export interface RefundRiskProjection {
  readonly workspaceId: string;
  readonly refundRiskScore: number;
  readonly estimatedRefundRate: number;
  readonly estimatedRefundCents: number;
  readonly totalRevenueCents: number;
  readonly riskFactors: readonly string[];
  readonly projectedAt: string;
}

export interface SupportCostProjection {
  readonly workspaceId: string;
  readonly estimatedSupportCostCents: number;
  readonly supportCostPerSaleCents: number;
  readonly expectedTicketCount: number;
  readonly estimatedHandleTimeMinutes: number;
  readonly costDrivers: readonly string[];
  readonly projectedAt: string;
}

export interface BrandWearSignal {
  readonly workspaceId: string;
  readonly brandWearScore: number;
  readonly wearThresholdExceeded: boolean;
  readonly signals: readonly BrandWearSignalKind[];
  readonly cumulativeWearDays: number;
  readonly recoveryDaysEstimated: number;
  readonly assessedAt: string;
}

export type BrandWearSignalKind =
  | 'repeat_objection'
  | 'chargeback_trend'
  | 'negative_sentiment_surge'
  | 'refund_velocity'
  | 'handoff_cascade'
  | 'conversation_dropout'
  | 'reputation_flag'
  | 'churn_acceleration';

export interface UnhealthySaleBlock {
  readonly blockId: string;
  readonly workspaceId: string;
  readonly entityRef: { readonly entityType: string; readonly entityId: string };
  readonly reason: BlockReason;
  readonly qualityScore: RevenueQualityScore;
  readonly blockedAt: string;
  readonly expiresAt: string | undefined;
  readonly reviewableBy: 'owner' | 'manager' | 'none';
}

export type BlockReason =
  | 'refund_risk_too_high'
  | 'support_cost_too_high'
  | 'brand_wear_critical'
  | 'margin_too_low'
  | 'quality_tier_toxic'
  | 'policy_rule_match';

export interface BlockerPolicy {
  readonly policyId: string;
  readonly workspaceId: string;
  readonly active: boolean;
  readonly rules: readonly BlockerPolicyRule[];
  readonly lastRevisedAt: string;
  readonly revisedBy: 'owner' | 'system';
}

export interface BlockerPolicyRule {
  readonly ruleId: string;
  readonly label: string;
  readonly condition: BlockerPolicyCondition;
  readonly action: 'block' | 'warn' | 'allow_with_notice';
  readonly priority: number;
}

export type BlockerPolicyCondition =
  | 'refund_risk_gte_50pct'
  | 'support_cost_gte_2000_cents'
  | 'margin_lt_20pct'
  | 'brand_wear_gte_70pct'
  | 'quality_tier_toxic'
  | 'first_sale_unknown_product';

export interface HealthyVsUnhealthyDashboard {
  readonly workspaceId: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly totalRevenueCents: number;
  readonly healthyRevenueCents: number;
  readonly unhealthyRevenueCents: number;
  readonly healthyRatio: number;
  readonly qualityBreakdown: Record<RevenueQualityTier, number>;
  readonly activeBlocks: readonly UnhealthySaleBlock[];
  readonly brandWear: BrandWearSignal | undefined;
  readonly refundProjection: RefundRiskProjection | undefined;
  readonly marginProjection: MarginProjection | undefined;
  readonly supportProjection: SupportCostProjection | undefined;
  readonly generatedAt: string;
}
export function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function tierFromScore(score: number): RevenueQualityTier {
  if (score >= 0.85) {
    return 'excellent';
  }
  if (score >= 0.7) {
    return 'good';
  }
  if (score >= 0.5) {
    return 'neutral';
  }
  if (score >= 0.3) {
    return 'caution';
  }
  return 'toxic';
}

export function countEvents(events: readonly SpineEventRef[], name: string): number {
  let c = 0;
  for (const e of events) {
    if (e.eventName === name) {
      c++;
    }
  }
  return c;
}
