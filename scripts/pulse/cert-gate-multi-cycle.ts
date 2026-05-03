/**
 * multiCycleConvergencePass gate evaluator.
 *
 * Verifies that PULSE has accumulated >= 3 real, executed, non-regressing
 * autonomous cycles. A cycle is counted when:
 *  - codex.executed === true
 *  - codex.exitCode === 0
 *  - validation.commands.length > 0 and every command has exitCode === 0
 *  - directiveAfter.score is >= directiveBefore.score
 *  - directiveAfter.blockingTier <= directiveBefore.blockingTier (lower = better)
 *  - execution matrix does not regress when before/after snapshots are present
 *
 * The gate is pure: callers supply the pre-loaded autonomy state; no I/O here.
 */
export type { PulseAutonomyStateSnapshot } from './__parts__/cert-gate-multi-cycle/main';
export {
  REQUIRED_NON_REGRESSING_CYCLES,
  evaluateMultiCycleConvergenceGate,
} from './__parts__/cert-gate-multi-cycle/main';
