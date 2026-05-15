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

import type {
  AudienceProfile,
  ConversionFeedback,
  PromiseStrengthConversionData,
} from './offer.types';

import { PromiseStrengthDetector } from './promise-strength.detector';
import { PositioningMismatchDetector } from './positioning-mismatch.detector';

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
// UTP-OFFER-002 — PromiseStrengthDetector (copy-level)
// =========================================================================
describe('UTP-OFFER-002 — PromiseStrengthDetector', () => {
  const detector = new PromiseStrengthDetector();

  const strongCopy = 'Método comprovado para multiplicar seus resultados em apenas 7 dias. Garantia incondicional de 30 dias. +200 casos de sucesso documentados.';
  const moderateCopy = 'Aprenda a melhorar seus resultados com nosso sistema. Passo a passo simples.';
  const weakCopy = 'curso legal';
  const emptyCopy = '';

  const highConversion: PromiseStrengthConversionData = {
    leadToCartRate: 0.25,
    cartToPurchaseRate: 0.6,
    overallConversionRate: 0.15,
    sampleSize: 50,
    windowDays: 90,
  };

  const moderateConversion: PromiseStrengthConversionData = {
    leadToCartRate: 0.12,
    cartToPurchaseRate: 0.45,
    overallConversionRate: 0.054,
    sampleSize: 30,
    windowDays: 90,
  };

  const lowConversion: PromiseStrengthConversionData = {
    leadToCartRate: 0.03,
    cartToPurchaseRate: 0.2,
    overallConversionRate: 0.006,
    sampleSize: 40,
    windowDays: 90,
  };

  const smallSample: PromiseStrengthConversionData = {
    leadToCartRate: 0.3,
    cartToPurchaseRate: 0.7,
    overallConversionRate: 0.21,
    sampleSize: 5,
    windowDays: 90,
  };

  it('classifies strong copy with high conversion as strong', () => {
    const r = detector.analyze(strongCopy, highConversion);
    expect(r.strength).toBe('strong');
    expect(r.confidence).toBeGreaterThan(0.5);
    expect(r.evidence.length).toBeGreaterThanOrEqual(4);
  });

  it('classifies moderate copy with moderate conversion as moderate', () => {
    const r = detector.analyze(moderateCopy, moderateConversion);
    expect(r.strength).toBe('moderate');
  });

  it('classifies weak copy with low conversion as weak', () => {
    const r = detector.analyze(weakCopy, lowConversion);
    expect(r.strength).toBe('weak');
    expect(r.confidence).toBeGreaterThan(0);
  });

  it('uses copy analysis primarily when sample size is insufficient', () => {
    const r = detector.analyze(strongCopy, smallSample);
    expect(r.evidence.some((e) => e.includes('low sample size'))).toBe(true);
  });

  it('produces higher confidence with larger sample size', () => {
    const rSmall = detector.analyze(moderateCopy, smallSample);
    const rLarge = detector.analyze(moderateCopy, highConversion);
    expect(rLarge.confidence).toBeGreaterThan(rSmall.confidence);
  });

  it('handles empty copy with conversion data', () => {
    const r = detector.analyze(emptyCopy, highConversion);
    expect(r.strength).toBeDefined();
    expect(r.evidence).not.toHaveLength(0);
  });

  it('includes lead-to-cart and cart-to-purchase in evidence', () => {
    const r = detector.analyze(strongCopy, highConversion);
    expect(r.evidence.some((e) => e.includes('lead-to-cart'))).toBe(true);
    expect(r.evidence.some((e) => e.includes('cart-to-purchase'))).toBe(true);
  });
});

