/**
 * RegressionGuard — detects Pulse health regressions across an autonomy cycle.
 *
 * Compares a "before" and "after" PulseSnapshot and flags any metric that moved
 * in a direction that indicates a regression.  The guard is intentionally strict:
 * every tracked metric is a one-way ratchet.
 */
import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import type { PulseExecutionMatrixSummary } from './types.execution-matrix';

/** Snapshot of key Pulse health metrics captured at a point in time. */
export interface PulseSnapshot {
  /** Overall Pulse score (0-100). Must never decrease. */
  score: number;
  /**
   * Blocking certification tier (0 = clean / certified, 1-4 = blocking tier).
   * Must never increase.
   */
  blockingTier: number;
  /** Total number of Codacy HIGH-severity issues. Must never increase. */
  codacyHighCount: number;
  /**
   * Per-gate pass/fail state, keyed by gate name (e.g. "staticPass").
   * A gate that was passing (true) must never flip to failing (false).
   */
  gatesPass: Record<string, boolean>;
  /**
   * Per-scenario pass/fail state, keyed by scenario id (e.g. "customer-auth-shell").
   * A scenario that was passing (true) must never flip to failing (false).
   */
  scenarioPass: Record<string, boolean>;
  /** Count of HIGH-severity runtime signals. Must never increase. */
  runtimeHighSignals: number;
  /** Execution matrix summary. One-way metrics must not regress when present. */
  executionMatrixSummary?: Partial<PulseExecutionMatrixSummary>;
  /** Proof-readiness summary. Planned/unexecuted evidence must not inflate score. */
  proofReadinessSummary?: Partial<PulseProofReadinessSummary>;
}

/** Detailed result of a before/after regression comparison. */
export interface RegressionResult {
  /** True when at least one regression was detected. */
  regressed: boolean;
  /** Human-readable descriptions of every detected regression. */
  reasons: string[];
  /** Numeric / structural deltas for each tracked dimension. */
  deltas: {
    /** after.score - before.score  (negative = regression). */
    scoreDelta: number;
    /** after.blockingTier - before.blockingTier  (positive = regression). */
    tierDelta: number;
    /** after.codacyHighCount - before.codacyHighCount  (positive = regression). */
    codacyHighDelta: number;
    /** Gate names that were passing before but are failing after. */
    gatesRegressed: string[];
    /** Scenario ids that were passing before but are failing after. */
    scenariosRegressed: string[];
    /** after.runtimeHighSignals - before.runtimeHighSignals  (positive = regression). */
    runtimeHighDelta: number;
    /** Execution matrix metric regressions. */
    executionMatrixRegressions: string[];
    /** Score increases rejected because only planned/inferred debt improved. */
    unsupportedScoreIncrease: string[];
  };
}

interface PulseProofReadinessSummary {
  observedEvidence: number;
  observedPass: number;
  observedFail: number;
  plannedEvidence: number;
  plannedOrUnexecutedEvidence: number;
  nonObservedEvidence: number;
}

type MatrixRegressionMetric =
  | 'observedPass'
  | 'observedFail'
  | 'untested'
  | 'blockedHumanRequired'
  | 'unreachable'
  | 'inferredOnly'
  | 'unknownPaths'
  | 'criticalUnobservedPaths'
  | 'impreciseBreakpoints';

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
  if (scoreDelta < 0) {
    reasons.push(
      `Pulse score decreased from ${before.score} to ${after.score} (delta ${scoreDelta}).`,
    );
  }

  // 2. Blocking tier must not increase.
  const tierDelta = after.blockingTier - before.blockingTier;
  if (tierDelta > 0) {
    reasons.push(
      `Blocking tier increased from ${before.blockingTier} to ${after.blockingTier} (delta +${tierDelta}).`,
    );
  }

  // 3. Codacy HIGH count must not increase.
  const codacyHighDelta = after.codacyHighCount - before.codacyHighCount;
  if (codacyHighDelta > 0) {
    reasons.push(
      `Codacy HIGH issue count increased from ${before.codacyHighCount} to ${after.codacyHighCount} (+${codacyHighDelta}).`,
    );
  }

  // 4. Gate regressions — any gate true→false.
  const gatesRegressed: string[] = [];
  for (const gateName of Object.keys(before.gatesPass)) {
    if (before.gatesPass[gateName] === true && after.gatesPass[gateName] === false) {
      gatesRegressed.push(gateName);
    }
  }
  if (gatesRegressed.length > 0) {
    reasons.push(`Gate(s) regressed (were passing, now failing): ${gatesRegressed.join(', ')}.`);
  }

  // 5. Scenario regressions — any scenario true→false.
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

  // 6. Runtime HIGH signals must not increase.
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

/**
 * Result of a scoped rollback attempt.
 */
export interface RollbackOutcome {
  /** True when at least one path was actually reverted (or the noop case where nothing was changed). */
  attempted: boolean;
  /** Files the rollback touched (relative to repo root). */
  revertedFiles: string[];
  /** Untracked files removed (relative to repo root). */
  removedUntracked: string[];
  /** Human-readable summary, suitable for stopReason or log lines. */
  summary: string;
  /** True when rollback was skipped because it would be unsafe (e.g. file outside the unit's declared scope had user changes). */
  skipped: boolean;
}
import "./__companions__/regression-guard.companion";
