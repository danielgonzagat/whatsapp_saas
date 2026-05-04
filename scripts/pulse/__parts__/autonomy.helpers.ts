import { unique } from '../artifacts.io';
import { isBalancedAutomationSafe } from '../artifacts.queue';
import { REQUIRED_NON_REGRESSING_CYCLES } from '../cert-gate-multi-cycle';
import type { PulseArtifactSnapshot } from '../artifacts';
import type { PulseAutonomyState, PulseConvergencePlan } from '../types';
import type { QueueUnit } from '../artifacts.queue';
import type { OverclaimGovernedValidationEvidence } from '../overclaim-guard';
import type {
  CycleProof,
  MatrixSummarySnapshot,
  PulseMachineReadinessGate,
} from './autonomy.types';
import { MATRIX_NON_REGRESSION_RULES } from './autonomy.types';

export function hasValidatableAiSafeUnit(convergencePlan: PulseConvergencePlan): boolean {
  return convergencePlan.queue.some(
    (unit) =>
      isBalancedAutomationSafe(unit) &&
      unit.validationArtifacts.length > 0 &&
      unit.exitCriteria.length > 0,
  );
}

export function isGovernedValidationExecutionMode(mode: QueueUnit['executionMode']): boolean {
  return mode === 'observation_only' || mode === 'governed_validation' || mode === 'human_required';
}

export function countOpenGovernedValidationUnits(
  convergencePlan: PulseConvergencePlan,
  previousAutonomyState: PulseAutonomyState | null,
): number {
  const summaryCount = Math.max(
    convergencePlan.summary.humanRequiredUnits,
    convergencePlan.summary.observationOnlyUnits,
  );
  const queueCount = convergencePlan.queue.filter(
    (unit) =>
      isGovernedValidationExecutionMode(unit.executionMode) &&
      (unit.status === 'open' || unit.status === 'watch'),
  ).length;
  const previousStateCount = Math.max(
    previousAutonomyState?.governedSandboxUnits ?? 0,
    previousAutonomyState?.escalatedValidationUnits ?? 0,
    previousAutonomyState?.observationOnlyUnits ?? 0,
  );
  return Math.max(summaryCount, queueCount, previousStateCount);
}

export function countExecutionMatrixGovernedValidationGates(
  snapshot: PulseArtifactSnapshot,
): number {
  const summary = snapshot.executionMatrix?.summary;
  if (!summary) {
    return 0;
  }
  const legacyBlocked = Math.max(
    summary.blockedHumanRequired ?? 0,
    summary.byStatus?.blocked_human_required ?? 0,
  );
  const observationOnly = Math.max(
    summary.observationOnlyRequired ?? 0,
    summary.byStatus?.observation_only ?? 0,
  );
  return legacyBlocked + observationOnly;
}

export function buildGovernedValidationEvidence(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
  previousAutonomyState: PulseAutonomyState | null,
): OverclaimGovernedValidationEvidence {
  const openUnitCount = countOpenGovernedValidationUnits(convergencePlan, previousAutonomyState);
  const openGateCount = countExecutionMatrixGovernedValidationGates(snapshot);
  const blockers = snapshot.certification.dynamicBlockingReasons.filter((reason) =>
    /governed[ _-]?validation|observation[ _-]?only|protected[ _-]?surface|human_required|blocked_human_required/i.test(
      reason,
    ),
  );
  return {
    openUnitCount,
    openGateCount,
    blockers,
  };
}

export function hasRuntimeTouchingValidationEvidence(
  entry: PulseAutonomyState['history'][number],
): boolean {
  if (!entry.codex.executed || !entry.validation.executed) {
    return false;
  }
  return entry.validation.commands.some(
    (command) => command.command.trim().length > 0 && command.exitCode === 0,
  );
}

