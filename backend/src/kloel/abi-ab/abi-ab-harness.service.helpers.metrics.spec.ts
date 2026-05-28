/**
 * UTP-ABI-005/006 — abi-ab-harness.service.helpers metrics spec.
 *
 * Validates record-aggregation and R-score projection helpers:
 *  - aggregateMetrics
 *  - projectRScore
 */

import {
  R_CRITERIA,
  aggregateMetrics,
  projectRScore,
} from './abi-ab-harness.service.helpers';
import type { AbHarnessRecord, AbRCriterionName } from './abi-ab.types';

function makeRecord(overrides: Partial<AbHarnessRecord> = {}): AbHarnessRecord {
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
}

describe('abi-ab-harness.service.helpers — metrics', () => {
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
