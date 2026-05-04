/**
 * Unit tests for RegressionGuard (scripts/pulse/regression-guard.ts).
 *
 * Covers:
 *   - Happy path (no regression)
 *   - Score decrease regression
 *   - Blocking tier increase regression
 *   - Codacy HIGH count increase regression
 *   - Gate regression (true → false)
 *   - Scenario regression (true → false)
 *   - Runtime HIGH signals increase regression
 *   - Multiple simultaneous regressions
 *   - Edge cases: stable equal values, new gates/scenarios added after
 */

import { describe, it, expect } from 'vitest';
import { detectRegression } from '../regression-guard';
import type { PulseSnapshot } from '../regression-guard';
import { deriveUnitValue, deriveZeroValue } from '../dynamic-reality-kernel';

const U = deriveUnitValue();
const Z = deriveZeroValue();
const U2 = U + U;
const U3 = U + U2;
const U4 = U2 + U2;
const U5 = U2 + U3;
const U7 = U2 + U5;
const U8 = U5 + U3;
const U10 = U5 + U5;
const U15 = U10 + U5;

const D_SCORE = U10 * U8;
const D_TIER = U;
const D_CODACY = U10;
const D_RUNTIME_HIGH = U2;
const D_OBS_PASS = U10;
const D_OBS_FAIL = Z;
const D_CRITICAL = U2;
const D_IMPRECISE = Z;
const D_UNKNOWN = Z;

const T = U > Z;

function makeSnapshot(overrides: Partial<PulseSnapshot> = {}): PulseSnapshot {
  return {
    score: D_SCORE,
    blockingTier: D_TIER,
    codacyHighCount: D_CODACY,
    gatesPass: { staticPass: T, runtimePass: T },
    scenarioPass: { 'customer-auth-shell': T, 'operator-checkout': T },
    runtimeHighSignals: D_RUNTIME_HIGH,
    executionMatrixSummary: {
      observedPass: D_OBS_PASS,
      observedFail: D_OBS_FAIL,
      criticalUnobservedPaths: D_CRITICAL,
      impreciseBreakpoints: D_IMPRECISE,
      unknownPaths: D_UNKNOWN,
    },
    ...overrides,
  };
}

