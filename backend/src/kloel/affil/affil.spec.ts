import { OfferQualityScorerService } from './offer-quality.scorer.service';
import { ProducerTrustScorerService } from './producer-trust.scorer.service';

describe('OfferQualityScorerService', () => {
  const svc = new OfferQualityScorerService();

  it('classifies as excellent with all max-quality signals', () => {
    const result = svc.score({
      commissionPct: 100,
      conversionRateHistorical: 1,
      supportQuality: 1,
      refundRate: 0,
      audienceFitScore: 1,
    });
    expect(result.score).toBe(100);
    expect(result.classification).toBe('excellent');
    expect(result.recommendation).toContain('Priorizar');
  });

  it('classifies as good with strong but not max signals', () => {
    const result = svc.score({
      commissionPct: 70,
      conversionRateHistorical: 0.7,
      supportQuality: 0.7,
      refundRate: 0.15,
      audienceFitScore: 0.7,
    });
    expect(result.score).toBeGreaterThanOrEqual(65);
    expect(result.score).toBeLessThan(80);
    expect(result.classification).toBe('good');
    expect(result.recommendation).toContain('sólida');
  });

  it('classifies as average with mid-range signals', () => {
    const result = svc.score({
      commissionPct: 50,
      conversionRateHistorical: 0.5,
      supportQuality: 0.5,
      refundRate: 0.3,
      audienceFitScore: 0.5,
    });
    expect(result.score).toBeGreaterThanOrEqual(45);
    expect(result.score).toBeLessThan(65);
    expect(result.classification).toBe('average');
    expect(result.recommendation).toContain('Monitorar');
  });

  it('classifies as poor with all worst-quality signals', () => {
    const result = svc.score({
      commissionPct: 0,
      conversionRateHistorical: 0,
      supportQuality: 0,
      refundRate: 1,
      audienceFitScore: 0,
    });
    expect(result.score).toBe(0);
    expect(result.classification).toBe('poor');
    expect(result.recommendation).toContain('Evitar');
  });

  it('penalizes score when refund rate is high', () => {
    const lowRefund = svc.score({
      commissionPct: 50,
      conversionRateHistorical: 0.5,
      supportQuality: 0.5,
      refundRate: 0,
      audienceFitScore: 0.5,
    });
    const highRefund = svc.score({
      commissionPct: 50,
      conversionRateHistorical: 0.5,
      supportQuality: 0.5,
      refundRate: 0.8,
      audienceFitScore: 0.5,
    });
    expect(highRefund.score).toBeLessThan(lowRefund.score);
  });

  it('returns non-zero score even with zero commission when other signals are strong', () => {
    const result = svc.score({
      commissionPct: 0,
      conversionRateHistorical: 0.9,
      supportQuality: 0.9,
      refundRate: 0,
      audienceFitScore: 0.9,
    });
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
  });

  it('clamps output score to [0, 100] range', () => {
    const extreme = svc.score({
      commissionPct: 999,
      conversionRateHistorical: 2,
      supportQuality: 2,
      refundRate: -1,
      audienceFitScore: 3,
    });
    expect(extreme.score).toBeGreaterThanOrEqual(0);
    expect(extreme.score).toBeLessThanOrEqual(100);
  });

  it('classifies at boundary: score >= 80 is excellent', () => {
    const result = svc.score({
      commissionPct: 77,
      conversionRateHistorical: 0.77,
      supportQuality: 0.77,
      refundRate: 0.04,
      audienceFitScore: 0.77,
    });
    expect(result.score).toBe(80);
    expect(result.classification).toBe('excellent');
  });

  it('classifies at boundary: score 65 is good', () => {
    const result = svc.score({
      commissionPct: 60,
      conversionRateHistorical: 0.60,
      supportQuality: 0.60,
      refundRate: 0.09,
      audienceFitScore: 0.60,
    });
    expect(result.score).toBe(65);
    expect(result.classification).toBe('good');
  });

  it('classifies at boundary: score 45 is average', () => {
    const result = svc.score({
      commissionPct: 39,
      conversionRateHistorical: 0.39,
      supportQuality: 0.39,
      refundRate: 0.21,
      audienceFitScore: 0.39,
    });
    expect(result.score).toBe(45);
    expect(result.classification).toBe('average');
  });

  it('classifies score below 45 as poor', () => {
    const result = svc.score({
      commissionPct: 20,
      conversionRateHistorical: 0.2,
      supportQuality: 0.2,
      refundRate: 0.6,
      audienceFitScore: 0.2,
    });
    expect(result.score).toBeLessThan(45);
    expect(result.classification).toBe('poor');
  });
});

