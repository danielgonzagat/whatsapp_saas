import { deriveZeroValue } from '../dynamic-reality-kernel';
import { REQUIRED_NON_REGRESSING_CYCLES } from '../cert-gate-multi-cycle';
import type { PulseArtifactSnapshot } from '../artifacts';
import type { PulseAutonomyState, PulseConvergencePlan } from '../types';
import type { QueueUnit } from '../artifacts.queue';
import { MATRIX_NON_REGRESSION_RULES, GATE_PASS } from './types';
import type { AutonomyReadiness, CycleProof, MatrixSummarySnapshot } from './types';

export function buildAutonomyReadiness(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
  autonomyQueue: QueueUnit[],
): AutonomyReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (
    snapshot.certification.status === 'CERTIFIED' &&
    snapshot.certification.humanReplacementStatus === 'READY'
  ) {
    return {
      verdict: 'SIM',
      mode: 'complete',
      verdictScope: 'production_autonomy',
      canWorkNow: false,
      canContinueUntilReady: true,
      canDeclareComplete: true,
      automationSafeUnits: deriveZeroValue(),
      blockers,
      warnings: ['Current checkpoint is fully certified and ready for autonomous operation.'],
    };
  }

  if (autonomyQueue.length === deriveZeroValue()) {
    blockers.push('No balanced ai_safe convergence unit is currently exposed for autonomous work.');
  }

  if (snapshot.externalSignalState.summary.missingAdapters > deriveZeroValue()) {
    warnings.push(
      `${snapshot.externalSignalState.summary.missingAdapters} external adapter(s) are missing; production reality is incomplete but local convergence can still proceed.`,
    );
  }

  if (convergencePlan.summary.humanRequiredUnits > deriveZeroValue()) {
    warnings.push(
      `${convergencePlan.summary.humanRequiredUnits} legacy protected-surface unit(s) were normalized into governed validation or observation-only evidence gathering.`,
    );
  }

  if (snapshot.certification.gates.pulseSelfTrustPass.status !== GATE_PASS) {
    warnings.push(snapshot.certification.gates.pulseSelfTrustPass.reason);
  }

  return {
    verdict: blockers.length === deriveZeroValue() ? 'SIM' : 'NAO',
    mode: blockers.length === deriveZeroValue() ? 'autonomous_next_step' : 'blocked',
    verdictScope: 'next_autonomous_step',
    canWorkNow: blockers.length === deriveZeroValue(),
    canContinueUntilReady: false,
    canDeclareComplete: false,
    automationSafeUnits: autonomyQueue.length,
    blockers,
    warnings,
  };
}

function hasRuntimeTouchingValidationEvidence(
  entry: PulseAutonomyState['history'][number],
): boolean {
  if (!entry.codex.executed || !entry.validation.executed) {
    return false;
  }
  return entry.validation.commands.some(
    (command) =>
      command.command.trim().length > deriveZeroValue() && command.exitCode === deriveZeroValue(),
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
    const codexPassed = entry.codex.exitCode === deriveZeroValue();
    const validationPassed =
      entry.validation.executed &&
      entry.validation.commands.length > deriveZeroValue() &&
      entry.validation.commands.every((command) => command.exitCode === deriveZeroValue());
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
  return Object.keys(summary).length > deriveZeroValue() ? summary : null;
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
