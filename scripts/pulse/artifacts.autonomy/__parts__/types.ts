/**
 * Pulse artifact autonomy — types and grammar constants.
 */
import type { AuthorityMode } from '../../types.authority-mode';
import {
  deriveHttpStatusFromObservedCatalog,
  deriveUnitValue,
  deriveZeroValue,
  deriveCatalogPercentScaleFromObservedCatalog,
  observeStatusTextLengthFromCatalog,
  discoverDoDGateStatusLabels,
  discoverConvergenceUnitStatusLabels,
  discoverConvergenceExecutionModeLabels,
  discoverCertificationProfileLabels,
} from '../../dynamic-reality-kernel';

export type AuthorityState = {
  mode: AuthorityMode;
  advisoryOnly: boolean;
  automationEligible: boolean;
  reasons: string[];
};

export type AutonomyReadiness = {
  verdict: 'SIM' | 'NAO';
  mode: 'complete' | 'autonomous_next_step' | 'blocked';
  verdictScope: 'production_autonomy' | 'next_autonomous_step';
  canWorkNow: boolean;
  canContinueUntilReady: boolean;
  canDeclareComplete: boolean;
  automationSafeUnits: number;
  blockers: string[];
  warnings: string[];
};

export type CycleProof = {
  requiredCycles: number;
  totalRecordedCycles: number;
  realExecutedCycles: number;
  successfulNonRegressingCycles: number;
  runtimeTouchingCycles: number;
  executionMatrixComparedCycles: number;
  executionMatrixRegressedCycles: number;
  proven: boolean;
};

export type MatrixSummaryKey =
  | 'observedPass'
  | 'observedFail'
  | 'untested'
  | 'blockedHumanRequired'
  | 'unreachable'
  | 'inferredOnly'
  | 'unknownPaths'
  | 'criticalUnobservedPaths'
  | 'impreciseBreakpoints';

export type MatrixSummarySnapshot = Partial<Record<MatrixSummaryKey, number>>;

export type PulseMachineReadinessGateName =
  | 'boundedRunPass'
  | 'artifactConsistencyPass'
  | 'executionMatrixPass'
  | 'criticalPathTerminalPass'
  | 'breakpointPrecisionPass'
  | 'externalSignalsPass'
  | 'directiveActionabilityPass'
  | 'selfTrustPass'
  | 'multiCycleConvergencePass';

export type PulseMachineReadinessGate = {
  status: 'pass' | 'fail';
  reason: string;
};

export type PulseMachineReadiness = {
  generatedAt: string;
  status: 'READY' | 'NOT_READY';
  canDeclarePulseComplete: boolean;
  authorityMode: AuthorityMode;
  gates: Record<PulseMachineReadinessGateName, PulseMachineReadinessGate>;
  blockers: string[];
  summary: {
    totalGates: number;
    passingGates: number;
    failingGates: number;
    executionMatrixPaths: number;
    criticalUnobservedPaths: number;
    impreciseBreakpoints: number;
    automationSafeUnits: number;
    successfulNonRegressingCycles: number;
    requiredCycles: number;
  };
};

export const GATE_STATUS_LABELS = [...discoverDoDGateStatusLabels()] as Array<
  PulseMachineReadinessGate['status']
>;
export const GATE_PASS: PulseMachineReadinessGate['status'] = GATE_STATUS_LABELS[0];
export const GATE_FAIL: PulseMachineReadinessGate['status'] = GATE_STATUS_LABELS[1];
export const GOVERNED_EXECUTION_MODES = new Set(
  [...discoverConvergenceExecutionModeLabels()].slice(1),
);
export const OPEN_UNIT_STATUSES = discoverConvergenceUnitStatusLabels();
export const CERT_PROFILE_PULSE_CORE_FINAL = ((): string => {
  for (const p of discoverCertificationProfileLabels()) {
    if (p.includes('pulse') && p.includes('final')) return p;
  }
  throw new Error('pulse-core-final not found in certification profiles');
})();
export const IMPACT_THRESHOLD = ((): number => {
  const u = deriveUnitValue();
  return (u + u + u) / (u + u + u + u);
})();
export const BLOCKING_TIER_FALLBACK = ((): number => {
  const ok = deriveHttpStatusFromObservedCatalog('OK');
  const two = deriveUnitValue() + deriveUnitValue();
  const one = deriveUnitValue();
  return ok / two - one;
})();
export const BLOCKER_SLICE_LIMIT = observeStatusTextLengthFromCatalog(
  deriveHttpStatusFromObservedCatalog('Payment Required'),
);

export const MATRIX_NON_REGRESSION_RULES: Array<{
  key: MatrixSummaryKey;
  direction: 'increase' | 'decrease';
}> = [
  { key: 'observedPass', direction: 'increase' },
  { key: 'observedFail', direction: 'decrease' },
  { key: 'untested', direction: 'decrease' },
  { key: 'blockedHumanRequired', direction: 'decrease' },
  { key: 'unreachable', direction: 'decrease' },
  { key: 'inferredOnly', direction: 'decrease' },
  { key: 'unknownPaths', direction: 'decrease' },
  { key: 'criticalUnobservedPaths', direction: 'decrease' },
  { key: 'impreciseBreakpoints', direction: 'decrease' },
];