describe('ProducerTrustScorerService', () => {
  const svc = new ProducerTrustScorerService();

  it('returns maximum trustScore with all perfect signals', () => {
    const result = svc.score({
      paymentReliability: 1,
      refundResolutionTime: 0,
      complianceHistory: 1,
      communicationScore: 1,
    });
    expect(result.trustScore).toBe(100);
  });

  it('returns zero trustScore with worst signals and slowest refund', () => {
    const result = svc.score({
      paymentReliability: 0,
      refundResolutionTime: 1,
      complianceHistory: 0,
      communicationScore: 0,
    });
    expect(result.trustScore).toBe(0);
  });

  it('penalizes trust when refund resolution is slow', () => {
    const fast = svc.score({
      paymentReliability: 0.8,
      refundResolutionTime: 0,
      complianceHistory: 0.8,
      communicationScore: 0.8,
    });
    const slow = svc.score({
      paymentReliability: 0.8,
      refundResolutionTime: 1,
      complianceHistory: 0.8,
      communicationScore: 0.8,
    });
    expect(slow.trustScore).toBeLessThan(fast.trustScore);
  });

  it('reduces trust when compliance history is poor', () => {
    const goodCompliance = svc.score({
      paymentReliability: 0.8,
      refundResolutionTime: 0.2,
      complianceHistory: 1,
      communicationScore: 0.8,
    });
    const badCompliance = svc.score({
      paymentReliability: 0.8,
      refundResolutionTime: 0.2,
      complianceHistory: 0,
      communicationScore: 0.8,
    });
    expect(badCompliance.trustScore).toBeLessThan(goodCompliance.trustScore);
  });

  it('returns mid trustScore for all mid-range values', () => {
    const result = svc.score({
      paymentReliability: 0.5,
      refundResolutionTime: 0.5,
      complianceHistory: 0.5,
      communicationScore: 0.5,
    });
    expect(result.trustScore).toBe(50);
  });

  it('reduces trust when communication score is poor alone', () => {
    const goodComm = svc.score({
      paymentReliability: 0.8,
      refundResolutionTime: 0.2,
      complianceHistory: 0.8,
      communicationScore: 1,
    });
    const badComm = svc.score({
      paymentReliability: 0.8,
      refundResolutionTime: 0.2,
      complianceHistory: 0.8,
      communicationScore: 0,
    });
    expect(badComm.trustScore).toBeLessThan(goodComm.trustScore);
  });

  it('clamps trustScore to [0, 100] with out-of-range inputs', () => {
    const result = svc.score({
      paymentReliability: 5,
      refundResolutionTime: -2,
      complianceHistory: 10,
      communicationScore: -5,
    });
    expect(result.trustScore).toBeGreaterThanOrEqual(0);
    expect(result.trustScore).toBeLessThanOrEqual(100);
  });

  it('gives bonus for instant refund resolution even with other low signals', () => {
    const instant = svc.score({
      paymentReliability: 0.2,
      refundResolutionTime: 0,
      complianceHistory: 0.2,
      communicationScore: 0.2,
    });
    const slow = svc.score({
      paymentReliability: 0.2,
      refundResolutionTime: 1,
      complianceHistory: 0.2,
      communicationScore: 0.2,
    });
    expect(instant.trustScore).toBeGreaterThan(slow.trustScore);
  });

  it('paymentReliability dominates the score as highest-weight factor', () => {
    const lowPayment = svc.score({
      paymentReliability: 0,
      refundResolutionTime: 0,
      complianceHistory: 1,
      communicationScore: 1,
    });
    const highPayment = svc.score({
      paymentReliability: 1,
      refundResolutionTime: 0,
      complianceHistory: 1,
      communicationScore: 1,
    });
    const difference = highPayment.trustScore - lowPayment.trustScore;
    expect(difference).toBe(35);
  });
});
