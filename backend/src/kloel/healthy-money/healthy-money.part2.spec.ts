import { scoreRevenueQuality } from './revenue-quality.scorer';
import { projectMargin } from './margin.projector';
import { projectRefundRisk } from './refund-risk.projector';
import { projectSupportCost } from './support-cost.projector';
import { detectBrandWear } from './brand-wear.detector';
import { evaluateSaleBlock } from './unhealthy-sale.blocker';
import { BlockerPolicyService } from './blocker-policy.service';
import { buildDashboard } from './healthy-vs-unhealthy.dashboard';
import { tierFromScore, clampScore } from './healthy-money.types';
import type { SpineEventRef } from '../mind/mind.types';
import type {
  RevenueQualityScore,
  BlockerPolicy,
  MarginProjection,
  UnhealthySaleBlock,
} from './healthy-money.types';

const NOW = Date.parse('2026-05-13T22:00:00.000Z');
const WINDOW_START = NOW - 30 * 24 * 60 * 60 * 1000;
const WKS = 'wks_healthymoney_test';

function ev(over?: Partial<SpineEventRef>): SpineEventRef {
  return {
    eventId: over?.eventId ?? `e_${Math.random().toString(36).slice(2, 10)}`,
    eventName: over?.eventName ?? 'commerce.payment.approved',
    workspaceId: over?.workspaceId ?? WKS,
    occurredAt: over?.occurredAt ?? '2026-05-13T20:00:00.000Z',
    truthMode: over?.truthMode ?? ('observed' as const),
    ...(over?.entityRef !== undefined ? { entityRef: over.entityRef } : {}),
    ...(over?.valence !== undefined ? { valence: over.valence } : {}),
    ...(over?.payload !== undefined ? { payload: over.payload } : {}),
  };
}

function dummyQualityScore(over?: Partial<RevenueQualityScore>): RevenueQualityScore {
  return {
    workspaceId: over?.workspaceId ?? WKS,
    assessmentWindowStart: over?.assessmentWindowStart ?? new Date(WINDOW_START).toISOString(),
    assessmentWindowEnd: over?.assessmentWindowEnd ?? new Date(NOW).toISOString(),
    tier: over?.tier ?? 'good',
    aggregateScore: over?.aggregateScore ?? 0.75,
    marginScore: over?.marginScore ?? 0.8,
    refundRiskScore: over?.refundRiskScore ?? 0.1,
    supportCostScore: over?.supportCostScore ?? 0.7,
    brandWearScore: over?.brandWearScore ?? 0.15,
    totalRevenueCents: over?.totalRevenueCents ?? 100_000,
    healthyRevenueCents: over?.healthyRevenueCents ?? 75_000,
    unhealthyRevenueCents: over?.unhealthyRevenueCents ?? 25_000,
    assessedAt: over?.assessedAt ?? new Date(NOW).toISOString(),
  };
}

// =========================================================================
// HEALTHYMONEY-001 — Revenue Quality Scorer
// =========================================================================
describe('HEALTHYMONEY-007 — BlockerPolicyService', () => {
  let service: BlockerPolicyService;

  beforeEach(() => {
    service = new BlockerPolicyService();
  });

  it('returns default active policy for new workspace', () => {
    const policy = service.getPolicy('wks_new');
    expect(policy.active).toBe(true);
    expect(policy.rules.length).toBeGreaterThan(0);
  });

  it('can deactivate and reactivate policy', () => {
    const updated = service.setActive(WKS, false);
    expect(updated.active).toBe(false);
    const reactivated = service.setActive(WKS, true);
    expect(reactivated.active).toBe(true);
  });

  it('can add and remove rules', () => {
    const before = service.getPolicy(WKS);
    const after = service.addRule(WKS, {
      label: 'Test rule',
      condition: 'first_sale_unknown_product' as const,
      action: 'block' as const,
      priority: 10,
    });
    expect(after.rules.length).toBe(before.rules.length + 1);
    const addedRule = after.rules[after.rules.length - 1]!;
    const removed = service.removeRule(WKS, addedRule.ruleId);
    expect(removed.rules.length).toBe(before.rules.length);
  });

  it('resets to defaults', () => {
    service.addRule(WKS, {
      label: 'Temp',
      condition: 'quality_tier_toxic' as const,
      action: 'block' as const,
      priority: 99,
    });
    const reset = service.resetToDefaults(WKS);
    expect(reset.rules.length).toBe(5);
  });

  it('activeWorkspacesCount includes default', () => {
    expect(service.activeWorkspacesCount()).toBeGreaterThanOrEqual(1);
  });
});

