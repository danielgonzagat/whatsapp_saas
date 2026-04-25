/**
 * RegressionGuard — hard-enforcement helpers.
 *
 * Companion module to {@link ./regression-guard.ts}.  Hosts the throwing
 * counterparts used by the autonomy loop to enforce hard stops on regressions:
 *
 *   - {@link RegressionError}: thrown when a regression is detected.
 *   - {@link throwOnRegression}: convenience wrapper around a
 *     {@link RegressionResult} that throws iff `regressed === true`.
 *
 * The plain detection / snapshot / rollback utilities continue to live in
 * `regression-guard.ts` and are re-exported from there.
 */
import type { RegressionResult } from './regression-guard';

/**
 * Error thrown when a hard regression guard detects a regression.
 * Contains detailed deltas and human-readable reasons.
 */
export class RegressionError extends Error {
  constructor(
    public reasons: string[],
    public deltas: RegressionResult['deltas'],
  ) {
    super(`RegressionGuard: ${reasons.join(' | ')}`);
    this.name = 'RegressionError';
  }
}

/**
 * Hard guard: throw RegressionError if regression detected, otherwise do nothing.
 * Used in autonomy-loop to enforce hard stops on regressions.
 */
export function throwOnRegression(result: RegressionResult): void {
  if (result.regressed) {
    throw new RegressionError(result.reasons, result.deltas);
  }
}
