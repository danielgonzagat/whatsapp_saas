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
import "../__companions__/regression-guard.spec.companion";
