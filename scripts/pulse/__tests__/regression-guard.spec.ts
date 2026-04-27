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

function makeSnapshot(overrides: Partial<PulseSnapshot> = {}): PulseSnapshot {
  return {
    score: 80,
    blockingTier: 1,
    codacyHighCount: 10,
    gatesPass: { staticPass: true, runtimePass: true },
    scenarioPass: { 'customer-auth-shell': true, 'operator-checkout': true },
    runtimeHighSignals: 2,
    ...overrides,
  };
}

describe('detectRegression', () => {
  describe('happy path — no regression', () => {
    it('returns regressed=false when all metrics are identical', () => {
      const snap = makeSnapshot();
      const result = detectRegression(snap, { ...snap });
      expect(result.regressed).toBe(false);
      expect(result.reasons).toHaveLength(0);
    });

    it('returns regressed=false when all metrics improve', () => {
      const before = makeSnapshot();
      const after = makeSnapshot({
        score: 90,
        blockingTier: 0,
        codacyHighCount: 5,
        gatesPass: { staticPass: true, runtimePass: true, browserPass: true },
        scenarioPass: {
          'customer-auth-shell': true,
          'operator-checkout': true,
          'admin-settings': true,
        },
        runtimeHighSignals: 0,
      });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(false);
      expect(result.reasons).toHaveLength(0);
    });

    it('provides correct positive deltas on improvement', () => {
      const before = makeSnapshot({ score: 70, blockingTier: 2, codacyHighCount: 15 });
      const after = makeSnapshot({ score: 85, blockingTier: 1, codacyHighCount: 8 });
      const result = detectRegression(before, after);
      expect(result.deltas.scoreDelta).toBe(15);
      expect(result.deltas.tierDelta).toBe(-1);
      expect(result.deltas.codacyHighDelta).toBe(-7);
    });
  });

  describe('score regression', () => {
    it('flags when score decreases', () => {
      const before = makeSnapshot({ score: 80 });
      const after = makeSnapshot({ score: 75 });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(true);
      expect(result.deltas.scoreDelta).toBe(-5);
      expect(result.reasons.some((r) => r.includes('score decreased'))).toBe(true);
    });

    it('does not flag when score is unchanged', () => {
      const snap = makeSnapshot({ score: 80 });
      const result = detectRegression(snap, { ...snap });
      expect(result.deltas.scoreDelta).toBe(0);
      expect(result.reasons.some((r) => r.includes('score'))).toBe(false);
    });
  });

  describe('blocking tier regression', () => {
    it('flags when blockingTier increases', () => {
      const before = makeSnapshot({ blockingTier: 1 });
      const after = makeSnapshot({ blockingTier: 2 });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(true);
      expect(result.deltas.tierDelta).toBe(1);
      expect(result.reasons.some((r) => r.includes('Blocking tier increased'))).toBe(true);
    });

    it('does not flag when blockingTier is unchanged', () => {
      const snap = makeSnapshot({ blockingTier: 0 });
      const result = detectRegression(snap, { ...snap });
      expect(result.deltas.tierDelta).toBe(0);
    });

    it('does not flag when blockingTier decreases', () => {
      const before = makeSnapshot({ blockingTier: 3 });
      const after = makeSnapshot({ blockingTier: 1 });
      const result = detectRegression(before, after);
      expect(result.deltas.tierDelta).toBe(-2);
      expect(result.reasons.some((r) => r.includes('tier'))).toBe(false);
    });
  });

  describe('codacy HIGH count regression', () => {
    it('flags when codacyHighCount increases', () => {
      const before = makeSnapshot({ codacyHighCount: 10 });
      const after = makeSnapshot({ codacyHighCount: 15 });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(true);
      expect(result.deltas.codacyHighDelta).toBe(5);
      expect(result.reasons.some((r) => r.includes('Codacy HIGH issue count increased'))).toBe(
        true,
      );
    });

    it('does not flag when codacyHighCount is unchanged', () => {
      const snap = makeSnapshot({ codacyHighCount: 5 });
      const result = detectRegression(snap, { ...snap });
      expect(result.deltas.codacyHighDelta).toBe(0);
    });
  });

  describe('gate regression', () => {
    it('flags gate that flips from true to false', () => {
      const before = makeSnapshot({
        gatesPass: { staticPass: true, runtimePass: true },
      });
      const after = makeSnapshot({
        gatesPass: { staticPass: false, runtimePass: true },
      });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(true);
      expect(result.deltas.gatesRegressed).toContain('staticPass');
      expect(result.reasons.some((r) => r.includes('staticPass'))).toBe(true);
    });

    it('flags multiple gates that regress simultaneously', () => {
      const before = makeSnapshot({
        gatesPass: { staticPass: true, runtimePass: true, browserPass: true },
      });
      const after = makeSnapshot({
        gatesPass: { staticPass: false, runtimePass: false, browserPass: true },
      });
      const result = detectRegression(before, after);
      expect(result.deltas.gatesRegressed).toHaveLength(2);
      expect(result.deltas.gatesRegressed).toContain('staticPass');
      expect(result.deltas.gatesRegressed).toContain('runtimePass');
    });

    it('does not flag gate that was already false before', () => {
      const before = makeSnapshot({
        gatesPass: { staticPass: false, runtimePass: true },
      });
      const after = makeSnapshot({
        gatesPass: { staticPass: false, runtimePass: true },
      });
      const result = detectRegression(before, after);
      expect(result.deltas.gatesRegressed).toHaveLength(0);
    });

    it('does not flag new gate appearing as false in after (not in before)', () => {
      const before = makeSnapshot({ gatesPass: { staticPass: true } });
      const after = makeSnapshot({ gatesPass: { staticPass: true, browserPass: false } });
      const result = detectRegression(before, after);
      // 'browserPass' was not in before, so no regression is recorded for it
      expect(result.deltas.gatesRegressed).toHaveLength(0);
    });

    it('does not flag a gate that flips from false to true', () => {
      const before = makeSnapshot({ gatesPass: { staticPass: false } });
      const after = makeSnapshot({ gatesPass: { staticPass: true } });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(false);
    });
  });

  describe('scenario regression', () => {
    it('flags scenario that flips from true to false', () => {
      const before = makeSnapshot({
        scenarioPass: { 'customer-auth-shell': true, 'operator-checkout': true },
      });
      const after = makeSnapshot({
        scenarioPass: { 'customer-auth-shell': false, 'operator-checkout': true },
      });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(true);
      expect(result.deltas.scenariosRegressed).toContain('customer-auth-shell');
      expect(result.reasons.some((r) => r.includes('customer-auth-shell'))).toBe(true);
    });

    it('flags multiple scenarios that regress simultaneously', () => {
      const before = makeSnapshot({
        scenarioPass: {
          'customer-auth-shell': true,
          'operator-checkout': true,
          'admin-settings': true,
        },
      });
      const after = makeSnapshot({
        scenarioPass: {
          'customer-auth-shell': false,
          'operator-checkout': false,
          'admin-settings': true,
        },
      });
      const result = detectRegression(before, after);
      expect(result.deltas.scenariosRegressed).toHaveLength(2);
    });

    it('does not flag scenario that was already false before', () => {
      const before = makeSnapshot({
        scenarioPass: { 'customer-auth-shell': false },
      });
      const after = makeSnapshot({
        scenarioPass: { 'customer-auth-shell': false },
      });
      const result = detectRegression(before, after);
      expect(result.deltas.scenariosRegressed).toHaveLength(0);
    });
  });

  describe('runtimeHighSignals regression', () => {
    it('flags when runtimeHighSignals increases', () => {
      const before = makeSnapshot({ runtimeHighSignals: 2 });
      const after = makeSnapshot({ runtimeHighSignals: 5 });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(true);
      expect(result.deltas.runtimeHighDelta).toBe(3);
      expect(result.reasons.some((r) => r.includes('Runtime HIGH signals increased'))).toBe(true);
    });

    it('does not flag when runtimeHighSignals is unchanged', () => {
      const snap = makeSnapshot({ runtimeHighSignals: 3 });
      const result = detectRegression(snap, { ...snap });
      expect(result.deltas.runtimeHighDelta).toBe(0);
    });

    it('does not flag when runtimeHighSignals decreases', () => {
      const before = makeSnapshot({ runtimeHighSignals: 5 });
      const after = makeSnapshot({ runtimeHighSignals: 2 });
      const result = detectRegression(before, after);
      expect(result.deltas.runtimeHighDelta).toBe(-3);
      expect(result.reasons.some((r) => r.includes('Runtime HIGH'))).toBe(false);
    });
  });

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
  });

  describe('edge cases', () => {
    it('handles empty gatesPass and scenarioPass maps', () => {
      const before = makeSnapshot({ gatesPass: {}, scenarioPass: {} });
      const after = makeSnapshot({ gatesPass: {}, scenarioPass: {} });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(false);
    });

    it('handles zero values without false positives', () => {
      const snap = makeSnapshot({
        score: 0,
        blockingTier: 0,
        codacyHighCount: 0,
        runtimeHighSignals: 0,
      });
      const result = detectRegression(snap, { ...snap });
      expect(result.regressed).toBe(false);
    });
  });
});
