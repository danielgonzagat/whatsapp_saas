import type { SpineEventRef } from '../mind/mind.types';
import type {
  OfferDetectorInput,
  OfferInsight,
  RankedOfferInsight,
} from './offer.types';

import { detectBonusDesirability } from './detectors/bonus-desirability.detector';
import { detectPromiseStrength } from './detectors/promise-strength.detector';
import { detectProductVersionFit } from './detectors/product-version-fit.detector';
import { detectPositioningMismatch } from './detectors/positioning-mismatch.detector';
import { detectPagePromiseMismatch } from './detectors/page-promise-mismatch.detector';
import { detectPricingPsychologySignal } from './detectors/pricing-psychology-signal.detector';

import { rankOfferInsights } from './offer-insight.ranker';
import { offerConfidenceFloor, filterOfferAboveFloor } from './offer-confidence.guard';
import { OfferDeliveryService } from './offer-delivery.service';

import { median } from './offer.types';

const NOW = Date.parse('2026-05-13T22:00:00.000Z');
const WKS = 'wks_offer_test';

function ev(over?: Partial<SpineEventRef>): SpineEventRef {
  const defaults: Record<string, unknown> = {
    eventId: over?.eventId ?? `e_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over?.eventName ?? 'commerce.lead.replied',
    workspaceId: over?.workspaceId ?? WKS,
    occurredAt: over?.occurredAt ?? '2026-05-13T20:00:00.000Z',
    truthMode: over?.truthMode ?? ('observed' as const),
  };
  if (over?.entityRef !== undefined) defaults['entityRef'] = over.entityRef;
  if (over?.valence !== undefined) defaults['valence'] = over.valence;
  if (over?.payload !== undefined) defaults['payload'] = over.payload;
  return defaults as unknown as SpineEventRef;
}

function makeInsight(over?: Partial<OfferInsight>): OfferInsight {
  return {
    insightId: over?.insightId ?? 'i_test',
    kind: over?.kind ?? 'bonus_desirability',
    description: over?.description ?? 'test description',
    evidence: over?.evidence ?? ['e1'],
    impactMultiplicative: over?.impactMultiplicative ?? 2.0,
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
  over?: Partial<OfferInsight>,
  product?: number,
): RankedOfferInsight {
  const insight = makeInsight(over);
  return {
    ...insight,
    rankedProduct: product ?? insight.impactMultiplicative * insight.confidence,
  };
}

const input = (over?: Partial<OfferDetectorInput>): OfferDetectorInput => ({
  events: over?.events ?? ([] as readonly SpineEventRef[]),
  workspaceId: over?.workspaceId ?? WKS,
  nowMs: over?.nowMs ?? NOW,
});

// =========================================================================
// UTP-OFFER-001 — Bonus Desirability Detector
// =========================================================================
describe('UTP-OFFER-001 — detectBonusDesirability', () => {
  it('detects bonus with high decline rate', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved', payload: { bonusRef: 'bonus_x' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { bonusRef: 'bonus_x' } }),
      ev({ eventName: 'commerce.payment.declined', payload: { bonusRef: 'bonus_x' } }),
      ev({ eventName: 'commerce.payment.declined', payload: { bonusRef: 'bonus_x' } }),
      ev({ eventName: 'commerce.payment.declined', payload: { bonusRef: 'bonus_x' } }),
    ];
    const r = detectBonusDesirability(input({ events }));
    expect(r.insights.length).toBeGreaterThanOrEqual(1);
    expect(r.insights[0]?.kind).toBe('bonus_desirability');
    expect(r.insights[0]?.description).toContain('bonus_x');
  });

  it('returns empty for bonuses with low decline', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved', payload: { bonusRef: 'bonus_good' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { bonusRef: 'bonus_good' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { bonusRef: 'bonus_good' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { bonusRef: 'bonus_good' } }),
    ];
    const r = detectBonusDesirability(input({ events }));
    expect(r.insights).toHaveLength(0);
  });

  it('returns empty with insufficient bonus events', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.declined', payload: { bonusRef: 'b1' } }),
    ];
    const r = detectBonusDesirability(input({ events }));
    expect(r.insights).toHaveLength(0);
  });
});

// =========================================================================
// UTP-OFFER-002 — Promise Strength Detector
// =========================================================================
describe('UTP-OFFER-002 — detectPromiseStrength', () => {
  it('detects weak promise with low lead-to-cart conversion', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.contacted', payload: { campaignId: 'camp_a' } }),
      ev({ eventName: 'commerce.lead.contacted', payload: { campaignId: 'camp_a' } }),
      ev({ eventName: 'commerce.lead.contacted', payload: { campaignId: 'camp_a' } }),
      ev({ eventName: 'commerce.lead.contacted', payload: { campaignId: 'camp_a' } }),
      ev({ eventName: 'commerce.lead.contacted', payload: { campaignId: 'camp_a' } }),
      ev({ eventName: 'commerce.lead.contacted', payload: { campaignId: 'camp_a' } }),
      ev({ eventName: 'commerce.lead.contacted', payload: { campaignId: 'camp_a' } }),
    ];
    const r = detectPromiseStrength(input({ events }));
    expect(r.insights.length).toBeGreaterThanOrEqual(1);
    expect(r.insights[0]?.kind).toBe('promise_strength');
    expect(r.insights[0]?.description).toContain('camp_a');
  });

  it('returns empty with too few leads per campaign', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.contacted', payload: { campaignId: 'c1' } }),
      ev({ eventName: 'commerce.lead.contacted', payload: { campaignId: 'c1' } }),
    ];
    const r = detectPromiseStrength(input({ events }));
    expect(r.insights).toHaveLength(0);
  });

  it('returns empty with adequate conversion rate', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.contacted', payload: { campaignId: 'c1' } }),
      ev({ eventName: 'commerce.lead.contacted', payload: { campaignId: 'c1' } }),
      ev({ eventName: 'commerce.lead.contacted', payload: { campaignId: 'c1' } }),
      ev({ eventName: 'commerce.lead.contacted', payload: { campaignId: 'c1' } }),
      ev({ eventName: 'commerce.lead.contacted', payload: { campaignId: 'c1' } }),
      ev({ eventName: 'commerce.cart.checkout_initiated', payload: { campaignId: 'c1' } }),
      ev({ eventName: 'commerce.cart.checkout_initiated', payload: { campaignId: 'c1' } }),
    ];
    const r = detectPromiseStrength(input({ events }));
    expect(r.insights).toHaveLength(0);
  });
});

// =========================================================================
// UTP-OFFER-003 — Product Version Fit Detector
// =========================================================================
describe('UTP-OFFER-003 — detectProductVersionFit', () => {
  it('detects product with high refund rate', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p1', productTier: 'premium' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p1', productTier: 'premium' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p1', productTier: 'premium' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p1', productTier: 'premium' } }),
      ev({ eventName: 'commerce.payment.refunded', payload: { productId: 'p1' } }),
      ev({ eventName: 'commerce.payment.refunded', payload: { productId: 'p1' } }),
    ];
    const r = detectProductVersionFit(input({ events }));
    expect(r.insights.length).toBeGreaterThanOrEqual(1);
    expect(r.insights[0]?.kind).toBe('product_version_fit');
    expect(r.insights[0]?.description).toContain('simpler');
  });

  it('detects product with high churn risk', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p2' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p2' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p2' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p2' } }),
      ev({ eventName: 'commerce.post_sale.churn_risk_detected', payload: { productId: 'p2' } }),
      ev({ eventName: 'commerce.post_sale.churn_risk_detected', payload: { productId: 'p2' } }),
    ];
    const r = detectProductVersionFit(input({ events }));
    expect(r.insights.length).toBeGreaterThanOrEqual(1);
    expect(r.insights[0]?.description).toContain('churn');
  });

  it('returns empty with insufficient sales data', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p3' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p3' } }),
    ];
    const r = detectProductVersionFit(input({ events }));
    expect(r.insights).toHaveLength(0);
  });
});

// =========================================================================
// UTP-OFFER-004 — Positioning Mismatch Detector
// =========================================================================
describe('UTP-OFFER-004 — detectPositioningMismatch', () => {
  it('detects trust-related positioning mismatch', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.objection_raised', payload: { kind: 'price' } }),
      ev({ eventName: 'commerce.lead.objection_raised', payload: { kind: 'price' } }),
      ev({ eventName: 'commerce.lead.objection_raised', payload: { kind: 'trust' } }),
      ev({ eventName: 'commerce.lead.objection_raised', payload: { kind: 'trust' } }),
    ];
    const r = detectPositioningMismatch(input({ events }));
    expect(r.insights.length).toBeGreaterThanOrEqual(1);
    expect(r.insights[0]?.kind).toBe('positioning_mismatch');
    expect(r.insights[0]?.description).toContain('trust');
  });

  it('returns empty with too few objections', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.objection_raised', payload: { kind: 'price' } }),
      ev({ eventName: 'commerce.lead.objection_raised', payload: { kind: 'trust' } }),
    ];
    const r = detectPositioningMismatch(input({ events }));
    expect(r.insights).toHaveLength(0);
  });
});

// =========================================================================
// UTP-OFFER-005 — Page Promise Mismatch Detector
// =========================================================================
describe('UTP-OFFER-005 — detectPagePromiseMismatch', () => {
  it('detects page-promise mismatch with high bad-outcome rate', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p1' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p1' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p1' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p1' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p1' } }),
      ev({ eventName: 'commerce.payment.refunded', payload: { productId: 'p1' } }),
      ev({ eventName: 'commerce.payment.refunded', payload: { productId: 'p1' } }),
    ];
    const r = detectPagePromiseMismatch(input({ events }));
    expect(r.insights.length).toBeGreaterThanOrEqual(1);
    expect(r.insights[0]?.kind).toBe('page_promise_mismatch');
    expect(r.insights[0]?.description).toContain('overpromising');
  });

  it('returns empty with low refund rate', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p2' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p2' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p2' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p2' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { productId: 'p2' } }),
    ];
    const r = detectPagePromiseMismatch(input({ events }));
    expect(r.insights).toHaveLength(0);
  });
});

// =========================================================================
// UTP-OFFER-006 — Pricing Psychology Signal Detector
// =========================================================================
describe('UTP-OFFER-006 — detectPricingPsychologySignal', () => {
  it('detects pricing psychology gap at higher price point', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved', payload: { amountCents: 50_00 } }),
      ev({ eventName: 'commerce.payment.approved', payload: { amountCents: 50_00 } }),
      ev({ eventName: 'commerce.payment.approved', payload: { amountCents: 50_00 } }),
      ev({ eventName: 'commerce.payment.approved', payload: { amountCents: 50_00 } }),
      ev({ eventName: 'commerce.payment.approved', payload: { amountCents: 50_00 } }),
      ev({ eventName: 'commerce.payment.declined', payload: { amountCents: 200_00 } }),
      ev({ eventName: 'commerce.payment.declined', payload: { amountCents: 200_00 } }),
      ev({ eventName: 'commerce.payment.declined', payload: { amountCents: 200_00 } }),
      ev({ eventName: 'commerce.payment.declined', payload: { amountCents: 200_00 } }),
    ];
    const r = detectPricingPsychologySignal(input({ events }));
    expect(r.insights.length).toBeGreaterThanOrEqual(1);
    expect(r.insights[0]?.kind).toBe('pricing_psychology');
  });

  it('returns empty with single price point', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved', payload: { amountCents: 50_00 } }),
      ev({ eventName: 'commerce.payment.approved', payload: { amountCents: 50_00 } }),
      ev({ eventName: 'commerce.payment.approved', payload: { amountCents: 50_00 } }),
      ev({ eventName: 'commerce.payment.approved', payload: { amountCents: 50_00 } }),
    ];
    const r = detectPricingPsychologySignal(input({ events }));
    expect(r.insights).toHaveLength(0);
  });
});

// =========================================================================
// UTP-OFFER-007 — Offer Insight Ranker
// =========================================================================
describe('UTP-OFFER-007 — rankOfferInsights', () => {
  it('sorts insights by impactMultiplicative * confidence descending', () => {
    const a = makeInsight({ insightId: 'a', impactMultiplicative: 2.0, confidence: 0.9 });
    const b = makeInsight({ insightId: 'b', impactMultiplicative: 5.0, confidence: 0.3 });
    const c = makeInsight({ insightId: 'c', impactMultiplicative: 3.0, confidence: 0.8 });
    const ranked = rankOfferInsights([a, b, c]);
    expect(ranked[0]?.insightId).toBe('c');
    expect(ranked[1]?.insightId).toBe('a');
    expect(ranked[2]?.insightId).toBe('b');
  });

  it('returns empty array for empty input', () => {
    const ranked = rankOfferInsights([]);
    expect(ranked).toHaveLength(0);
  });
});

// =========================================================================
// UTP-OFFER-008 — Confidence Guard
// =========================================================================
describe('UTP-OFFER-008 — offer confidence guard', () => {
  it('passes insight above default floor', () => {
    const insight = makeInsight({ confidence: 0.7 });
    const r = offerConfidenceFloor(insight);
    expect(r.pass).toBe(true);
  });

  it('filters insight below default floor', () => {
    const insight = makeInsight({ confidence: 0.3 });
    const r = offerConfidenceFloor(insight);
    expect(r.pass).toBe(false);
    expect(r.reason).toContain('below floor');
  });

  it('applies per-kind floor for page_promise_mismatch', () => {
    const insight = makeInsight({ kind: 'page_promise_mismatch', confidence: 0.55 });
    const r = offerConfidenceFloor(insight);
    expect(r.pass).toBe(false);
  });

  it('filterOfferAboveFloor removes low-confidence insights', () => {
    const high = makeInsight({ insightId: 'h', confidence: 0.8 });
    const low = makeInsight({ insightId: 'l', confidence: 0.3 });
    const filtered = filterOfferAboveFloor([high, low]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.insightId).toBe('h');
  });
});

// =========================================================================
// UTP-OFFER-009 — Offer Delivery Service
// =========================================================================
describe('UTP-OFFER-009 — OfferDeliveryService', () => {
  const svc = new OfferDeliveryService();

  it('delivers urgent insights via whatsapp now', () => {
    const insight = makeRanked({ kind: 'promise_strength', recommendedChannel: 'whatsapp', recommendedTiming: 'now' });
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
      kind: 'promise_strength',
      recommendedChannel: 'whatsapp',
      maturityStage: 'maturidade',
    });
    const d = svc.decide(insight);
    expect(d.deliver).toBe(false);
    expect(d.reason).toContain('maturidade');
  });

  it('allows whatsapp delivery for validacao stage', () => {
    const insight = makeRanked({
      kind: 'promise_strength',
      recommendedChannel: 'whatsapp',
      maturityStage: 'validacao',
    });
    const d = svc.decide(insight);
    expect(d.deliver).toBe(true);
  });

  it('deliveryPlan returns sorted channel priorities', () => {
    const i1 = makeRanked({ insightId: 'a', kind: 'promise_strength', recommendedChannel: 'whatsapp', recommendedTiming: 'now' });
    const i2 = makeRanked({ insightId: 'b', kind: 'product_version_fit', recommendedChannel: 'dashboard', recommendedTiming: 'weekly' });
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
