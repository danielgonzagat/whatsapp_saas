import type { PulseExecutionMatrixSummary } from '../../types.execution-matrix';

export type { RollbackOutcome } from './rollback';

export interface PulseSnapshot {
  score: number;
  blockingTier: number;
  codacyHighCount: number;
  gatesPass: Record<string, boolean>;
  scenarioPass: Record<string, boolean>;
  runtimeHighSignals: number;
  executionMatrixSummary?: Partial<PulseExecutionMatrixSummary>;
  proofReadinessSummary?: Partial<PulseProofReadinessSummary>;
}

export interface RegressionResult {
  regressed: boolean;
  reasons: string[];
  deltas: {
    scoreDelta: number;
    tierDelta: number;
    codacyHighDelta: number;
    gatesRegressed: string[];
    scenariosRegressed: string[];
    runtimeHighDelta: number;
    executionMatrixRegressions: string[];
    unsupportedScoreIncrease: string[];
  };
}

export interface PulseProofReadinessSummary {
  observedEvidence: number;
  observedPass: number;
  observedFail: number;
  plannedEvidence: number;
  plannedOrUnexecutedEvidence: number;
  nonObservedEvidence: number;
}

export type MatrixRegressionMetric =
  | 'observedPass'
  | 'observedFail'
  | 'untested'
  | 'blockedHumanRequired'
  | 'unreachable'
  | 'inferredOnly'
  | 'unknownPaths'
  | 'criticalUnobservedPaths'
  | 'impreciseBreakpoints';

export const MATRIX_REGRESSION_RULES: Array<{
  key: MatrixRegressionMetric;
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

export const MATRIX_OBSERVED_SUPPORT_RULES: Array<{
  key: Extract<MatrixRegressionMetric, 'observedPass' | 'observedFail'>;
  direction: 'increase' | 'decrease';
}> = [
  { key: 'observedPass', direction: 'increase' },
  { key: 'observedFail', direction: 'decrease' },
];

export const MATRIX_PLANNED_OR_INFERRED_DEBT_RULES: Array<{
  key: Exclude<MatrixRegressionMetric, 'observedPass' | 'observedFail'>;
  direction: 'decrease';
}> = [
  { key: 'untested', direction: 'decrease' },
  { key: 'blockedHumanRequired', direction: 'decrease' },
  { key: 'unreachable', direction: 'decrease' },
  { key: 'inferredOnly', direction: 'decrease' },
  { key: 'unknownPaths', direction: 'decrease' },
  { key: 'criticalUnobservedPaths', direction: 'decrease' },
  { key: 'impreciseBreakpoints', direction: 'decrease' },
];

export const PROOF_OBSERVED_SUPPORT_RULES: Array<{
  key: Extract<
    keyof PulseProofReadinessSummary,
    'observedEvidence' | 'observedPass' | 'observedFail'
  >;
  direction: 'increase' | 'decrease';
}> = [
  { key: 'observedEvidence', direction: 'increase' },
  { key: 'observedPass', direction: 'increase' },
  { key: 'observedFail', direction: 'decrease' },
];

export const PROOF_PLANNED_DEBT_RULES: Array<{
  key: Extract<
    keyof PulseProofReadinessSummary,
    'plannedEvidence' | 'plannedOrUnexecutedEvidence' | 'nonObservedEvidence'
  >;
  direction: 'decrease';
}> = [
  { key: 'plannedEvidence', direction: 'decrease' },
  { key: 'plannedOrUnexecutedEvidence', direction: 'decrease' },
  { key: 'nonObservedEvidence', direction: 'decrease' },
];
