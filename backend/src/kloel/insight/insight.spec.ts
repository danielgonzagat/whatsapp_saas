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
  if (over?.entityRef !== undefined) defaults['entityRef'] = over.entityRef;
  if (over?.valence !== undefined) defaults['valence'] = over.valence;
  if (over?.payload !== undefined) defaults['payload'] = over.payload;
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
describe('UTP-INSIGHT-001 — detectFunnelBottleneck', () => {
  it('detects bottleneck when drop-off >= 60% between stages', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.created' }),
      ev({ eventName: 'commerce.lead.created' }),
      ev({ eventName: 'commerce.lead.created' }),
      ev({ eventName: 'commerce.lead.created' }),
      ev({ eventName: 'commerce.lead.created' }),
      ev({ eventName: 'commerce.lead.contacted' }),
      ev({ eventName: 'commerce.lead.contacted' }),
      ev({ eventName: 'commerce.lead.replied' }),
    ];
    const r = detectFunnelBottleneck(input({ events }));
    expect(r.insights.length).toBeGreaterThanOrEqual(1);
    expect(r.insights[0]?.kind).toBe('funnel_bottleneck');
    expect(r.insights[0]?.confidence).toBeGreaterThan(0);
  });

  it('returns empty when too few leads', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.created' }),
      ev({ eventName: 'commerce.lead.created' }),
    ];
    const r = detectFunnelBottleneck(input({ events }));
    expect(r.insights).toHaveLength(0);
  });

  it('returns empty when no significant bottleneck exists', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.created' }),
      ev({ eventName: 'commerce.lead.created' }),
      ev({ eventName: 'commerce.lead.created' }),
      ev({ eventName: 'commerce.lead.created' }),
      ev({ eventName: 'commerce.lead.created' }),
      ev({ eventName: 'commerce.lead.contacted' }),
      ev({ eventName: 'commerce.lead.contacted' }),
      ev({ eventName: 'commerce.lead.contacted' }),
      ev({ eventName: 'commerce.lead.contacted' }),
    ];
    const r = detectFunnelBottleneck(input({ events }));
    expect(r.insights).toHaveLength(0);
  });
});

// =========================================================================
// UTP-INSIGHT-002 — Offer Fit Detector
// =========================================================================
describe('UTP-INSIGHT-002 — detectOfferFit', () => {
  it('detects underperforming product with low approval share', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'pA' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'pA' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'pA' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'pA' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'pA' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'pA' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'pA' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'pA' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'pA' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'pA' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'pB' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'pB' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'pB' } }),
    ];
    const r = detectOfferFit(input({ events }));
    expect(r.insights.length).toBeGreaterThanOrEqual(1);
    expect(r.insights[0]?.kind).toBe('offer_fit');
  });

  it('returns empty with insufficient data', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'pA' } }),
    ];
    const r = detectOfferFit(input({ events }));
    expect(r.insights).toHaveLength(0);
  });
});

// =========================================================================
// UTP-INSIGHT-003 — Objection Pattern Detector
// =========================================================================
describe('UTP-INSIGHT-003 — detectObjectionPattern', () => {
  it('detects frequent objection pattern', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.objection_raised', payload: { kind: 'price' } }),
      ev({ eventName: 'commerce.lead.objection_raised', payload: { kind: 'price' } }),
      ev({ eventName: 'commerce.lead.objection_raised', payload: { kind: 'price' } }),
      ev({ eventName: 'commerce.lead.objection_raised', payload: { kind: 'trust' } }),
    ];
    const r = detectObjectionPattern(input({ events }));
    expect(r.insights.length).toBeGreaterThanOrEqual(1);
    expect(r.insights[0]?.kind).toBe('objection_pattern');
    expect(r.insights[0]?.description).toContain('price');
  });

  it('returns empty when too few objections', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.objection_raised', payload: { kind: 'price' } }),
      ev({ eventName: 'commerce.lead.objection_raised', payload: { kind: 'trust' } }),
    ];
    const r = detectObjectionPattern(input({ events }));
    expect(r.insights).toHaveLength(0);
  });
});

