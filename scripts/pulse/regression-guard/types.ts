import type { PulseExecutionMatrixSummary } from '../types.execution-matrix';

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
