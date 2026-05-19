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


// =========================================================================
// HEALTHYMONEY-001 — Revenue Quality Scorer
// =========================================================================
describe('HEALTHYMONEY-001 — scoreRevenueQuality', () => {
  it('scores clean revenue as excellent', () => {
    const events: SpineEventRef[] = Array.from({ length: 10 }, () =>
      ev({ eventName: 'commerce.payment.approved' }),
    );
    const result = scoreRevenueQuality({
      events,
      workspaceId: WKS,
      windowStartMs: WINDOW_START,
      windowEndMs: NOW,
      nowMs: NOW,
    });
    expect(result.tier).toBe('good');
    expect(result.aggregateScore).toBeGreaterThanOrEqual(0.8);
    expect(result.totalRevenueCents).toBe(100_000);
  });

  it('downgrades score with refunds and chargebacks', () => {
    const events: SpineEventRef[] = [
      ...Array.from({ length: 5 }, () => ev({ eventName: 'commerce.payment.approved' })),
      ...Array.from({ length: 3 }, () => ev({ eventName: 'commerce.payment.refunded' })),
      ev({ eventName: 'commerce.payment.charged_back' }),
    ];
    const result = scoreRevenueQuality({
      events,
      workspaceId: WKS,
      windowStartMs: WINDOW_START,
      windowEndMs: NOW,
      nowMs: NOW,
    });
    expect(result.aggregateScore).toBeLessThan(0.55);
    expect(['neutral', 'caution', 'toxic']).toContain(result.tier);
  });

  it('returns neutral when no approved payments exist', () => {
    const events: SpineEventRef[] = [ev({ eventName: 'commerce.lead.created' })];
    const result = scoreRevenueQuality({
      events,
      workspaceId: WKS,
      windowStartMs: WINDOW_START,
      windowEndMs: NOW,
      nowMs: NOW,
    });
    expect(result.tier).toBe('neutral');
  });

  it('separates healthy and unhealthy revenue cents', () => {
    const events: SpineEventRef[] = Array.from({ length: 5 }, () =>
      ev({ eventName: 'commerce.payment.approved' }),
    );
    const result = scoreRevenueQuality({
      events,
      workspaceId: WKS,
      windowStartMs: WINDOW_START,
      windowEndMs: NOW,
      nowMs: NOW,
    });
    expect(result.healthyRevenueCents + result.unhealthyRevenueCents).toBe(
      result.totalRevenueCents,
    );
  });

  it('factors in margin projection when available', () => {
    const margin: MarginProjection = {
      workspaceId: WKS,
      projectedMarginBps: 500,
      projectedMarginPct: 5,
      fixedCostCents: 10_000,
      variableCostCents: 85_000,
      revenueCents: 100_000,
      contributionMarginBps: 1500,
      projectedAt: new Date(NOW).toISOString(),
    };
    const events: SpineEventRef[] = Array.from({ length: 10 }, () =>
      ev({ eventName: 'commerce.payment.approved' }),
    );
    const result = scoreRevenueQuality({
      events,
      workspaceId: WKS,
      windowStartMs: WINDOW_START,
      windowEndMs: NOW,
      marginProjection: margin,
      nowMs: NOW,
    });
    expect(result.marginScore).toBeLessThanOrEqual(0.06);
    expect(result.aggregateScore).toBeLessThan(0.8);
  });
});

// =========================================================================
// HEALTHYMONEY-002 — Margin Projector
// =========================================================================
describe('HEALTHYMONEY-002 — projectMargin', () => {
  it('projects healthy margin for low-cost revenue', () => {
    const result = projectMargin({
      workspaceId: WKS,
      revenueCents: 100_000,
      variableCostCents: 20_000,
      fixedCostCents: 10_000,
      nowMs: NOW,
    });
    expect(result.projectedMarginBps).toBe(7000);
    expect(result.projectedMarginPct).toBe(70);
    expect(result.contributionMarginBps).toBe(8000);
  });

  it('projects negative margin when costs exceed revenue', () => {
    const result = projectMargin({
      workspaceId: WKS,
      revenueCents: 10_000,
      variableCostCents: 8_000,
      fixedCostCents: 5_000,
      nowMs: NOW,
    });
    expect(result.projectedMarginBps).toBeLessThan(0);
    expect(result.projectedMarginPct).toBeLessThan(0);
  });

  it('returns zero margin for zero revenue', () => {
    const result = projectMargin({
      workspaceId: WKS,
      revenueCents: 0,
      variableCostCents: 0,
      fixedCostCents: 0,
      nowMs: NOW,
    });
    expect(result.projectedMarginBps).toBe(0);
    expect(result.projectedMarginPct).toBe(0);
  });
});