// =========================================================================
// UTP-INSIGHT-004 — Qualification Leak Detector
// =========================================================================
describe('UTP-INSIGHT-004 — detectQualificationLeak', () => {
  it('detects qualified leads that were later lost', () => {
    const l1 = 'lead_1';
    const l2 = 'lead_2';
    const l3 = 'lead_3';
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.qualified', entityRef: { entityType: 'lead', entityId: l1 } }),
      ev({ eventName: 'commerce.lead.qualified', entityRef: { entityType: 'lead', entityId: l2 } }),
      ev({ eventName: 'commerce.lead.qualified', entityRef: { entityType: 'lead', entityId: l3 } }),
      ev({ eventName: 'commerce.lead.lost', entityRef: { entityType: 'lead', entityId: l1 } }),
      ev({ eventName: 'commerce.lead.lost', entityRef: { entityType: 'lead', entityId: l2 } }),
    ];
    const r = detectQualificationLeak(input({ events }));
    expect(r.insights.length).toBeGreaterThanOrEqual(1);
    expect(r.insights[0]?.kind).toBe('qualification_leak');
  });

  it('returns empty with few qualified leads', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.qualified', entityRef: { entityType: 'lead', entityId: 'l1' } }),
    ];
    const r = detectQualificationLeak(input({ events }));
    expect(r.insights).toHaveLength(0);
  });
});

// =========================================================================
// UTP-INSIGHT-005 — Cooling Window Detector
// =========================================================================
describe('UTP-INSIGHT-005 — detectCoolingWindow', () => {
  it('detects long cooling window when median conversion time > 14 days', () => {
    const lid = 'lead_cool';
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.created', entityRef: { entityType: 'lead', entityId: lid }, occurredAt: '2026-04-01T00:00:00.000Z' }),
      ev({ eventName: 'commerce.lead.converted', entityRef: { entityType: 'lead', entityId: lid }, occurredAt: '2026-04-20T00:00:00.000Z' }),
      ev({ eventName: 'commerce.lead.created', entityRef: { entityType: 'lead', entityId: 'l2' }, occurredAt: '2026-04-02T00:00:00.000Z' }),
      ev({ eventName: 'commerce.lead.converted', entityRef: { entityType: 'lead', entityId: 'l2' }, occurredAt: '2026-04-25T00:00:00.000Z' }),
      ev({ eventName: 'commerce.lead.created', entityRef: { entityType: 'lead', entityId: 'l3' }, occurredAt: '2026-04-03T00:00:00.000Z' }),
      ev({ eventName: 'commerce.lead.converted', entityRef: { entityType: 'lead', entityId: 'l3' }, occurredAt: '2026-04-22T00:00:00.000Z' }),
    ];
    const r = detectCoolingWindow(input({ events }));
    expect(r.insights.length).toBeGreaterThanOrEqual(1);
    expect(r.insights[0]?.kind).toBe('cooling_window');
  });

  it('returns empty with too few conversions', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.created', entityRef: { entityType: 'lead', entityId: 'l1' }, occurredAt: '2026-04-01T00:00:00.000Z' }),
      ev({ eventName: 'commerce.lead.converted', entityRef: { entityType: 'lead', entityId: 'l1' }, occurredAt: '2026-04-20T00:00:00.000Z' }),
    ];
    const r = detectCoolingWindow(input({ events }));
    expect(r.insights).toHaveLength(0);
  });
});

// =========================================================================
// UTP-INSIGHT-006 — Pricing Elasticity Detector
// =========================================================================
describe('UTP-INSIGHT-006 — detectPricingElasticity', () => {
  it('detects elasticity gap when higher prices have lower approval rate', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved', payload: { amountCents: 50_00 } }),
      ev({ eventName: 'commerce.payment.approved', payload: { amountCents: 50_00 } }),
      ev({ eventName: 'commerce.payment.approved', payload: { amountCents: 50_00 } }),
      ev({ eventName: 'commerce.payment.approved', payload: { amountCents: 50_00 } }),
      ev({ eventName: 'commerce.payment.approved', payload: { amountCents: 200_00 } }),
      ev({ eventName: 'commerce.payment.declined', payload: { amountCents: 200_00 } }),
      ev({ eventName: 'commerce.payment.declined', payload: { amountCents: 200_00 } }),
      ev({ eventName: 'commerce.payment.declined', payload: { amountCents: 200_00 } }),
    ];
    const r = detectPricingElasticity(input({ events }));
    expect(r.insights.length).toBeGreaterThanOrEqual(1);
    expect(r.insights[0]?.kind).toBe('pricing_elasticity');
  });

  it('returns empty with single price point', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved', payload: { amountCents: 50_00 } }),
      ev({ eventName: 'commerce.payment.approved', payload: { amountCents: 50_00 } }),
      ev({ eventName: 'commerce.payment.approved', payload: { amountCents: 50_00 } }),
      ev({ eventName: 'commerce.payment.approved', payload: { amountCents: 50_00 } }),
      ev({ eventName: 'commerce.payment.approved', payload: { amountCents: 50_00 } }),
    ];
    const r = detectPricingElasticity(input({ events }));
    expect(r.insights).toHaveLength(0);
  });
});

