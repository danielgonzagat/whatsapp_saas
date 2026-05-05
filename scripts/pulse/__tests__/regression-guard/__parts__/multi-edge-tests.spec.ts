import { describe, it, expect } from 'vitest';
import { detectRegression } from '../../../regression-guard';
import {
  U,
  Z,
  U2,
  U3,
  U4,
  U5,
  U10,
  U15,
  D_SCORE,
  D_TIER,
  D_CODACY,
  D_RUNTIME_HIGH,
  D_OBS_PASS,
  D_OBS_FAIL,
  D_CRITICAL,
  D_IMPRECISE,
  D_UNKNOWN,
  T,
  makeSnapshot,
} from './constants.spec';

describe('detectRegression', () => {
  describe('multiple simultaneous regressions', () => {
    it('reports all regressions when several metrics worsen at once', () => {
      const before = makeSnapshot({
        score: D_SCORE,
        blockingTier: U,
        codacyHighCount: U10,
        gatesPass: { staticPass: T, runtimePass: T },
        scenarioPass: { 'customer-auth-shell': T },
        runtimeHighSignals: U2,
      });
      const after = makeSnapshot({
        score: D_SCORE - U10,
        blockingTier: U2,
        codacyHighCount: U15,
        gatesPass: { staticPass: U < Z, runtimePass: U < Z },
        scenarioPass: { 'customer-auth-shell': U < Z },
        runtimeHighSignals: U5,
      });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(T);
      expect(result.reasons.length).toBeGreaterThanOrEqual(U3 + U3);
      expect(result.deltas.scoreDelta).toBe(-U10);
      expect(result.deltas.tierDelta).toBe(U);
      expect(result.deltas.codacyHighDelta).toBe(U5);
      expect(result.deltas.gatesRegressed).toHaveLength(U2);
      expect(result.deltas.scenariosRegressed).toHaveLength(U);
      expect(result.deltas.runtimeHighDelta).toBe(U3);
    });

    it('reports execution matrix regressions when critical evidence worsens', () => {
      const before = makeSnapshot({
        executionMatrixSummary: {
          observedPass: U10,
          criticalUnobservedPaths: U2,
          observedFail: Z,
          impreciseBreakpoints: Z,
          unknownPaths: Z,
        },
      });
      const after = makeSnapshot({
        executionMatrixSummary: {
          observedPass: U10 - U,
          criticalUnobservedPaths: U3,
          observedFail: Z,
          impreciseBreakpoints: Z,
          unknownPaths: Z,
        },
      });

      const result = detectRegression(before, after);

      expect(result.regressed).toBe(T);
      expect(result.deltas.executionMatrixRegressions).toContain(`observedPass:${U10}->${U10 - U}`);
      expect(result.deltas.executionMatrixRegressions).toContain(
        `criticalUnobservedPaths:${U2}->${U3}`,
      );
    });

    it('blocks score improvement when only planned or inferred debt improves', () => {
      const before = makeSnapshot({
        score: D_SCORE,
        executionMatrixSummary: {
          observedPass: U10,
          observedFail: Z,
          untested: U4,
          inferredOnly: U3,
          criticalUnobservedPaths: U2,
          impreciseBreakpoints: Z,
          unknownPaths: Z,
        },
        proofReadinessSummary: {
          observedEvidence: U2,
          observedPass: U2,
          observedFail: Z,
          plannedEvidence: U5,
          plannedOrUnexecutedEvidence: U5,
          nonObservedEvidence: U5,
        },
      });
      const after = makeSnapshot({
        score: D_SCORE + U5,
        executionMatrixSummary: {
          observedPass: U10,
          observedFail: Z,
          untested: U2,
          inferredOnly: U,
          criticalUnobservedPaths: U,
          impreciseBreakpoints: Z,
          unknownPaths: Z,
        },
        proofReadinessSummary: {
          observedEvidence: U2,
          observedPass: U2,
          observedFail: Z,
          plannedEvidence: U3,
          plannedOrUnexecutedEvidence: U3,
          nonObservedEvidence: U3,
        },
      });

      const result = detectRegression(before, after);

      expect(result.regressed).toBe(T);
      expect(result.deltas.scoreDelta).toBe(U5);
      expect(result.deltas.unsupportedScoreIncrease).toContain(
        `executionMatrix.untested:${U4}->${U2}`,
      );
      expect(result.deltas.unsupportedScoreIncrease).toContain(
        `executionMatrix.inferredOnly:${U3}->${U}`,
      );
      expect(result.deltas.unsupportedScoreIncrease).toContain(
        `proofReadiness.plannedOrUnexecutedEvidence:${U5}->${U3}`,
      );
      expect(
        result.reasons.some((reason) =>
          reason.includes('planned/inferred-only reductions cannot improve score alone'),
        ),
      ).toBe(T);
    });

    it('allows score improvement when observed evidence improves', () => {
      const before = makeSnapshot({
        score: D_SCORE,
        executionMatrixSummary: {
          observedPass: U10,
          observedFail: U,
          untested: U4,
          inferredOnly: U3,
          criticalUnobservedPaths: U2,
          impreciseBreakpoints: Z,
          unknownPaths: Z,
        },
      });
      const after = makeSnapshot({
        score: D_SCORE + U5,
        executionMatrixSummary: {
          observedPass: U10 + U,
          observedFail: Z,
          untested: U2,
          inferredOnly: U,
          criticalUnobservedPaths: U,
          impreciseBreakpoints: Z,
          unknownPaths: Z,
        },
      });

      const result = detectRegression(before, after);

      expect(result.regressed).toBe(U < Z);
      expect(result.deltas.unsupportedScoreIncrease).toHaveLength(Z);
    });
  });

  describe('edge cases', () => {
    it('handles empty gatesPass and scenarioPass maps', () => {
      const before = makeSnapshot({ gatesPass: {}, scenarioPass: {} });
      const after = makeSnapshot({ gatesPass: {}, scenarioPass: {} });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(U < Z);
    });

    it('handles zero values without false positives', () => {
      const snap = makeSnapshot({
        score: Z,
        blockingTier: Z,
        codacyHighCount: Z,
        runtimeHighSignals: Z,
      });
      const result = detectRegression(snap, { ...snap });
      expect(result.regressed).toBe(U < Z);
    });
  });
});