// =========================================================================
// HEALTHYMONEY-003 — Refund Risk Projector
// =========================================================================
describe('HEALTHYMONEY-003 — projectRefundRisk', () => {
  it('projects low risk for clean payment history', () => {
    const events: SpineEventRef[] = Array.from({ length: 20 }, () =>
      ev({ eventName: 'commerce.payment.approved' }),
    );
    const result = projectRefundRisk({
      events,
      workspaceId: WKS,
      windowStartMs: WINDOW_START,
      windowEndMs: NOW,
      totalRevenueCents: 200_000,
      nowMs: NOW,
    });
    expect(result.refundRiskScore).toBe(0);
    expect(result.riskFactors).toHaveLength(0);
  });

  it('projects high risk with chargebacks and refunds', () => {
    const events: SpineEventRef[] = [
      ...Array.from({ length: 5 }, () => ev({ eventName: 'commerce.payment.approved' })),
      ...Array.from({ length: 2 }, () => ev({ eventName: 'commerce.payment.refunded' })),
      ev({ eventName: 'commerce.payment.charged_back' }),
    ];
    const result = projectRefundRisk({
      events,
      workspaceId: WKS,
      windowStartMs: WINDOW_START,
      windowEndMs: NOW,
      totalRevenueCents: 50_000,
      nowMs: NOW,
    });
    expect(result.refundRiskScore).toBeGreaterThan(0.3);
    expect(result.riskFactors.length).toBeGreaterThan(0);
  });
});

// =========================================================================
// HEALTHYMONEY-004 — Support Cost Projector
// =========================================================================
describe('HEALTHYMONEY-004 — projectSupportCost', () => {
  it('projects zero cost when no handoffs or objections', () => {
    const events: SpineEventRef[] = Array.from({ length: 5 }, () =>
      ev({ eventName: 'commerce.payment.approved' }),
    );
    const result = projectSupportCost({
      events,
      workspaceId: WKS,
      approvedCount: 5,
      nowMs: NOW,
    });
    expect(result.estimatedSupportCostCents).toBe(0);
    expect(result.expectedTicketCount).toBe(0);
  });

  it('projects cost proportional to handoff count', () => {
    const events: SpineEventRef[] = Array.from({ length: 4 }, () =>
      ev({ eventName: 'commerce.whatsapp.handoff_to_human' }),
    );
    const result = projectSupportCost({
      events,
      workspaceId: WKS,
      approvedCount: 2,
      nowMs: NOW,
    });
    expect(result.estimatedSupportCostCents).toBeGreaterThan(0);
    expect(result.expectedTicketCount).toBeGreaterThanOrEqual(4);
  });
});

// =========================================================================
// HEALTHYMONEY-005 — Brand Wear Detector
// =========================================================================
describe('HEALTHYMONEY-005 — detectBrandWear', () => {
  it('detects no wear for clean operations', () => {
    const events: SpineEventRef[] = Array.from({ length: 5 }, () =>
      ev({ eventName: 'commerce.payment.approved' }),
    );
    const result = detectBrandWear({
      events,
      workspaceId: WKS,
      windowDays: 30,
      nowMs: NOW,
    });
    expect(result.brandWearScore).toBe(0);
    expect(result.wearThresholdExceeded).toBe(false);
    expect(result.signals).toHaveLength(0);
  });

  it('detects wear with multiple negative signals', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved' }),
      ev({ eventName: 'commerce.payment.refunded' }),
      ev({ eventName: 'commerce.payment.refunded' }),
      ev({ eventName: 'commerce.payment.charged_back' }),
      ev({ eventName: 'commerce.whatsapp.handoff_to_human' }),
      ev({ eventName: 'commerce.whatsapp.handoff_to_human' }),
      ev({ eventName: 'commerce.lead.objection_raised' }),
      ev({ eventName: 'commerce.lead.objection_raised' }),
    ];
    const result = detectBrandWear({
      events,
      workspaceId: WKS,
      windowDays: 30,
      nowMs: NOW,
    });
    expect(result.brandWearScore).toBeGreaterThan(0.5);
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.recoveryDaysEstimated).toBeGreaterThan(0);
  });
});

// =========================================================================
// HEALTHYMONEY-006 — Unhealthy Sale Blocker
// =========================================================================
describe('HEALTHYMONEY-006 — evaluateSaleBlock', () => {
  const entityRef = { entityType: 'lead' as const, entityId: 'lead_test' };

  it('returns null when policy is not active', () => {
    const score = dummyQualityScore({ tier: 'toxic' });
    const result = evaluateSaleBlock({
      qualityScore: score,
      policy: makePolicy(false),
      entityRef,
      nowMs: NOW,
    });
    expect(result).toBeNull();
  });

  it('blocks sale when quality tier is toxic', () => {
    const score = dummyQualityScore({ tier: 'toxic', aggregateScore: 0.2 });
    const result = evaluateSaleBlock({
      qualityScore: score,
      policy: makePolicy(true),
      entityRef,
      nowMs: NOW,
    });
    expect(result).not.toBeNull();
    expect(result?.reason).toBe('quality_tier_toxic');
    expect(result?.reviewableBy).toBe('owner');
  });

  it('returns null when sale is healthy', () => {
    const score = dummyQualityScore({ tier: 'excellent' });
    const result = evaluateSaleBlock({
      qualityScore: score,
      policy: makePolicy(true),
      entityRef,
      nowMs: NOW,
    });
    expect(result).toBeNull();
  });
});

// =========================================================================
// HEALTHYMONEY-007 — Blocker Policy Service
// =========================================================================