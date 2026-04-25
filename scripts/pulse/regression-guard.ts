/**
 * RegressionGuard — detects Pulse health regressions across an autonomy cycle.
 *
 * Compares a "before" and "after" PulseSnapshot and flags any metric that moved
 * in a direction that indicates a regression.  The guard is intentionally strict:
 * every tracked metric is a one-way ratchet.
 */

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
  };
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
    },
  };
}
