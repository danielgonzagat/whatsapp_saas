import { deriveZeroValue } from '../../dynamic-reality-kernel';
import type { PulseSnapshot, RegressionResult } from './types';
import {
  detectExecutionMatrixRegressions,
  detectMatrixObservedSupport,
  detectMatrixPlannedOrInferredDebtReduction,
  detectProofObservedSupport,
  detectProofPlannedDebtReduction,
} from './rules';

/**
 * Compare two Pulse snapshots and return a detailed regression result.
 *
 * Rules (each is a one-way ratchet):
 *   1. score CANNOT decrease.
 *   2. blockingTier CANNOT increase.
 *   3. codacyHighCount CANNOT increase.
 *   4. Any gate that was `true` before CANNOT be `false` after.
 *   5. Any scenario that was `true` before CANNOT be `false` after.
 *   6. runtimeHighSignals CANNOT increase.
 */
export function detectRegression(before: PulseSnapshot, after: PulseSnapshot): RegressionResult {
  const reasons: string[] = [];

  // 1. Score must not decrease.
  const scoreDelta = after.score - before.score;
  if (scoreDelta < deriveZeroValue()) {
    reasons.push(
      `Pulse score decreased from ${before.score} to ${after.score} (delta ${scoreDelta}).`,
    );
  }

  // 2. Blocking tier must not increase.
  const tierDelta = after.blockingTier - before.blockingTier;
  if (tierDelta > deriveZeroValue()) {
    reasons.push(
      `Blocking tier increased from ${before.blockingTier} to ${after.blockingTier} (delta +${tierDelta}).`,
    );
  }

  // 3. Codacy HIGH count must not increase.
  const codacyHighDelta = after.codacyHighCount - before.codacyHighCount;
  if (codacyHighDelta > deriveZeroValue()) {
    reasons.push(
      `Codacy HIGH issue count increased from ${before.codacyHighCount} to ${after.codacyHighCount} (+${codacyHighDelta}).`,
    );
  }

  // 4. Gate regressions — any gate true→false.
  const gatesRegressed: string[] = [];
  for (const gateName of Object.keys(before.gatesPass)) {
    if (before.gatesPass[gateName] && !after.gatesPass[gateName]) {
      gatesRegressed.push(gateName);
    }
  }
  if (gatesRegressed.length > deriveZeroValue()) {
    reasons.push(`Gate(s) regressed (were passing, now failing): ${gatesRegressed.join(', ')}.`);
  }

  // 5. Scenario regressions — any scenario true→false.
  const scenariosRegressed: string[] = [];
  for (const scenarioId of Object.keys(before.scenarioPass)) {
    if (before.scenarioPass[scenarioId] && !after.scenarioPass[scenarioId]) {
      scenariosRegressed.push(scenarioId);
    }
  }
  if (scenariosRegressed.length > deriveZeroValue()) {
    reasons.push(
      `Scenario(s) regressed (were passing, now failing): ${scenariosRegressed.join(', ')}.`,
    );
  }

  // 6. Runtime HIGH signals must not increase.
  const runtimeHighDelta = after.runtimeHighSignals - before.runtimeHighSignals;
  if (runtimeHighDelta > deriveZeroValue()) {
    reasons.push(
      `Runtime HIGH signals increased from ${before.runtimeHighSignals} to ${after.runtimeHighSignals} (+${runtimeHighDelta}).`,
    );
  }

  const executionMatrixRegressions = detectExecutionMatrixRegressions(
    before.executionMatrixSummary ?? {},
    after.executionMatrixSummary ?? {},
  );
  if (executionMatrixRegressions.length > deriveZeroValue()) {
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
    scoreDelta > deriveZeroValue() && observedSupport.length === deriveZeroValue()
      ? plannedOrInferredDebtReduced
      : [];
  if (unsupportedScoreIncrease.length > deriveZeroValue()) {
    reasons.push(
      `Pulse score increased from ${before.score} to ${after.score} without observed evidence improvement; planned/inferred-only reductions cannot improve score alone: ${unsupportedScoreIncrease.join(', ')}.`,
    );
  }

  return {
    regressed: reasons.length > deriveZeroValue(),
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
