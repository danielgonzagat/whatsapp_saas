/**
 * UTP-ABI-005/006 — abi-ab-harness.service.helpers spec.
 *
 * Validates pure helper functions extracted from AbiAbHarnessService:
 *  - Math utilities: sum, avg, ratio, clamp01
 *  - Claim extraction: extractClaimsFromText
 *  - Commercial outcome: estimateCommercialOutcome
 *  - Aggregate metrics: aggregateMetrics
 *  - R-score projection: projectRScore
 *  - ID generation: generateId
 *  - Constants: R_CRITERIA, PROMOTION_MIN_SAMPLES, PROMOTION_MIN_IMPROVED_CRITERIA
 */

import {
  PROMOTION_MIN_SAMPLES,
  PROMOTION_MIN_IMPROVED_CRITERIA,
  R_CRITERIA,
  generateId,
  sum,
  avg,
  ratio,
  clamp01,
  extractClaimsFromText,
  estimateCommercialOutcome,
  aggregateMetrics,
  projectRScore,
} from './abi-ab-harness.service.helpers';
import type { AbHarnessRecord, AbRCriterionName } from './abi-ab.types';function makeRecord(overrides: Partial<AbHarnessRecord> = {}): AbHarnessRecord {
  return {
    recordId: 'rec_test',
    workspaceId: 'ws_test',
    userMessage: 'test',
    abiUsed: false,
    latencyMs: 200,
    tokensUsed: 150,
    success: true,
    claims: [],
    commercialOutcome: null,
    collectedAt: new Date().toISOString(),
    ...overrides,
  };
}describe('abi-ab-harness.service.helpers', () => {
  describe('constants', () => {
    it('PROMOTION_MIN_SAMPLES is 100', () => {
      expect(PROMOTION_MIN_SAMPLES).toBe(100);
    });

    it('PROMOTION_MIN_IMPROVED_CRITERIA is 3', () => {
      expect(PROMOTION_MIN_IMPROVED_CRITERIA).toBe(3);
    });

    it('R_CRITERIA has 38 entries with valid structure', () => {
      expect(R_CRITERIA).toHaveLength(38);
      const names = new Set<string>();
      for (const c of R_CRITERIA) {
        expect(c.name).toMatch(/^R(?:[1-9]|[12]\d|3[0-8])$/);
        expect(c.family).toBeTruthy();
        expect(c.family.length).toBeGreaterThan(0);
        expect(c.description).toBeTruthy();
        names.add(c.name);
      }
      expect(names.size).toBe(38);
    });
  });  describe('generateId', () => {
    it('returns a string starting with rec_', () => {
      const id = generateId();
      expect(id).toMatch(/^rec_\d+_[a-zA-Z0-9]+$/);
    });

    it('generates unique ids on successive calls', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(100);
    });
  });  describe('sum', () => {
    it('returns 0 for empty array', () => {
      expect(sum([])).toBe(0);
    });

    it('sums positive numbers', () => {
      expect(sum([1, 2, 3, 4])).toBe(10);
    });

    it('sums negative numbers', () => {
      expect(sum([-1, -2, -3])).toBe(-6);
    });

    it('sums mixed signs', () => {
      expect(sum([5, -3, 2])).toBe(4);
    });

    it('handles single element', () => {
      expect(sum([42])).toBe(42);
    });
  });  describe('avg', () => {
    it('returns fallback for empty array', () => {
      expect(avg([], -1)).toBe(-1);
    });

    it('default fallback is 0', () => {
      expect(avg([])).toBe(0);
    });

    it('computes integer average', () => {
      expect(avg([2, 4, 6])).toBe(4);
    });

    it('computes fractional average', () => {
      expect(avg([1, 2])).toBe(1.5);
    });

    it('handles single element', () => {
      expect(avg([7])).toBe(7);
    });
  });  describe('ratio', () => {
    it('returns fallback when denominator is 0', () => {
      expect(ratio(5, 0, -1)).toBe(-1);
    });

    it('default fallback is 0', () => {
      expect(ratio(5, 0)).toBe(0);
    });

    it('computes ratio', () => {
      expect(ratio(3, 4)).toBe(0.75);
    });

    it('returns 0 when numerator is 0', () => {
      expect(ratio(0, 100)).toBe(0);
    });

    it('handles integer result', () => {
      expect(ratio(10, 2)).toBe(5);
    });
  });  describe('clamp01', () => {
    it('returns 0 for negative values', () => {
      expect(clamp01(-0.5)).toBe(0);
      expect(clamp01(-100)).toBe(0);
    });

    it('returns 1 for values above 1', () => {
      expect(clamp01(1.5)).toBe(1);
      expect(clamp01(100)).toBe(1);
    });

    it('returns the value for 0 ≤ x ≤ 1', () => {
      expect(clamp01(0)).toBe(0);
      expect(clamp01(0.5)).toBe(0.5);
      expect(clamp01(1)).toBe(1);
    });
  });  describe('extractClaimsFromText', () => {
    it('returns empty array for short text', () => {
      expect(extractClaimsFromText('Oi.')).toEqual([]);
      expect(extractClaimsFromText('')).toEqual([]);
    });

    it('extracts sentences longer than 10 chars', () => {
      const claims = extractClaimsFromText('Esta é uma frase longa suficiente. Curta.');
      expect(claims).toHaveLength(1);
      expect(claims[0].claim).toContain('Esta é uma frase longa');
    });

    it('truncates claims to 200 characters', () => {
      const longSentence = 'A'.repeat(250);
      const claims = extractClaimsFromText(longSentence);
      expect(claims).toHaveLength(1);
      expect(claims[0].claim.length).toBeLessThanOrEqual(200);
    });

    it('marks claims as proved when proof keywords present', () => {
      const claims = extractClaimsFromText('Segundo o relatório, os dados indicam crescimento.');
      expect(claims).toHaveLength(1);
      expect(claims[0].hasProof).toBe(true);
      expect(claims[0].proofSource).toBe('text-reference');
    });

    it('marks claims as hallucinated when no proof keywords', () => {
      const claims = extractClaimsFromText('O produto X é o melhor do mercado mundial');
      expect(claims).toHaveLength(1);
      expect(claims[0].hasProof).toBe(false);
      expect(claims[0].proofSource).toBeNull();
    });

    it('detects conforme as a proof keyword', () => {
      const claims = extractClaimsFromText('Conforme a política da empresa, isso é permitido.');
      expect(claims).toHaveLength(1);
      expect(claims[0].hasProof).toBe(true);
    });

    it('detects de acordo com as a proof keyword', () => {
      const claims = extractClaimsFromText('De acordo com as normas vigentes, o prazo é de 30 dias.');
      expect(claims).toHaveLength(1);
      expect(claims[0].hasProof).toBe(true);
    });

    it('correctly splits multiple sentences on punctuation', () => {
      const claims = extractClaimsFromText(
        'Primeira frase comprovada conforme relatório. Segunda frase sem prova alguma disso. Terceira com fonte confiável!',
      );
      expect(claims).toHaveLength(3);
      expect(claims[0].hasProof).toBe(true);
      expect(claims[1].hasProof).toBe(false);
      expect(claims[2].hasProof).toBe(true);
    });
  });  describe('estimateCommercialOutcome', () => {
    it('returns null when no signals detected', () => {
      const result = estimateCommercialOutcome({
        responseText: 'Aqui está a informação solicitada.',
        workspaceId: 'ws_1',
      });
      expect(result).toBeNull();
    });

    it('detects conversion signal', () => {
      const result = estimateCommercialOutcome({
        responseText: 'Aproveite nossa oferta exclusiva! Clique aqui para comprar.',
        workspaceId: 'ws_1',
      });
      expect(result).not.toBeNull();
      expect(result!.conversionSignal).toBe(true);
    });

    it('detects satisfaction signal', () => {
      const result = estimateCommercialOutcome({
        responseText: 'Muito obrigado pela sua confiança! Estamos satisfeitos em ajudar.',
        workspaceId: 'ws_1',
      });
      expect(result).not.toBeNull();
      expect(result!.satisfactionSignal).toBe(true);
    });

    it('detects both signals simultaneously', () => {
      const result = estimateCommercialOutcome({
        responseText: 'Excelente! Aproveite o desconto exclusivo. Obrigado!',
        workspaceId: 'ws_1',
      });
      expect(result).not.toBeNull();
      expect(result!.conversionSignal).toBe(true);
      expect(result!.satisfactionSignal).toBe(true);
    });

    it('is case-insensitive', () => {
      const result = estimateCommercialOutcome({
        responseText: 'OBRIGADO! COMPRAR AGORA COM DESCONTO.',
        workspaceId: 'ws_1',
      });
      expect(result).not.toBeNull();
      expect(result!.conversionSignal).toBe(true);
      expect(result!.satisfactionSignal).toBe(true);
    });
  });

  describe('aggregateMetrics', () => {
    it('returns zero metrics for empty records', () => {
      const metrics = aggregateMetrics([]);
      expect(metrics.successRate).toBe(0);
      expect(metrics.avgLatencyMs).toBe(0);
      expect(metrics.avgTokens).toBe(0);
      expect(metrics.hallucinationRate).toBe(0);
      expect(metrics.conversionRate).toBe(0);
      expect(metrics.satisfactionRate).toBe(0);
    });

    it('computes success rate correctly', () => {
      const records = [
        makeRecord({ success: true }),
        makeRecord({ success: false }),
        makeRecord({ success: true }),
        makeRecord({ success: true }),
      ];
      const metrics = aggregateMetrics(records);
      expect(metrics.successRate).toBe(0.75);
    });

    it('computes average latency', () => {
      const records = [
        makeRecord({ latencyMs: 100 }),
        makeRecord({ latencyMs: 200 }),
        makeRecord({ latencyMs: 300 }),
      ];
      const metrics = aggregateMetrics(records);
      expect(metrics.avgLatencyMs).toBe(200);
    });

    it('computes average tokens', () => {
      const records = [
        makeRecord({ tokensUsed: 100 }),
        makeRecord({ tokensUsed: 300 }),
      ];
      const metrics = aggregateMetrics(records);
      expect(metrics.avgTokens).toBe(200);
    });

    it('computes hallucination rate', () => {
      const records = [
        makeRecord({
          claims: [
            { claim: 'fact with proof', hasProof: true, proofSource: 'ref' },
            { claim: 'unproven claim', hasProof: false, proofSource: null },
          ],
        }),
        makeRecord({
          claims: [
            { claim: 'another unproven', hasProof: false, proofSource: null },
          ],
        }),
      ];
      const metrics = aggregateMetrics(records);
      expect(metrics.hallucinationRate).toBe(2 / 3);
    });

    it('computes conversion rate', () => {
      const records = [
        makeRecord({
          commercialOutcome: { conversionSignal: true, satisfactionSignal: false },
        }),
        makeRecord({
          commercialOutcome: { conversionSignal: false, satisfactionSignal: true },
        }),
      ];
      const metrics = aggregateMetrics(records);
      expect(metrics.conversionRate).toBe(0.5);
    });

    it('computes satisfaction rate', () => {
      const records = [
        makeRecord({
          commercialOutcome: { conversionSignal: false, satisfactionSignal: true },
        }),
        makeRecord({
          commercialOutcome: { conversionSignal: false, satisfactionSignal: true },
        }),
        makeRecord({
          commercialOutcome: { conversionSignal: true, satisfactionSignal: false },
        }),
      ];
      const metrics = aggregateMetrics(records);
      expect(metrics.satisfactionRate).toBe(2 / 3);
    });

    it('ignores null commercialOutcome in rate calculations', () => {
      const records = [
        makeRecord({ commercialOutcome: null }),
        makeRecord({
          commercialOutcome: { conversionSignal: true, satisfactionSignal: true },
        }),
      ];
      const metrics = aggregateMetrics(records);
      expect(metrics.conversionRate).toBe(1);
      expect(metrics.satisfactionRate).toBe(1);
    });
  });

  describe('projectRScore', () => {
    const defaultMetrics = {
      successRate: 0.8,
      avgLatencyMs: 200,
      avgTokens: 150,
      hallucinationRate: 0.1,
      conversionRate: 0.6,
      satisfactionRate: 0.7,
    };

    it('returns a value between 0 and 1 for every R criterion', () => {
      for (const c of R_CRITERIA) {
        const score = projectRScore(c.name, defaultMetrics, 100);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });

    it('returns different scores for different criteria', () => {
      const r1 = projectRScore('R1', defaultMetrics, 100);
      const r10 = projectRScore('R10', defaultMetrics, 100);
      expect(r1).not.toBe(r10);
    });

    it('returns 0 for unknown criterion', () => {
      const score = projectRScore('R99' as AbRCriterionName, defaultMetrics, 100);
      expect(score).toBe(0);
    });

    it('returns 1 when all metrics are perfect', () => {
      const perfectMetrics = {
        successRate: 1,
        avgLatencyMs: 0,
        avgTokens: 0,
        hallucinationRate: 0,
        conversionRate: 1,
        satisfactionRate: 1,
      };
      const score = projectRScore('R1', perfectMetrics, 100);
      expect(score).toBe(1);
    });

    it('returns 0 when all success/conversion/satisfaction metrics are zero and hallucination is 1', () => {
      const worstMetrics = {
        successRate: 0,
        avgLatencyMs: 0,
        avgTokens: 0,
        hallucinationRate: 1,
        conversionRate: 0,
        satisfactionRate: 0,
      };
      for (const c of R_CRITERIA) {
        const score = projectRScore(c.name, worstMetrics, 0);
        expect(score).toBe(0);
      }
    });

    it('declines when hallucination rate is high', () => {
      const lowHallucination = {
        ...defaultMetrics,
        hallucinationRate: 0.05,
      };
      const highHallucination = {
        ...defaultMetrics,
        hallucinationRate: 0.8,
      };
      const r10Low = projectRScore('R10', lowHallucination, 100);
      const r10High = projectRScore('R10', highHallucination, 100);
      expect(r10High).toBeLessThan(r10Low);
    });

    it('improves when conversion rate is higher', () => {
      const lowConversion = { ...defaultMetrics, conversionRate: 0.1 };
      const highConversion = { ...defaultMetrics, conversionRate: 0.9 };
      const r1Low = projectRScore('R1', lowConversion, 100);
      const r1High = projectRScore('R1', highConversion, 100);
      expect(r1High).toBeGreaterThan(r1Low);
    });
  });
});