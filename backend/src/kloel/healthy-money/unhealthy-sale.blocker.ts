/**
 * UTP-HEALTHYMONEY-006 — Unhealthy Sale Blocker.
 *
 * Evaluates whether a sale should be blocked based on the
 * active blocker policy and the current revenue quality score.
 * Generates an UnhealthySaleBlock when conditions are met.
 *
 * Implements B0.7: Kloel pode recusar venda ruim.
 * Blocker is owner-revisable via blocker-policy.service.ts.
 */
import { randomUUID } from 'node:crypto';
import type {
  BlockerPolicy,
  BlockerPolicyCondition,
  BlockerPolicyRule,
  RevenueQualityScore,
  UnhealthySaleBlock,
  BlockReason,
} from './healthy-money.types';

export interface BlockerInput {
  readonly qualityScore: RevenueQualityScore;
  readonly policy: BlockerPolicy;
  readonly entityRef: { readonly entityType: string; readonly entityId: string };
  readonly nowMs: number;
}

export function evaluateSaleBlock(input: BlockerInput): UnhealthySaleBlock | null {
  if (!input.policy.active) {
    return null;
  }

  const matchingRule = findMatchingRule(input.policy.rules, input.qualityScore);
  if (!matchingRule) {
    return null;
  }
  if (matchingRule.action === 'allow_with_notice') {
    return null;
  }

  const reason = conditionToReason(matchingRule.condition);

  return {
    blockId: `block_${randomUUID()}`,
    workspaceId: input.qualityScore.workspaceId,
    entityRef: input.entityRef,
    reason,
    qualityScore: input.qualityScore,
    blockedAt: new Date(input.nowMs).toISOString(),
    expiresAt: undefined,
    reviewableBy: 'owner',
  };
}

function findMatchingRule(
  rules: readonly BlockerPolicyRule[],
  score: RevenueQualityScore,
): BlockerPolicyRule | undefined {
  const active = rules.filter((r) => r.action !== 'allow_with_notice');
  const sorted = [...active].sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    if (conditionMatches(rule.condition, score)) {
      return rule;
    }
  }
  return undefined;
}

function conditionMatches(condition: BlockerPolicyCondition, score: RevenueQualityScore): boolean {
  switch (condition) {
    case 'refund_risk_gte_50pct':
      return score.refundRiskScore >= 0.5;
    case 'support_cost_gte_2000_cents':
      return score.supportCostScore >= 0.67;
    case 'margin_lt_20pct':
      return score.marginScore < 0.2;
    case 'brand_wear_gte_70pct':
      return score.brandWearScore >= 0.7;
    case 'quality_tier_toxic':
      return score.tier === 'toxic';
    case 'first_sale_unknown_product':
      return score.tier === 'toxic' || score.tier === 'caution';
    default:
      return false;
  }
}

function conditionToReason(condition: BlockerPolicyCondition): BlockReason {
  switch (condition) {
    case 'refund_risk_gte_50pct':
      return 'refund_risk_too_high';
    case 'support_cost_gte_2000_cents':
      return 'support_cost_too_high';
    case 'brand_wear_gte_70pct':
      return 'brand_wear_critical';
    case 'margin_lt_20pct':
      return 'margin_too_low';
    case 'quality_tier_toxic':
    case 'first_sale_unknown_product':
      return 'quality_tier_toxic';
    default:
      return 'policy_rule_match';
  }
}
