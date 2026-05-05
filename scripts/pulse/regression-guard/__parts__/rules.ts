import type { PulseExecutionMatrixSummary } from '../../types.execution-matrix';
import type { PulseProofReadinessSummary, MatrixRegressionMetric } from './types';

const MATRIX_REGRESSION_RULES: Array<{
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

const MATRIX_OBSERVED_SUPPORT_RULES: Array<{
  key: Extract<MatrixRegressionMetric, 'observedPass' | 'observedFail'>;
  direction: 'increase' | 'decrease';
}> = [
  { key: 'observedPass', direction: 'increase' },
  { key: 'observedFail', direction: 'decrease' },
];

const MATRIX_PLANNED_OR_INFERRED_DEBT_RULES: Array<{
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

const PROOF_OBSERVED_SUPPORT_RULES: Array<{
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

const PROOF_PLANNED_DEBT_RULES: Array<{
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

export function detectExecutionMatrixRegressions(
  before: Partial<PulseExecutionMatrixSummary>,
  after: Partial<PulseExecutionMatrixSummary>,
): string[] {
  const regressions: string[] = [];
  for (const rule of MATRIX_REGRESSION_RULES) {
    const beforeValue = before[rule.key];
    const afterValue = after[rule.key];
    if (typeof beforeValue !== 'number' || typeof afterValue !== 'number') {
      continue;
    }
    const regressed =
      rule.direction === 'increase' ? afterValue < beforeValue : afterValue > beforeValue;
    if (regressed) {
      regressions.push(`${rule.key}:${beforeValue}->${afterValue}`);
    }
  }
  return regressions;
}

export function movedInSupportedDirection(
  beforeValue: number,
  afterValue: number,
  direction: 'increase' | 'decrease',
): boolean {
  return direction === 'increase' ? afterValue > beforeValue : afterValue < beforeValue;
}

export function detectMatrixObservedSupport(
  before: Partial<PulseExecutionMatrixSummary>,
  after: Partial<PulseExecutionMatrixSummary>,
): string[] {
  const supported: string[] = [];
  for (const rule of MATRIX_OBSERVED_SUPPORT_RULES) {
    const beforeValue = before[rule.key];
    const afterValue = after[rule.key];
    if (typeof beforeValue !== 'number' || typeof afterValue !== 'number') {
      continue;
    }
    if (movedInSupportedDirection(beforeValue, afterValue, rule.direction)) {
      supported.push(`executionMatrix.${rule.key}:${beforeValue}->${afterValue}`);
    }
  }
  return supported;
}

export function detectMatrixPlannedOrInferredDebtReduction(
  before: Partial<PulseExecutionMatrixSummary>,
  after: Partial<PulseExecutionMatrixSummary>,
): string[] {
  const reductions: string[] = [];
  for (const rule of MATRIX_PLANNED_OR_INFERRED_DEBT_RULES) {
    const beforeValue = before[rule.key];
    const afterValue = after[rule.key];
    if (typeof beforeValue !== 'number' || typeof afterValue !== 'number') {
      continue;
    }
    if (movedInSupportedDirection(beforeValue, afterValue, rule.direction)) {
      reductions.push(`executionMatrix.${rule.key}:${beforeValue}->${afterValue}`);
    }
  }
  return reductions;
}

export function detectProofObservedSupport(
  before: Partial<PulseProofReadinessSummary>,
  after: Partial<PulseProofReadinessSummary>,
): string[] {
  const supported: string[] = [];
  for (const rule of PROOF_OBSERVED_SUPPORT_RULES) {
    const beforeValue = before[rule.key];
    const afterValue = after[rule.key];
    if (typeof beforeValue !== 'number' || typeof afterValue !== 'number') {
      continue;
    }
    if (movedInSupportedDirection(beforeValue, afterValue, rule.direction)) {
      supported.push(`proofReadiness.${rule.key}:${beforeValue}->${afterValue}`);
    }
  }
  return supported;
}

export function detectProofPlannedDebtReduction(
  before: Partial<PulseProofReadinessSummary>,
  after: Partial<PulseProofReadinessSummary>,
): string[] {
  const reductions: string[] = [];
  for (const rule of PROOF_PLANNED_DEBT_RULES) {
    const beforeValue = before[rule.key];
    const afterValue = after[rule.key];
    if (typeof beforeValue !== 'number' || typeof afterValue !== 'number') {
      continue;
    }
    if (movedInSupportedDirection(beforeValue, afterValue, rule.direction)) {
      reductions.push(`proofReadiness.${rule.key}:${beforeValue}->${afterValue}`);
    }
  }
  return reductions;
}
