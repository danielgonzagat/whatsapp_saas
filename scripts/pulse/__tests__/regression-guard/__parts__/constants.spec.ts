import { describe, it, expect } from 'vitest';
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

export {
  U,
  Z,
  U2,
  U3,
  U4,
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
};