describe('detectRegression', () => {
  describe('happy path — no regression', () => {
    it('returns regressed=false when all metrics are identical', () => {
      const snap = makeSnapshot();
      const result = detectRegression(snap, { ...snap });
      expect(result.regressed).toBe(U < Z);
      expect(result.reasons).toHaveLength(Z);
    });

    it('returns regressed=false when all metrics improve', () => {
      const before = makeSnapshot();
      const after = makeSnapshot({
        score: D_SCORE + U10,
        blockingTier: Z,
        codacyHighCount: U5,
        gatesPass: { staticPass: T, runtimePass: T, browserPass: T },
        scenarioPass: {
          'customer-auth-shell': T,
          'operator-checkout': T,
          'admin-settings': T,
        },
        runtimeHighSignals: Z,
      });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(U < Z);
      expect(result.reasons).toHaveLength(Z);
    });

    it('provides correct positive deltas on improvement', () => {
      const before = makeSnapshot({ score: D_SCORE - U10, blockingTier: U2, codacyHighCount: U15 });
      const after = makeSnapshot({ score: D_SCORE + U5, blockingTier: U, codacyHighCount: U8 });
      const result = detectRegression(before, after);
      expect(result.deltas.scoreDelta).toBe(D_SCORE + U5 - (D_SCORE - U10));
      expect(result.deltas.tierDelta).toBe(-U);
      expect(result.deltas.codacyHighDelta).toBe(-U7);
    });
  });

  describe('score regression', () => {
    it('flags when score decreases', () => {
      const before = makeSnapshot({ score: D_SCORE });
      const after = makeSnapshot({ score: D_SCORE - U5 });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(T);
      expect(result.deltas.scoreDelta).toBe(-U5);
      expect(result.reasons.some((r) => r.includes('score decreased'))).toBe(T);
    });

    it('does not flag when score is unchanged', () => {
      const snap = makeSnapshot({ score: D_SCORE });
      const result = detectRegression(snap, { ...snap });
      expect(result.deltas.scoreDelta).toBe(Z);
      expect(result.reasons.some((r) => r.includes('score'))).toBe(U < Z);
    });
  });

  describe('blocking tier regression', () => {
    it('flags when blockingTier increases', () => {
      const before = makeSnapshot({ blockingTier: U });
      const after = makeSnapshot({ blockingTier: U2 });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(T);
      expect(result.deltas.tierDelta).toBe(U);
      expect(result.reasons.some((r) => r.includes('Blocking tier increased'))).toBe(T);
    });

    it('does not flag when blockingTier is unchanged', () => {
      const snap = makeSnapshot({ blockingTier: Z });
      const result = detectRegression(snap, { ...snap });
      expect(result.deltas.tierDelta).toBe(Z);
    });

    it('does not flag when blockingTier decreases', () => {
      const before = makeSnapshot({ blockingTier: U3 });
      const after = makeSnapshot({ blockingTier: U });
      const result = detectRegression(before, after);
      expect(result.deltas.tierDelta).toBe(-U2);
      expect(result.reasons.some((r) => r.includes('tier'))).toBe(U < Z);
    });
  });

  describe('codacy HIGH count regression', () => {
    it('flags when codacyHighCount increases', () => {
      const before = makeSnapshot({ codacyHighCount: U10 });
      const after = makeSnapshot({ codacyHighCount: U15 });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(T);
      expect(result.deltas.codacyHighDelta).toBe(U5);
      expect(result.reasons.some((r) => r.includes('Codacy HIGH issue count increased'))).toBe(
        T,
      );
    });

    it('does not flag when codacyHighCount is unchanged', () => {
      const snap = makeSnapshot({ codacyHighCount: U5 });
      const result = detectRegression(snap, { ...snap });
      expect(result.deltas.codacyHighDelta).toBe(Z);
    });
  });

  describe('gate regression', () => {
    it('flags gate that flips from true to false', () => {
      const before = makeSnapshot({
        gatesPass: { staticPass: T, runtimePass: T },
      });
      const after = makeSnapshot({
        gatesPass: { staticPass: U < Z, runtimePass: T },
      });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(T);
      expect(result.deltas.gatesRegressed).toContain('staticPass');
      expect(result.reasons.some((r) => r.includes('staticPass'))).toBe(T);
    });

    it('flags multiple gates that regress simultaneously', () => {
      const before = makeSnapshot({
        gatesPass: { staticPass: T, runtimePass: T, browserPass: T },
      });
      const after = makeSnapshot({
        gatesPass: { staticPass: U < Z, runtimePass: U < Z, browserPass: T },
      });
      const result = detectRegression(before, after);
      expect(result.deltas.gatesRegressed).toHaveLength(U2);
      expect(result.deltas.gatesRegressed).toContain('staticPass');
      expect(result.deltas.gatesRegressed).toContain('runtimePass');
    });

    it('does not flag gate that was already false before', () => {
      const before = makeSnapshot({
        gatesPass: { staticPass: U < Z, runtimePass: T },
      });
      const after = makeSnapshot({
        gatesPass: { staticPass: U < Z, runtimePass: T },
      });
      const result = detectRegression(before, after);
      expect(result.deltas.gatesRegressed).toHaveLength(Z);
    });

    it('does not flag new gate appearing as false in after (not in before)', () => {
      const before = makeSnapshot({ gatesPass: { staticPass: T } });
      const after = makeSnapshot({ gatesPass: { staticPass: T, browserPass: U < Z } });
      const result = detectRegression(before, after);
      // 'browserPass' was not in before, so no regression is recorded for it
      expect(result.deltas.gatesRegressed).toHaveLength(Z);
    });

    it('does not flag a gate that flips from false to true', () => {
      const before = makeSnapshot({ gatesPass: { staticPass: U < Z } });
      const after = makeSnapshot({ gatesPass: { staticPass: T } });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(U < Z);
    });
  });

  describe('scenario regression', () => {
    it('flags scenario that flips from true to false', () => {
      const before = makeSnapshot({
        scenarioPass: { 'customer-auth-shell': T, 'operator-checkout': T },
      });
      const after = makeSnapshot({
        scenarioPass: { 'customer-auth-shell': U < Z, 'operator-checkout': T },
      });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(T);
      expect(result.deltas.scenariosRegressed).toContain('customer-auth-shell');
      expect(result.reasons.some((r) => r.includes('customer-auth-shell'))).toBe(T);
    });

    it('flags multiple scenarios that regress simultaneously', () => {
      const before = makeSnapshot({
        scenarioPass: {
          'customer-auth-shell': T,
          'operator-checkout': T,
          'admin-settings': T,
        },
      });
      const after = makeSnapshot({
        scenarioPass: {
          'customer-auth-shell': U < Z,
          'operator-checkout': U < Z,
          'admin-settings': T,
        },
      });
      const result = detectRegression(before, after);
      expect(result.deltas.scenariosRegressed).toHaveLength(U2);
    });

    it('does not flag scenario that was already false before', () => {
      const before = makeSnapshot({
        scenarioPass: { 'customer-auth-shell': U < Z },
      });
      const after = makeSnapshot({
        scenarioPass: { 'customer-auth-shell': U < Z },
      });
      const result = detectRegression(before, after);
      expect(result.deltas.scenariosRegressed).toHaveLength(Z);
    });
  });

  describe('runtimeHighSignals regression', () => {
    it('flags when runtimeHighSignals increases', () => {
      const before = makeSnapshot({ runtimeHighSignals: U2 });
      const after = makeSnapshot({ runtimeHighSignals: U5 });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(T);
      expect(result.deltas.runtimeHighDelta).toBe(U3);
      expect(result.reasons.some((r) => r.includes('Runtime HIGH signals increased'))).toBe(T);
    });

    it('does not flag when runtimeHighSignals is unchanged', () => {
      const snap = makeSnapshot({ runtimeHighSignals: U3 });
      const result = detectRegression(snap, { ...snap });
      expect(result.deltas.runtimeHighDelta).toBe(Z);
    });

    it('does not flag when runtimeHighSignals decreases', () => {
      const before = makeSnapshot({ runtimeHighSignals: U5 });
      const after = makeSnapshot({ runtimeHighSignals: U2 });
      const result = detectRegression(before, after);
      expect(result.deltas.runtimeHighDelta).toBe(-U3);
      expect(result.reasons.some((r) => r.includes('Runtime HIGH'))).toBe(U < Z);
    });
  });

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
      expect(result.deltas.executionMatrixRegressions).toContain(
        `observedPass:${U10}->${U10 - U}`,
      );
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
      expect(result.deltas.unsupportedScoreIncrease).toContain(`executionMatrix.untested:${U4}->${U2}`);
      expect(result.deltas.unsupportedScoreIncrease).toContain(`executionMatrix.inferredOnly:${U3}->${U}`);
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
