/**
 * Part 1: Basic regressions — happy path, score, blocking tier, codacy.
 */

import { describe, it, expect } from 'vitest';
import { detectRegression } from '../../../regression-guard';
import type { PulseSnapshot } from '../../../regression-guard';
import { deriveUnitValue, deriveZeroValue } from '../../../dynamic-reality-kernel';

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
      expect(result.reasons.some((r) => r.includes('Codacy HIGH issue count increased'))).toBe(T);
    });

    it('does not flag when codacyHighCount is unchanged', () => {
      const snap = makeSnapshot({ codacyHighCount: U5 });
      const result = detectRegression(snap, { ...snap });
      expect(result.deltas.codacyHighDelta).toBe(Z);
    });
  });
});
