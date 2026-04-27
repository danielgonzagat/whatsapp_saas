/**
 * Unit tests for RegressionError and throwOnRegression.
 *
 * Covers hard enforcement: verifying that throwOnRegression throws
 * RegressionError with correct deltas when a regression is detected,
 * and does nothing when no regression is detected.
 */

import { describe, it, expect } from 'vitest';
import { detectRegression, throwOnRegression, RegressionError } from '../regression-guard';

interface PulseSnapshot {
  score: number;
  blockingTier: number;
  codacyHighCount: number;
  gatesPass: Record<string, boolean>;
  scenarioPass: Record<string, boolean>;
  runtimeHighSignals: number;
}

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

describe('throwOnRegression — hard enforcement', () => {
  it('throws RegressionError when score decreases', () => {
    const before = makeSnapshot({ score: 80 });
    const after = makeSnapshot({ score: 75 });
    const result = detectRegression(before, after);
    try {
      throwOnRegression(result);
      throw new Error('Should have thrown RegressionError');
    } catch (err) {
      if (!(err instanceof RegressionError)) {
        throw err;
      }
      if (err.message.indexOf('score decreased') === -1) {
        throw new Error(`Expected 'score decreased' in message, got: ${err.message}`);
      }
    }
  });

  it('throws RegressionError when blockingTier increases', () => {
    const before = makeSnapshot({ blockingTier: 1 });
    const after = makeSnapshot({ blockingTier: 2 });
    const result = detectRegression(before, after);
    try {
      throwOnRegression(result);
      throw new Error('Should have thrown RegressionError');
    } catch (err) {
      if (!(err instanceof RegressionError)) {
        throw err;
      }
      if (err.message.indexOf('Blocking tier increased') === -1) {
        throw new Error(`Expected 'Blocking tier increased' in message, got: ${err.message}`);
      }
    }
  });

  it('throws RegressionError when codacyHighCount increases', () => {
    const before = makeSnapshot({ codacyHighCount: 10 });
    const after = makeSnapshot({ codacyHighCount: 15 });
    const result = detectRegression(before, after);
    try {
      throwOnRegression(result);
      throw new Error('Should have thrown RegressionError');
    } catch (err) {
      if (!(err instanceof RegressionError)) {
        throw err;
      }
      if (err.message.indexOf('Codacy HIGH issue count increased') === -1) {
        throw new Error(
          `Expected 'Codacy HIGH issue count increased' in message, got: ${err.message}`,
        );
      }
    }
  });

  it('throws RegressionError when gate regresses (true → false)', () => {
    const before = makeSnapshot({
      gatesPass: { staticPass: true, runtimePass: true },
    });
    const after = makeSnapshot({
      gatesPass: { staticPass: false, runtimePass: true },
    });
    const result = detectRegression(before, after);
    try {
      throwOnRegression(result);
      throw new Error('Should have thrown RegressionError');
    } catch (err) {
      if (!(err instanceof RegressionError)) {
        throw err;
      }
      if (err.message.indexOf('staticPass') === -1) {
        throw new Error(`Expected 'staticPass' in message, got: ${err.message}`);
      }
    }
  });

  it('throws RegressionError when scenario regresses (true → false)', () => {
    const before = makeSnapshot({
      scenarioPass: { 'customer-auth-shell': true, 'operator-checkout': true },
    });
    const after = makeSnapshot({
      scenarioPass: { 'customer-auth-shell': false, 'operator-checkout': true },
    });
    const result = detectRegression(before, after);
    try {
      throwOnRegression(result);
      throw new Error('Should have thrown RegressionError');
    } catch (err) {
      if (!(err instanceof RegressionError)) {
        throw err;
      }
      if (err.message.indexOf('customer-auth-shell') === -1) {
        throw new Error(`Expected 'customer-auth-shell' in message, got: ${err.message}`);
      }
    }
  });

  it('throws RegressionError when runtimeHighSignals increases', () => {
    const before = makeSnapshot({ runtimeHighSignals: 2 });
    const after = makeSnapshot({ runtimeHighSignals: 5 });
    const result = detectRegression(before, after);
    try {
      throwOnRegression(result);
      throw new Error('Should have thrown RegressionError');
    } catch (err) {
      if (!(err instanceof RegressionError)) {
        throw err;
      }
      if (err.message.indexOf('Runtime HIGH signals increased') === -1) {
        throw new Error(
          `Expected 'Runtime HIGH signals increased' in message, got: ${err.message}`,
        );
      }
    }
  });

  it('does not throw when no regression is detected', () => {
    const snap = makeSnapshot();
    const result = detectRegression(snap, { ...snap });
    try {
      throwOnRegression(result);
    } catch (err) {
      throw new Error(`Should not have thrown, but threw: ${err}`);
    }
  });

  it('includes all deltas in RegressionError when multiple regressions occur', () => {
    const before = makeSnapshot({
      score: 80,
      blockingTier: 1,
      codacyHighCount: 10,
      gatesPass: { staticPass: true },
      runtimeHighSignals: 2,
    });
    const after = makeSnapshot({
      score: 70,
      blockingTier: 2,
      codacyHighCount: 15,
      gatesPass: { staticPass: false },
      runtimeHighSignals: 5,
    });
    const result = detectRegression(before, after);
    try {
      throwOnRegression(result);
      throw new Error('Should have thrown RegressionError');
    } catch (err) {
      if (!(err instanceof RegressionError)) {
        throw err;
      }
      if (err.deltas.scoreDelta !== -10) {
        throw new Error(`Expected scoreDelta -10, got ${err.deltas.scoreDelta}`);
      }
      if (err.deltas.tierDelta !== 1) {
        throw new Error(`Expected tierDelta 1, got ${err.deltas.tierDelta}`);
      }
      if (err.deltas.codacyHighDelta !== 5) {
        throw new Error(`Expected codacyHighDelta 5, got ${err.deltas.codacyHighDelta}`);
      }
      if (err.deltas.runtimeHighDelta !== 3) {
        throw new Error(`Expected runtimeHighDelta 3, got ${err.deltas.runtimeHighDelta}`);
      }
      if (!err.deltas.gatesRegressed.includes('staticPass')) {
        throw new Error(`Expected 'staticPass' in gatesRegressed`);
      }
    }
  });
});