// =========================================================================
// UTP-OFFER-004 — PositioningMismatchDetector (copy + audience level)
// =========================================================================
describe('UTP-OFFER-004 — PositioningMismatchDetector', () => {
  const detector = new PositioningMismatchDetector();

  const promiseTrust = 'Acelere seus resultados com método garantido. +500 clientes satisfeitos.';
  const promiseMismatched = 'Sistema premium exclusivo para empresas de alto nível. Resultados garantidos em 30 dias.';
  const promiseBasic = 'curso online';

  const audiencePremium: AudienceProfile = {
    role: 'empresario',
    painPoints: ['falta de tempo', 'resultados inconsistentes', 'equipe desmotivada'],
    expectedValue: 'automatizacao completa do negocio',
    pricePerception: 'high',
    maturitySignal: 'validacao',
  };

  const audienceAccessible: AudienceProfile = {
    role: 'freelancer',
    painPoints: ['preco alto', 'falta de clientes', 'organizacao'],
    expectedValue: 'ferramenta acessivel',
    pricePerception: 'low',
    maturitySignal: 'validacao',
  };

  const audienceDiverse: AudienceProfile = {
    role: 'gestor',
    painPoints: ['receita', 'churn', 'escalabilidade', 'margem', 'delegacao'],
    expectedValue: 'crescimento sustentavel',
    pricePerception: 'medium',
    maturitySignal: 'crescimento',
  };

  const feedbackTrustIssue: ConversionFeedback = {
    objectionKinds: { price: 10, trust: 15, complexity: 3 },
    lostReasons: { budget: 2, fit: 1 },
    refundReasons: {},
    totalLeads: 50,
  };

  const feedbackExpectationMismatch: ConversionFeedback = {
    objectionKinds: { price: 5, trust: 2 },
    lostReasons: { expectation: 8, budget: 2, fit: 2 },
    refundReasons: { not_as_described: 4, expectation: 2, changed_mind: 1 },
    totalLeads: 30,
  };

  const feedbackClean: ConversionFeedback = {
    objectionKinds: { price: 3, timing: 1 },
    lostReasons: { budget: 1 },
    refundReasons: { changed_mind: 2 },
    totalLeads: 40,
  };

  const feedbackLowLeads: ConversionFeedback = {
    objectionKinds: { price: 1 },
    lostReasons: {},
    refundReasons: {},
    totalLeads: 3,
  };

  it('detects trust gap when trust objections are high and promise lacks proof', () => {
    const r = detector.detect(promiseMismatched, audiencePremium, feedbackTrustIssue);
    expect(r.hasMismatch).toBe(true);
    expect(r.gaps.some((g) => g.category === 'trust_signaling')).toBe(true);
  });

  it('detects expectation mismatch from lost reasons and refunds', () => {
    const r = detector.detect(promiseBasic, audienceDiverse, feedbackExpectationMismatch);
    expect(r.hasMismatch).toBe(true);
    expect(r.gaps.some((g) => g.category === 'expectation_mismatch')).toBe(true);
  });

  it('detects refund positioning mismatch', () => {
    const r = detector.detect(promiseBasic, audienceDiverse, feedbackExpectationMismatch);
    expect(r.gaps.some((g) => g.category === 'refund_positioning')).toBe(true);
  });

  it('detects pain point coverage gap when promise misses audience needs', () => {
    const r = detector.detect(promiseBasic, audienceDiverse, feedbackClean);
    expect(r.gaps.some((g) => g.category === 'pain_point_coverage')).toBe(true);
  });

  it('detects price positioning mismatch with premium language for budget audience', () => {
    const r = detector.detect(promiseMismatched, audienceAccessible, feedbackTrustIssue);
    const priceGap = r.gaps.find((g) => g.category === 'price_positioning');
    expect(priceGap).toBeDefined();
  });

  it('returns no mismatch when promise aligns with audience and feedback is clean', () => {
    const r = detector.detect(promiseTrust, audiencePremium, feedbackClean);
    expect(r.hasMismatch).toBe(false);
    expect(r.severity).toBe('none');
  });

  it('returns data adequacy warning with insufficient leads', () => {
    const r = detector.detect(promiseTrust, audiencePremium, feedbackLowLeads);
    expect(r.gaps.some((g) => g.category === 'data_adequacy')).toBe(true);
  });

  it('assigns critical severity for multiple high-severity gaps', () => {
    const r = detector.detect(promiseBasic, audienceAccessible, feedbackExpectationMismatch);
    const severities = ['none', 'minor', 'moderate', 'critical'];
    expect(severities.indexOf(r.severity)).toBeGreaterThanOrEqual(2);
  });

  it('includes all gap evidence in result evidence', () => {
    const r = detector.detect(promiseBasic, audienceDiverse, feedbackExpectationMismatch);
    expect(r.evidence.length).toBeGreaterThanOrEqual(r.gaps.length);
  });

  it('confidence is higher when more gaps are found', () => {
    const rClean = detector.detect(promiseTrust, audiencePremium, feedbackClean);
    const rMismatch = detector.detect(promiseBasic, audienceDiverse, feedbackExpectationMismatch);
    expect(rMismatch.confidence).toBeGreaterThan(rClean.confidence);
  });
});
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