// =========================================================================
// HEALTHYMONEY-008 — Dashboard Builder
// =========================================================================
describe('HEALTHYMONEY-008 — buildDashboard', () => {
  it('builds dashboard with quality breakdown', () => {
    const score = dummyQualityScore({ tier: 'excellent' });
    const dash = buildDashboard({
      qualityScore: score,
      activeBlocks: [],
      nowMs: NOW,
    });
    expect(dash.qualityBreakdown.excellent).toBe(score.totalRevenueCents);
    expect(dash.healthyRatio).toBeGreaterThan(0);
    expect(dash.generatedAt).toBeTruthy();
  });

  it('includes active blocks in dashboard', () => {
    const score = dummyQualityScore();
    const block: UnhealthySaleBlock = {
      blockId: 'block_test',
      workspaceId: WKS,
      entityRef: { entityType: 'lead', entityId: 'lead_test' },
      reason: 'refund_risk_too_high',
      qualityScore: score,
      blockedAt: new Date(NOW).toISOString(),
      expiresAt: undefined,
      reviewableBy: 'owner',
    };
    const dash = buildDashboard({
      qualityScore: score,
      activeBlocks: [block],
      nowMs: NOW,
    });
    expect(dash.activeBlocks).toHaveLength(1);
  });

  it('includes optional projections when provided', () => {
    const score = dummyQualityScore();
    const margin: MarginProjection = {
      workspaceId: WKS,
      projectedMarginBps: 5000,
      projectedMarginPct: 50,
      fixedCostCents: 10_000,
      variableCostCents: 40_000,
      revenueCents: 100_000,
      contributionMarginBps: 6000,
      projectedAt: new Date(NOW).toISOString(),
    };
    const dash = buildDashboard({
      qualityScore: score,
      activeBlocks: [],
      marginProjection: margin,
      nowMs: NOW,
    });
    expect(dash.marginProjection?.projectedMarginPct).toBe(50);
  });
});

// =========================================================================
// HEALTHYMONEY — Utility functions
// =========================================================================
describe('HEALTHYMONEY — utility functions', () => {
  it('tierFromScore classifies correctly', () => {
    expect(tierFromScore(0.9)).toBe('excellent');
    expect(tierFromScore(0.75)).toBe('good');
    expect(tierFromScore(0.55)).toBe('neutral');
    expect(tierFromScore(0.35)).toBe('caution');
    expect(tierFromScore(0.1)).toBe('toxic');
  });

  it('clampScore bounds values to [0, 1]', () => {
    expect(clampScore(1.5)).toBe(1);
    expect(clampScore(-0.3)).toBe(0);
    expect(clampScore(0.5)).toBe(0.5);
  });
});

// =========================================================================
// Helpers
// =========================================================================

function makePolicy(active: boolean): BlockerPolicy {
  return {
    policyId: 'policy_test',
    workspaceId: WKS,
    active,
    rules: [
      {
        ruleId: 'rule_quality_toxic',
        label: 'Block toxic',
        condition: 'quality_tier_toxic' as const,
        action: 'block' as const,
        priority: 1,
      },
    ],
    lastRevisedAt: new Date(NOW).toISOString(),
    revisedBy: 'system',
  };
}
