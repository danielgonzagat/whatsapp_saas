import type { SpineEventRef } from '../mind/mind.types';
import type { DetectorInput, Insight, RankedInsight } from './insight.types';
import { median } from './insight.types';

import { detectFunnelBottleneck } from './detectors/funnel-bottleneck.detector';
import { detectOfferFit } from './detectors/offer-fit.detector';
import { detectObjectionPattern } from './detectors/objection-pattern.detector';
import { detectQualificationLeak } from './detectors/qualification-leak.detector';
import { detectCoolingWindow } from './detectors/cooling-window.detector';
import { detectPricingElasticity } from './detectors/pricing-elasticity.detector';
import { detectChannelRoi } from './detectors/channel-roi.detector';
import { detectProductPositioning } from './detectors/product-positioning.detector';

import { rankInsights } from './insight-ranker';
import { confidenceFloor, filterAboveFloor } from './insight-confidence.guard';
import { InsightDeliveryService } from './insight-delivery.service';

const NOW = Date.parse('2026-05-13T22:00:00.000Z');
const WKS = 'wks_insight_test';

function ev(over?: Partial<SpineEventRef>): SpineEventRef {
  const defaults: Record<string, unknown> = {
    eventId: over?.eventId ?? `e_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over?.eventName ?? 'commerce.lead.replied',
    workspaceId: over?.workspaceId ?? WKS,
    occurredAt: over?.occurredAt ?? '2026-05-13T20:00:00.000Z',
    truthMode: over?.truthMode ?? 'observed' as const,
  };
  if (over?.entityRef !== undefined) {defaults['entityRef'] = over.entityRef;}
  if (over?.valence !== undefined) {defaults['valence'] = over.valence;}
  if (over?.payload !== undefined) {defaults['payload'] = over.payload;}
  return defaults as SpineEventRef;
}

function makeInsight(over?: Partial<Insight>): Insight {
  return {
    insightId: over?.insightId ?? 'i_test',
    kind: over?.kind ?? 'funnel_bottleneck',
    description: over?.description ?? 'test description',
    evidence: over?.evidence ?? ['e1'],
    estimatedFinancialImpactCents: over?.estimatedFinancialImpactCents ?? 100_00,
    confidence: over?.confidence ?? 0.7,
    recommendedChannel: over?.recommendedChannel ?? 'dashboard',
    recommendedTiming: over?.recommendedTiming ?? 'weekly',
    workspaceId: over?.workspaceId ?? WKS,
    truthMode: over?.truthMode ?? 'inferred',
    generatedAt: over?.generatedAt ?? new Date(NOW).toISOString(),
    maturityStage: over?.maturityStage,
    valence: over?.valence,
  };
}

function makeRanked(
  over?: Partial<Insight>,
  product?: number,
): RankedInsight {
  const insight = makeInsight(over);
  return {
    ...insight,
    impactConfidenceProduct:
      product ?? insight.estimatedFinancialImpactCents * insight.confidence,
  };
}

const input = (over?: Partial<DetectorInput>): DetectorInput => ({
  events: over?.events ?? ([] as readonly SpineEventRef[]),
  workspaceId: over?.workspaceId ?? WKS,
  nowMs: over?.nowMs ?? NOW,
});

// =========================================================================
// UTP-INSIGHT-001 — Funnel Bottleneck Detector
// =========================================================================
describe('UTP-INSIGHT-CONF-001 — confidence guard', () => {
  it('passes insight above default floor', () => {
    const insight = makeInsight({ confidence: 0.7 });
    const r = confidenceFloor(insight);
    expect(r.pass).toBe(true);
  });

  it('filters insight below default floor', () => {
    const insight = makeInsight({ confidence: 0.3 });
    const r = confidenceFloor(insight);
    expect(r.pass).toBe(false);
    expect(r.reason).toContain('below floor');
  });

  it('applies per-kind floor for pricing_elasticity', () => {
    const insight = makeInsight({ kind: 'pricing_elasticity', confidence: 0.55 });
    const r = confidenceFloor(insight);
    expect(r.pass).toBe(false);
  });

  it('filterAboveFloor removes low-confidence insights', () => {
    const high = makeInsight({ insightId: 'h', confidence: 0.8 });
    const low = makeInsight({ insightId: 'l', confidence: 0.3 });
    const filtered = filterAboveFloor([high, low]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.insightId).toBe('h');
  });
});

// =========================================================================
// UTP-INSIGHT-DEL-001 — Insight Delivery Service
// =========================================================================
describe('UTP-INSIGHT-DEL-001 — InsightDeliveryService', () => {
  const svc = new InsightDeliveryService();

  it('delivers urgent insights (qualification_leak) via whatsapp now', () => {
    const insight = makeRanked({ kind: 'qualification_leak', recommendedChannel: 'whatsapp', recommendedTiming: 'now' });
    const d = svc.decide(insight);
    expect(d.deliver).toBe(true);
  });

  it('blocks delivery for silent channel', () => {
    const insight = makeRanked({ recommendedChannel: 'silent' });
    const d = svc.decide(insight);
    expect(d.deliver).toBe(false);
    expect(d.reason).toContain('silent');
  });

  it('blocks whatsapp delivery for maturidade stage', () => {
    const insight = makeRanked({
      kind: 'qualification_leak',
      recommendedChannel: 'whatsapp',
      maturityStage: 'maturidade',
    });
    const d = svc.decide(insight);
    expect(d.deliver).toBe(false);
    expect(d.reason).toContain('maturidade');
  });

  it('allows whatsapp delivery for validacao stage', () => {
    const insight = makeRanked({
      kind: 'qualification_leak',
      recommendedChannel: 'whatsapp',
      maturityStage: 'validacao',
    });
    const d = svc.decide(insight);
    expect(d.deliver).toBe(true);
  });

  it('deliveryPlan returns sorted channel priorities', () => {
    const i1 = makeRanked({ insightId: 'a', kind: 'qualification_leak', recommendedChannel: 'whatsapp', recommendedTiming: 'now' });
    const i2 = makeRanked({ insightId: 'b', kind: 'funnel_bottleneck', recommendedChannel: 'dashboard', recommendedTiming: 'weekly' });
    const plan = svc.deliveryPlan([i1, i2]);
    expect(plan.length).toBeGreaterThanOrEqual(2);
    expect(plan[0]?.channel).toBe('whatsapp');
  });
});

// =========================================================================
// Utility: median
// =========================================================================
describe('median utility', () => {
  it('returns median for odd array', () => {
    expect(median([1, 3, 5])).toBe(3);
  });

  it('returns median for even array', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('returns 0 for empty array', () => {
    expect(median([])).toBe(0);
  });
});