export function buildAutonomyCycleProof(
  previousAutonomyState: PulseAutonomyState | null,
): CycleProof {
  const history = previousAutonomyState?.history || [];
  const realExecutedCycles = history.filter((entry) => entry.codex.executed);
  const runtimeTouchingCycles = realExecutedCycles.filter(hasRuntimeTouchingValidationEvidence);
  const executionMatrixComparisons = realExecutedCycles.map((entry) =>
    evaluateCycleExecutionMatrixNonRegression(entry),
  );
  const successfulCycles = realExecutedCycles.filter((entry) => {
    const codexPassed = entry.codex.exitCode === 0;
    const validationPassed =
      entry.validation.executed &&
      entry.validation.commands.length > 0 &&
      entry.validation.commands.every((command) => command.exitCode === 0);
    const beforeScore =
      typeof entry.directiveBefore.score === 'number' ? entry.directiveBefore.score : null;
    const afterScore =
      typeof entry.directiveAfter?.score === 'number' ? entry.directiveAfter.score : null;
    const scoreNonRegressing =
      beforeScore === null || afterScore === null || afterScore >= beforeScore;
    const beforeTier =
      typeof entry.directiveBefore.blockingTier === 'number'
        ? entry.directiveBefore.blockingTier
        : null;
    const afterTier =
      typeof entry.directiveAfter?.blockingTier === 'number'
        ? entry.directiveAfter.blockingTier
        : null;
    const tierNonRegressing = beforeTier === null || afterTier === null || afterTier <= beforeTier;
    const matrix = evaluateCycleExecutionMatrixNonRegression(entry);
    const runtimeTouched = hasRuntimeTouchingValidationEvidence(entry);
    return (
      codexPassed &&
      validationPassed &&
      runtimeTouched &&
      scoreNonRegressing &&
      tierNonRegressing &&
      matrix.nonRegressing
    );
  });

  return {
    requiredCycles: REQUIRED_NON_REGRESSING_CYCLES,
    totalRecordedCycles: history.length,
    realExecutedCycles: realExecutedCycles.length,
    successfulNonRegressingCycles: successfulCycles.length,
    runtimeTouchingCycles: runtimeTouchingCycles.length,
    executionMatrixComparedCycles: executionMatrixComparisons.filter((result) => result.compared)
      .length,
    executionMatrixRegressedCycles: executionMatrixComparisons.filter(
      (result) => !result.nonRegressing,
    ).length,
    proven: successfulCycles.length >= REQUIRED_NON_REGRESSING_CYCLES,
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readMatrixSummary(candidate: unknown): MatrixSummarySnapshot | null {
  const object = asObject(candidate);
  if (!object) return null;
  const summaryObject = asObject(object.summary) || object;
  const summary: MatrixSummarySnapshot = {};
  for (const rule of MATRIX_NON_REGRESSION_RULES) {
    const value = summaryObject[rule.key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      summary[rule.key] = value;
    }
  }
  return Object.keys(summary).length > 0 ? summary : null;
}

function readCycleMatrixSummary(
  entry: PulseAutonomyState['history'][number],
  phase: 'before' | 'after',
): MatrixSummarySnapshot | null {
  const object = asObject(entry);
  const directive =
    phase === 'before' ? asObject(entry.directiveBefore) : asObject(entry.directiveAfter);
  const suffix = phase === 'before' ? 'Before' : 'After';
  const candidates = [
    object?.[`executionMatrix${suffix}`],
    object?.[`executionMatrixSummary${suffix}`],
    directive?.executionMatrix,
    directive?.executionMatrixSummary,
    asObject(directive?.currentState)?.executionMatrixSummary,
  ];
  for (const candidate of candidates) {
    const summary = readMatrixSummary(candidate);
    if (summary) return summary;
  }
  return null;
}

function evaluateCycleExecutionMatrixNonRegression(entry: PulseAutonomyState['history'][number]): {
  compared: boolean;
  nonRegressing: boolean;
} {
  const before = readCycleMatrixSummary(entry, 'before');
  const after = readCycleMatrixSummary(entry, 'after');
  if (!before || !after) {
    return { compared: false, nonRegressing: true };
  }
  for (const rule of MATRIX_NON_REGRESSION_RULES) {
    const beforeValue = before[rule.key];
    const afterValue = after[rule.key];
    if (beforeValue === undefined || afterValue === undefined) continue;
    if (rule.direction === 'increase' && afterValue < beforeValue) {
      return { compared: true, nonRegressing: false };
    }
    if (rule.direction === 'decrease' && afterValue > beforeValue) {
      return { compared: true, nonRegressing: false };
    }
  }
  return { compared: true, nonRegressing: true };
}

export function pass(reason: string): PulseMachineReadinessGate {
  return { status: 'pass', reason };
}

export function fail(reason: string): PulseMachineReadinessGate {
  return { status: 'fail', reason };
}

export function getCrossArtifactConsistencyGate(
  snapshot: PulseArtifactSnapshot,
): PulseMachineReadinessGate {
  const consistency = snapshot.certification.selfTrustReport?.checks?.find(
    (check) => check.id === 'cross-artifact-consistency',
  );
  if (!consistency) {
    return fail('Cross-artifact consistency was not evaluated in this run.');
  }
  if (!consistency.pass) {
    return fail(consistency.reason || 'Canonical PULSE artifacts disagree on shared fields.');
  }
  return pass(
    consistency.reason || 'Canonical PULSE artifacts agree on shared machine-readiness fields.',
  );
}
