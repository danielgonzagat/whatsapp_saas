import { describe, it, expect } from 'vitest';
import { detectRegression } from '../../../regression-guard';
import {
  U,
  Z,
  U2,
  U3,
  U5,
  U7,
  U8,
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
