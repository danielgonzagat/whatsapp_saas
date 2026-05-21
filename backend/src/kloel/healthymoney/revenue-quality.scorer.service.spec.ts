import { RevenueQualityScorerService } from './revenue-quality.scorer.service';
import type { RevenueQualityInput } from './healthymoney.types';

function makeHealthy(): RevenueQualityInput {
  return {
    amountCents: 10_000,
    marginPct: 0.8,
    refundRiskScore: 0.05,
    supportCostEstimateCents: 200,
    churnRiskScore: 0.1,
    brandWearScore: 0.05,
    ltvProjectionCents: 40_000,
  };
}

function emptyInput(): RevenueQualityInput {
  return {
    amountCents: 0,
    marginPct: 0,
    refundRiskScore: 0,
    supportCostEstimateCents: 0,
    churnRiskScore: 0,
    brandWearScore: 0,
    ltvProjectionCents: 0,
  };
}

describe('RevenueQualityScorerService (UTP-HEALTHYMONEY-001)', () => {
  const svc = new RevenueQualityScorerService();

  it('scores a perfectly healthy payment', () => {
    const result = svc.score(makeHealthy());
    expect(result.classification).toBe('healthy');
    expect(result.qualityScore).toBeGreaterThanOrEqual(0.7);
    expect(result.blockerSuggestion).toBeUndefined();
  });

  it('scores a borderline payment with moderate risk signals', () => {
    const result = svc.score({
      amountCents: 10_000,
      marginPct: 0.4,
      refundRiskScore: 0.4,
      supportCostEstimateCents: 1500,
      churnRiskScore: 0.35,
      brandWearScore: 0.3,
      ltvProjectionCents: 25_000,
    });
    expect(result.classification).toBe('borderline');
    expect(result.qualityScore).toBeGreaterThanOrEqual(0.3);
    expect(result.qualityScore).toBeLessThan(0.7);
  });

  it('scores an unhealthy payment with extreme risk signals', () => {
    const result = svc.score({
      amountCents: 10_000,
      marginPct: 0.1,
      refundRiskScore: 0.9,
      supportCostEstimateCents: 8_000,
      churnRiskScore: 0.85,
      brandWearScore: 0.95,
      ltvProjectionCents: 2_000,
    });
    expect(result.classification).toBe('unhealthy');
    expect(result.qualityScore).toBeLessThan(0.3);
    expect(result.blockerSuggestion).toBeDefined();
    expect(result.blockerSuggestion!.length).toBeGreaterThan(0);
  });

  it('returns blockerSuggestion only for unhealthy classification', () => {
    const healthy = svc.score(makeHealthy());
    expect(healthy.blockerSuggestion).toBeUndefined();

    const unhealthy = svc.score({
      amountCents: 5_000,
      marginPct: 0.05,
      refundRiskScore: 0.95,
      supportCostEstimateCents: 5_000,
      churnRiskScore: 0.9,
      brandWearScore: 0.95,
      ltvProjectionCents: 1_000,
    });
    expect(unhealthy.blockerSuggestion).toBeDefined();
  });

  it('clamps qualityScore to [0, 1] with extreme negative values', () => {
    const result = svc.score({
      amountCents: 1,
      marginPct: -5,
      refundRiskScore: 100,
      supportCostEstimateCents: 999_999,
      churnRiskScore: 50,
      brandWearScore: 99,
      ltvProjectionCents: -99_999,
    });
    expect(result.qualityScore).toBeGreaterThanOrEqual(0);
    expect(result.qualityScore).toBeLessThanOrEqual(1);
  });

  it('clamps qualityScore to [0, 1] with extreme positive values', () => {
    const result = svc.score({
      amountCents: 100_000,
      marginPct: 2,
      refundRiskScore: -1,
      supportCostEstimateCents: -100,
      churnRiskScore: -5,
      brandWearScore: -10,
      ltvProjectionCents: 9_999_999,
    });
    expect(result.qualityScore).toBeGreaterThanOrEqual(0);
    expect(result.qualityScore).toBeLessThanOrEqual(1);
  });

  it('handles zero amountCents gracefully', () => {
    const result = svc.score({
      amountCents: 0,
      marginPct: 0.5,
      refundRiskScore: 0.3,
      supportCostEstimateCents: 100,
      churnRiskScore: 0.2,
      brandWearScore: 0.1,
      ltvProjectionCents: 10_000,
    });
    expect(result.qualityScore).toBeGreaterThanOrEqual(0);
    expect(result.qualityScore).toBeLessThanOrEqual(1);
    expect(result.dimensions.ltvScore).toBe(0);
  });

  it('produces consistent reasoning string', () => {
    const result = svc.score(makeHealthy());
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.reasoning).toContain('classificação healthy');
    expect(result.reasoning).toContain('Destaque positivo');
    expect(result.reasoning).toContain('Principal limitador');
  });

  it('reasoning reflects unhealthy classification', () => {
    const result = svc.score({
      amountCents: 5_000,
      marginPct: 0.1,
      refundRiskScore: 0.9,
      supportCostEstimateCents: 5_000,
      churnRiskScore: 0.9,
      brandWearScore: 0.9,
      ltvProjectionCents: 1_000,
    });
    expect(result.reasoning).toContain('classificação unhealthy');
  });

  it('beliefs dimension scores are in [0, 1]', () => {
    const result = svc.score(makeHealthy());
    for (const dim of Object.values(result.dimensions)) {
      expect(dim).toBeGreaterThanOrEqual(0);
      expect(dim).toBeLessThanOrEqual(1);
    }
  });

  it('high margin with zero risk yields healthy score near 1', () => {
    const result = svc.score({
      amountCents: 50_000,
      marginPct: 1,
      refundRiskScore: 0,
      supportCostEstimateCents: 0,
      churnRiskScore: 0,
      brandWearScore: 0,
      ltvProjectionCents: 250_000,
    });
    expect(result.qualityScore).toBeGreaterThan(0.9);
    expect(result.classification).toBe('healthy');
  });

  it('tiny margin with high risk yields unhealthy score', () => {
    const result = svc.score({
      amountCents: 1_000,
      marginPct: 0.02,
      refundRiskScore: 0.85,
      supportCostEstimateCents: 800,
      churnRiskScore: 0.8,
      brandWearScore: 0.75,
      ltvProjectionCents: 500,
    });
    expect(result.qualityScore).toBeLessThan(0.3);
    expect(result.classification).toBe('unhealthy');
  });

  it('repeated calls with same input are idempotent', () => {
    const input = makeHealthy();
    const a = svc.score(input);
    const b = svc.score(input);
    expect(a.qualityScore).toBe(b.qualityScore);
    expect(a.classification).toBe(b.classification);
  });

  it('evaluatedAt is a valid ISO timestamp', () => {
    const result = svc.score(makeHealthy());
    const parsed = Date.parse(result.evaluatedAt);
    expect(Number.isNaN(parsed)).toBe(false);
    expect(new Date(result.evaluatedAt).toISOString()).toBe(result.evaluatedAt);
  });

  it('high refund risk alone pushes towards unhealthy', () => {
    const result = svc.score({
      amountCents: 10_000,
      marginPct: 0.6,
      refundRiskScore: 0.95,
      supportCostEstimateCents: 500,
      churnRiskScore: 0.2,
      brandWearScore: 0.1,
      ltvProjectionCents: 30_000,
    });
    expect(result.qualityScore).toBeLessThan(0.7);
  });

  it('high brand wear alone pushes score below 0.80', () => {
    const result = svc.score({
      amountCents: 10_000,
      marginPct: 0.7,
      refundRiskScore: 0.1,
      supportCostEstimateCents: 300,
      churnRiskScore: 0.15,
      brandWearScore: 0.95,
      ltvProjectionCents: 35_000,
    });
    expect(result.qualityScore).toBeLessThan(0.80);
    expect(result.dimensions.brandScore).toBeLessThan(0.1);
  });

  it('very high LTV lifts score above borderline', () => {
    const result = svc.score({
      amountCents: 5_000,
      marginPct: 0.5,
      refundRiskScore: 0.4,
      supportCostEstimateCents: 1_000,
      churnRiskScore: 0.45,
      brandWearScore: 0.4,
      ltvProjectionCents: 50_000,
    });
    expect(result.qualityScore).toBeGreaterThanOrEqual(0.3);
  });

  it('dimensions are exposed for dashboard consumption', () => {
    const result = svc.score(makeHealthy());
    expect(result.dimensions.marginScore).toBeDefined();
    expect(result.dimensions.refundScore).toBeDefined();
    expect(result.dimensions.supportScore).toBeDefined();
    expect(result.dimensions.churnScore).toBeDefined();
    expect(result.dimensions.brandScore).toBeDefined();
    expect(result.dimensions.ltvScore).toBeDefined();
  });

  it('empty input does not crash', () => {
    const result = svc.score(emptyInput());
    expect(result.qualityScore).toBeGreaterThanOrEqual(0);
    expect(result.qualityScore).toBeLessThanOrEqual(1);
    expect(result.classification).toBeDefined();
  });
});
