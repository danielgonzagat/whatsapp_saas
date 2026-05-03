import type { PulseSnapshot } from '../../regression-guard';

export function makeSnapshot(overrides: Partial<PulseSnapshot> = {}): PulseSnapshot {
  return {
    score: 80,
    blockingTier: 1,
    codacyHighCount: 10,
    gatesPass: { staticPass: true, runtimePass: true },
    scenarioPass: { 'customer-auth-shell': true, 'operator-checkout': true },
    runtimeHighSignals: 2,
    executionMatrixSummary: {
      observedPass: 10,
      observedFail: 0,
      criticalUnobservedPaths: 2,
      impreciseBreakpoints: 0,
      unknownPaths: 0,
    },
    ...overrides,
  };
}
