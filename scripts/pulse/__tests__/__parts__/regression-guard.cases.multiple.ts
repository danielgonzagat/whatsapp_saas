import { describe, it, expect } from 'vitest';
import { detectRegression } from '../../regression-guard';
import { makeSnapshot } from './regression-guard.helpers';

describe('detectRegression', () => {
  describe('multiple simultaneous regressions', () => {
    it('reports all regressions when several metrics worsen at once', () => {
      const before = makeSnapshot({
        score: 80,
        blockingTier: 1,
        codacyHighCount: 10,
        gatesPass: { staticPass: true, runtimePass: true },
        scenarioPass: { 'customer-auth-shell': true },
        runtimeHighSignals: 2,
      });
      const after = makeSnapshot({
        score: 70,
        blockingTier: 2,
        codacyHighCount: 15,
        gatesPass: { staticPass: false, runtimePass: false },
        scenarioPass: { 'customer-auth-shell': false },
        runtimeHighSignals: 5,
      });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(true);
      expect(result.reasons.length).toBeGreaterThanOrEqual(6);
      expect(result.deltas.scoreDelta).toBe(-10);
      expect(result.deltas.tierDelta).toBe(1);
      expect(result.deltas.codacyHighDelta).toBe(5);
      expect(result.deltas.gatesRegressed).toHaveLength(2);
      expect(result.deltas.scenariosRegressed).toHaveLength(1);
      expect(result.deltas.runtimeHighDelta).toBe(3);
    });

    it('reports execution matrix regressions when critical evidence worsens', () => {
      const before = makeSnapshot({
        executionMatrixSummary: {
          observedPass: 10,
          criticalUnobservedPaths: 2,
          observedFail: 0,
          impreciseBreakpoints: 0,
          unknownPaths: 0,
        },
      });
      const after = makeSnapshot({
        executionMatrixSummary: {
          observedPass: 9,
          criticalUnobservedPaths: 3,
          observedFail: 0,
          impreciseBreakpoints: 0,
          unknownPaths: 0,
        },
      });

      const result = detectRegression(before, after);

      expect(result.regressed).toBe(true);
      expect(result.deltas.executionMatrixRegressions).toContain('observedPass:10->9');
      expect(result.deltas.executionMatrixRegressions).toContain('criticalUnobservedPaths:2->3');
    });

    it('blocks score improvement when only planned or inferred debt improves', () => {
      const before = makeSnapshot({
        score: 80,
        executionMatrixSummary: {
          observedPass: 10,
          observedFail: 0,
          untested: 4,
          inferredOnly: 3,
          criticalUnobservedPaths: 2,
          impreciseBreakpoints: 0,
          unknownPaths: 0,
        },
        proofReadinessSummary: {
          observedEvidence: 2,
          observedPass: 2,
          observedFail: 0,
          plannedEvidence: 5,
          plannedOrUnexecutedEvidence: 5,
          nonObservedEvidence: 5,
        },
      });
      const after = makeSnapshot({
        score: 85,
        executionMatrixSummary: {
          observedPass: 10,
          observedFail: 0,
          untested: 2,
          inferredOnly: 1,
          criticalUnobservedPaths: 1,
          impreciseBreakpoints: 0,
          unknownPaths: 0,
        },
        proofReadinessSummary: {
          observedEvidence: 2,
          observedPass: 2,
          observedFail: 0,
          plannedEvidence: 3,
          plannedOrUnexecutedEvidence: 3,
          nonObservedEvidence: 3,
        },
      });

      const result = detectRegression(before, after);

      expect(result.regressed).toBe(true);
      expect(result.deltas.scoreDelta).toBe(5);
      expect(result.deltas.unsupportedScoreIncrease).toContain('executionMatrix.untested:4->2');
      expect(result.deltas.unsupportedScoreIncrease).toContain('executionMatrix.inferredOnly:3->1');
      expect(result.deltas.unsupportedScoreIncrease).toContain(
        'proofReadiness.plannedOrUnexecutedEvidence:5->3',
      );
      expect(
        result.reasons.some((reason) =>
          reason.includes('planned/inferred-only reductions cannot improve score alone'),
        ),
      ).toBe(true);
    });

    it('allows score improvement when observed evidence improves', () => {
      const before = makeSnapshot({
        score: 80,
        executionMatrixSummary: {
          observedPass: 10,
          observedFail: 1,
          untested: 4,
          inferredOnly: 3,
          criticalUnobservedPaths: 2,
          impreciseBreakpoints: 0,
          unknownPaths: 0,
        },
      });
      const after = makeSnapshot({
        score: 85,
        executionMatrixSummary: {
          observedPass: 11,
          observedFail: 0,
          untested: 2,
          inferredOnly: 1,
          criticalUnobservedPaths: 1,
          impreciseBreakpoints: 0,
          unknownPaths: 0,
        },
      });

      const result = detectRegression(before, after);

      expect(result.regressed).toBe(false);
      expect(result.deltas.unsupportedScoreIncrease).toHaveLength(0);
    });
  });
});
