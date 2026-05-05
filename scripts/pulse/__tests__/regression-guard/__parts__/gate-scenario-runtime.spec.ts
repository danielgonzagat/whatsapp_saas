/**
 * Part 2: Gate, scenario, and runtimeHighSignals regressions.
 */

import { describe, it, expect } from 'vitest';
import { detectRegression } from '../../../regression-guard';
import type { PulseSnapshot } from '../../../regression-guard';
import { deriveUnitValue, deriveZeroValue } from '../../../dynamic-reality-kernel';

const U = deriveUnitValue();
const Z = deriveZeroValue();
const U2 = U + U;
const U3 = U + U2;
const U5 = U2 + U3;
const U10 = U5 + U5;

const D_SCORE = U10 * (U5 + U3);
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
});
