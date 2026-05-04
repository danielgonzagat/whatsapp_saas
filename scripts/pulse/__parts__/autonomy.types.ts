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

import type { AuthorityMode } from '../types.authority-mode';
