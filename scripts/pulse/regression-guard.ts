/**
 * RegressionGuard — detects Pulse health regressions across an autonomy cycle.
 *
 * Compares a "before" and "after" PulseSnapshot and flags any metric that moved
 * in a direction that indicates a regression.  The guard is intentionally strict:
 * every tracked metric is a one-way ratchet.
 */

export type {
  PulseSnapshot,
  RegressionResult,
  PulseProofReadinessSummary,
  MatrixRegressionMetric,
  RollbackOutcome,
} from './__parts__/regression-guard/types';

export { detectRegression } from './__parts__/regression-guard/detect';
export { captureRegressionSnapshot } from './__parts__/regression-guard/snapshot';
export {
  detectChangedFilesSinceHead,
  rollbackRegression,
} from './__parts__/regression-guard/rollback';

// Hard-enforcement helpers (RegressionError / throwOnRegression) are co-located
// in a sibling module to keep this file under the new-file size cap.  They are
// re-exported here so existing call sites (`from './regression-guard'`) continue
// to work without churn.
export { RegressionError, throwOnRegression } from './regression-guard.hard-enforcement';
