import { ProofEvaluatorService } from './proof-evaluator.service';
import type { ProofEvaluationResult } from './proof-evaluator.service';
import type { Hypothesis, SpineSignal } from './types';

function makeHypothesis(
  overrides: Partial<Hypothesis> = {},
): Hypothesis {
  return {
    id: 'hyp-1',
    workspaceId: 'ws-1',
    statement: 'Test hypothesis',
    domain: 'lead_response',
    sourceEventId: 'evt-1',
    confidence: 0.7,
    truthMode: 'observed',
    generatedAt: new Date().toISOString(),
    status: 'authorized',
    ...overrides,
  };
}

function makeEvents(
  count: number,
  valenceRate: number,
  base?: Partial<SpineSignal>,
): SpineSignal[] {
  return Array.from({ length: count }, (_, i) => ({
    eventName: 'commerce.lead.replied',
    workspaceId: 'ws-1',
    truthMode: 'observed' as const,
    valence: i < count * valenceRate ? ('positive' as const) : ('neutral' as const),
    occurredAt: new Date(Date.now() + i * 1000).toISOString(),
    ...base,
  }));
}

function expectVerdict(
  result: ProofEvaluationResult,
  expectedVerdict: 'confirmed' | 'refuted' | 'inconclusive',
) {
  expect(result.verdict).toBe(expectedVerdict);
}

describe('ProofEvaluatorService (service)', () => {
  let svc: ProofEvaluatorService;

  beforeEach(() => {
    svc = new ProofEvaluatorService();
  });

  describe('evaluate()', () => {
    it('returns confirmed when observed has strong positive delta vs baseline', () => {
      const hypothesis = makeHypothesis({ confidence: 0.8 });
      const observed = makeEvents(20, 0.7);
      const baseline = makeEvents(20, 0.3);

      const result = svc.evaluate(hypothesis, observed, baseline);

      expectVerdict(result, 'confirmed');
      expect(result.deltaVsBaseline).toBeGreaterThan(0.05);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('returns refuted when observed has strong negative delta vs baseline', () => {
      const hypothesis = makeHypothesis({ confidence: 0.8 });
      const observed = makeEvents(20, 0.2);
      const baseline = makeEvents(20, 0.7);

      const result = svc.evaluate(hypothesis, observed, baseline);

      expectVerdict(result, 'refuted');
      expect(result.deltaVsBaseline).toBeLessThan(-0.05);
    });

    it('returns inconclusive when delta is near zero', () => {
      const hypothesis = makeHypothesis({ confidence: 0.8 });
      const observed = makeEvents(20, 0.5);
      const baseline = makeEvents(20, 0.5);

      const result = svc.evaluate(hypothesis, observed, baseline);

      expectVerdict(result, 'inconclusive');
      expect(Math.abs(result.deltaVsBaseline)).toBeLessThan(0.05);
    });

    it('returns inconclusive when sample size is below minimum', () => {
      const hypothesis = makeHypothesis({ confidence: 0.8 });
      const observed = makeEvents(1, 0.8);
      const baseline = makeEvents(10, 0.2);

      const result = svc.evaluate(hypothesis, observed, baseline);

      expectVerdict(result, 'inconclusive');
      expect(result.sampleSize).toBe(1);
    });

    it('confidence increases with larger sample size', () => {
      const hypothesis = makeHypothesis({ confidence: 0.7 });
      const baseline = makeEvents(10, 0.3);

      const smallResult = svc.evaluate(hypothesis, makeEvents(5, 0.7), baseline);
      const largeResult = svc.evaluate(hypothesis, makeEvents(50, 0.7), baseline);

      expect(largeResult.confidence).toBeGreaterThan(smallResult.confidence);
    });

    it('handles empty baseline events (baseline positive rate = 0)', () => {
      const hypothesis = makeHypothesis({ confidence: 0.8 });
      const observed = makeEvents(20, 0.6);
      const baseline: SpineSignal[] = [];

      const result = svc.evaluate(hypothesis, observed, baseline);

      expect(result.deltaVsBaseline).toBe(0.6);
    });

    it('handles all-neutral observed events against positive baseline', () => {
      const hypothesis = makeHypothesis({ confidence: 0.8 });
      const observed = makeEvents(20, 0);
      const baseline = makeEvents(20, 0.7);

      const result = svc.evaluate(hypothesis, observed, baseline);

      expectVerdict(result, 'refuted');
      expect(result.deltaVsBaseline).toBeLessThan(-0.05);
    });

    it('sampleSize equals observedEvents.length', () => {
      const hypothesis = makeHypothesis();
      const observed = makeEvents(42, 0.5);
      const baseline = makeEvents(10, 0.5);

      const result = svc.evaluate(hypothesis, observed, baseline);

      expect(result.sampleSize).toBe(42);
    });

    it('deltaVsBaseline equals difference in positive valence rates', () => {
      const hypothesis = makeHypothesis({ confidence: 0.8 });
      const observed = makeEvents(100, 0.75);
      const baseline = makeEvents(100, 0.25);

      const result = svc.evaluate(hypothesis, observed, baseline);

      expect(result.deltaVsBaseline).toBeCloseTo(0.5, 1);
    });

    it('returns inconclusive for hypothesis with very low prior confidence', () => {
      const hypothesis = makeHypothesis({ confidence: 0.05 });
      const observed = makeEvents(10, 0.9);
      const baseline = makeEvents(10, 0.1);

      const result = svc.evaluate(hypothesis, observed, baseline);

      expectVerdict(result, 'inconclusive');
    });

    it('returns inconclusive for large delta but tiny sample', () => {
      const hypothesis = makeHypothesis({ confidence: 0.8 });
      const observed = makeEvents(1, 1.0);
      const baseline = makeEvents(10, 0);

      const result = svc.evaluate(hypothesis, observed, baseline);

      expectVerdict(result, 'inconclusive');
      expect(result.sampleSize).toBe(1);
    });
  });
});