// =========================================================================
// UTP-INSIGHT-007 — Channel ROI Detector
// =========================================================================
describe('UTP-INSIGHT-007 — detectChannelRoi', () => {
  it('detects poor channel ROI when cost exceeds attributed revenue', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.campaign.clicked', payload: { channel: 'facebook', costCents: 500_00, revenueCents: 100_00 } }),
      ev({ eventName: 'commerce.campaign.clicked', payload: { channel: 'facebook', costCents: 500_00, revenueCents: 50_00 } }),
      ev({ eventName: 'commerce.campaign.clicked', payload: { channel: 'facebook', costCents: 500_00 } }),
    ];
    const r = detectChannelRoi(input({ events }));
    expect(r.insights.length).toBeGreaterThanOrEqual(1);
    expect(r.insights[0]?.kind).toBe('channel_roi');
    expect(r.insights[0]?.description).toContain('facebook');
  });

  it('returns empty with too few campaign events', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.campaign.clicked', payload: { channel: 'facebook', costCents: 100_00 } }),
    ];
    const r = detectChannelRoi(input({ events }));
    expect(r.insights).toHaveLength(0);
  });
});

// =========================================================================
// UTP-INSIGHT-008 — Product Positioning Detector
// =========================================================================
describe('UTP-INSIGHT-008 — detectProductPositioning', () => {
  it('detects positioning mismatch when low-tier product has high refund rate', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'basic', productRole: 'basic' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'basic', productRole: 'basic' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'basic', productRole: 'basic' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'basic', productRole: 'basic' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'basic', productRole: 'basic' } }),
      ev({ eventName: 'commerce.payment.refunded', payload: { productId: 'basic' } }),
      ev({ eventName: 'commerce.payment.refunded', payload: { productId: 'basic' } }),
    ];
    const r = detectProductPositioning(input({ events }));
    expect(r.insights.length).toBeGreaterThanOrEqual(1);
    expect(r.insights[0]?.kind).toBe('product_positioning');
    expect(r.insights[0]?.description).toContain('mismatch');
  });

  it('returns empty with insufficient data', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p1', productRole: 'basic' } }),
    ];
    const r = detectProductPositioning(input({ events }));
    expect(r.insights).toHaveLength(0);
  });
});

// =========================================================================
// UTP-INSIGHT-RANK-001 — Insight Ranker
// =========================================================================
describe('UTP-INSIGHT-RANK-001 — rankInsights', () => {
  it('sorts insights by impact * confidence descending', () => {
    const a = makeInsight({ insightId: 'a', estimatedFinancialImpactCents: 100_00, confidence: 0.9 });
    const b = makeInsight({ insightId: 'b', estimatedFinancialImpactCents: 500_00, confidence: 0.3 });
    const c = makeInsight({ insightId: 'c', estimatedFinancialImpactCents: 200_00, confidence: 0.8 });
    const ranked = rankInsights([a, b, c]);
    expect(ranked[0]?.insightId).toBe('c');
    expect(ranked[1]?.insightId).toBe('b');
    expect(ranked[2]?.insightId).toBe('a');
  });

  it('returns empty array for empty input', () => {
    const ranked = rankInsights([]);
    expect(ranked).toHaveLength(0);
  });
});

// =========================================================================
// UTP-INSIGHT-CONF-001 — Confidence Guard
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
