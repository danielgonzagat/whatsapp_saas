import type { PulseExecutionMatrixSummary } from '../../types.execution-matrix';
import type { RegressionResult, PulseProofReadinessSummary, MatrixRegressionMetric } from './types';
import {
  MATRIX_REGRESSION_RULES,
  MATRIX_OBSERVED_SUPPORT_RULES,
  MATRIX_PLANNED_OR_INFERRED_DEBT_RULES,
  PROOF_OBSERVED_SUPPORT_RULES,
  PROOF_PLANNED_DEBT_RULES,
} from './types';
import type { PulseSnapshot } from './types';

function detectExecutionMatrixRegressions(
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

function movedInSupportedDirection(
  beforeValue: number,
  afterValue: number,
  direction: 'increase' | 'decrease',
): boolean {
  return direction === 'increase' ? afterValue > beforeValue : afterValue < beforeValue;
}

function detectMatrixObservedSupport(
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

function detectMatrixPlannedOrInferredDebtReduction(
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

function detectProofObservedSupport(
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

function detectProofPlannedDebtReduction(
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

export function detectRegression(before: PulseSnapshot, after: PulseSnapshot): RegressionResult {
  const reasons: string[] = [];

  const scoreDelta = after.score - before.score;
  if (scoreDelta < 0) {
    reasons.push(
      `Pulse score decreased from ${before.score} to ${after.score} (delta ${scoreDelta}).`,
    );
  }

  const tierDelta = after.blockingTier - before.blockingTier;
  if (tierDelta > 0) {
    reasons.push(
      `Blocking tier increased from ${before.blockingTier} to ${after.blockingTier} (delta +${tierDelta}).`,
    );
  }

  const codacyHighDelta = after.codacyHighCount - before.codacyHighCount;
  if (codacyHighDelta > 0) {
    reasons.push(
      `Codacy HIGH issue count increased from ${before.codacyHighCount} to ${after.codacyHighCount} (+${codacyHighDelta}).`,
    );
  }

  const gatesRegressed: string[] = [];
  for (const gateName of Object.keys(before.gatesPass)) {
    if (before.gatesPass[gateName] === true && after.gatesPass[gateName] === false) {
      gatesRegressed.push(gateName);
    }
  }
  if (gatesRegressed.length > 0) {
    reasons.push(`Gate(s) regressed (were passing, now failing): ${gatesRegressed.join(', ')}.`);
  }

  const scenariosRegressed: string[] = [];
  for (const scenarioId of Object.keys(before.scenarioPass)) {
    if (before.scenarioPass[scenarioId] === true && after.scenarioPass[scenarioId] === false) {
      scenariosRegressed.push(scenarioId);
    }
  }
  if (scenariosRegressed.length > 0) {
    reasons.push(
      `Scenario(s) regressed (were passing, now failing): ${scenariosRegressed.join(', ')}.`,
    );
  }

  const runtimeHighDelta = after.runtimeHighSignals - before.runtimeHighSignals;
  if (runtimeHighDelta > 0) {
    reasons.push(
      `Runtime HIGH signals increased from ${before.runtimeHighSignals} to ${after.runtimeHighSignals} (+${runtimeHighDelta}).`,
    );
  }

  const executionMatrixRegressions = detectExecutionMatrixRegressions(
    before.executionMatrixSummary ?? {},
    after.executionMatrixSummary ?? {},
  );
  if (executionMatrixRegressions.length > 0) {
    reasons.push(`Execution matrix regressed: ${executionMatrixRegressions.join(', ')}.`);
  }

  const observedSupport = [
    ...detectMatrixObservedSupport(
      before.executionMatrixSummary ?? {},
      after.executionMatrixSummary ?? {},
    ),
    ...detectProofObservedSupport(
      before.proofReadinessSummary ?? {},
      after.proofReadinessSummary ?? {},
    ),
  ];
  const plannedOrInferredDebtReduced = [
    ...detectMatrixPlannedOrInferredDebtReduction(
      before.executionMatrixSummary ?? {},
      after.executionMatrixSummary ?? {},
    ),
    ...detectProofPlannedDebtReduction(
      before.proofReadinessSummary ?? {},
      after.proofReadinessSummary ?? {},
    ),
  ];
  const unsupportedScoreIncrease =
    scoreDelta > 0 && observedSupport.length === 0 ? plannedOrInferredDebtReduced : [];
  if (unsupportedScoreIncrease.length > 0) {
    reasons.push(
      `Pulse score increased from ${before.score} to ${after.score} without observed evidence improvement; planned/inferred-only reductions cannot improve score alone: ${unsupportedScoreIncrease.join(', ')}.`,
    );
  }

  return {
    regressed: reasons.length > 0,
    reasons,
    deltas: {
      scoreDelta,
      tierDelta,
      codacyHighDelta,
      gatesRegressed,
      scenariosRegressed,
      runtimeHighDelta,
      executionMatrixRegressions,
      unsupportedScoreIncrease,
    },
  };
}
