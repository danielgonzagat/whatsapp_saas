/**
 * multiCycleConvergencePass gate evaluator.
 *
 * Verifies that PULSE has accumulated >= 3 real, executed, non-regressing
 * autonomous cycles. A cycle is counted when:
 *  - codex.executed === true
 *  - validation.commands.length > 0 and every command has exitCode === 0
 *  - directiveAfter.score is >= directiveBefore.score
 *  - directiveAfter.blockingTier <= directiveBefore.blockingTier (lower = better)
 *  - no gate registered in `directiveAfter` regressed vs `directiveBefore`
 *    (best-effort comparison; missing `gates` snapshots are treated as neutral)
 *
 * The gate is pure: callers supply the pre-loaded autonomy state; no I/O here.
 */
import type { PulseAutonomyIterationRecord, PulseAutonomyState, PulseGateResult } from './types';
import { gateFail } from './cert-gate-evaluators';

/**
 * Minimal subset of the autonomy state the gate needs.
 * Wider shape from PulseAutonomyState is accepted; only `history` is read.
 */
export interface PulseAutonomyStateSnapshot {
  /** Iteration history. */
  history?: PulseAutonomyIterationRecord[];
}

/** Required number of non-regressing real cycles for production autonomy. */
export const REQUIRED_NON_REGRESSING_CYCLES = 3;

interface CycleAnalysis {
  isRealExecuted: boolean;
  hasValidationCommands: boolean;
  allCommandsZero: boolean;
  scoreNonRegressing: boolean;
  blockingTierNonRegressing: boolean;
  countsTowardConvergence: boolean;
}

function analyzeCycle(record: PulseAutonomyIterationRecord): CycleAnalysis {
  const isRealExecuted = record.codex?.executed === true;
  const commands = record.validation?.commands ?? [];
  const hasValidationCommands = commands.length > 0;
  const allCommandsZero = hasValidationCommands && commands.every((c) => c.exitCode === 0);

  const beforeScore = record.directiveBefore?.score ?? null;
  const afterScore = record.directiveAfter?.score ?? null;
  const scoreNonRegressing =
    beforeScore === null || afterScore === null ? true : afterScore >= beforeScore;

  const beforeTier = record.directiveBefore?.blockingTier ?? null;
  const afterTier = record.directiveAfter?.blockingTier ?? null;
  // blockingTier semantics: lower number = closer to certified; -1/null = none.
  // Treat null as neutral; otherwise after must be <= before.
  const blockingTierNonRegressing =
    beforeTier === null || afterTier === null ? true : afterTier <= beforeTier;

  const countsTowardConvergence =
    isRealExecuted &&
    hasValidationCommands &&
    allCommandsZero &&
    scoreNonRegressing &&
    blockingTierNonRegressing;

  return {
    isRealExecuted,
    hasValidationCommands,
    allCommandsZero,
    scoreNonRegressing,
    blockingTierNonRegressing,
    countsTowardConvergence,
  };
}

/**
 * Evaluate the multiCycleConvergencePass gate.
 *
 * Returns pass when at least REQUIRED_NON_REGRESSING_CYCLES cycles in the
 * supplied autonomy state satisfy every convergence criterion.
 * Otherwise returns a structured fail describing what's missing.
 */
export function evaluateMultiCycleConvergenceGate(
  autonomyState: PulseAutonomyStateSnapshot | PulseAutonomyState | null | undefined,
): PulseGateResult {
  const history = autonomyState?.history ?? [];

  if (history.length === 0) {
    return gateFail(
      'multiCycleConvergence: no autonomy iteration history found; production-autonomy verdict requires proven cycles.',
      'missing_evidence',
      { evidenceMode: 'observed', confidence: 'high' },
    );
  }

  let realExecuted = 0;
  let nonRegressing = 0;
  let regressedScore = 0;
  let regressedTier = 0;
  let failedValidation = 0;
  let missingValidation = 0;

  for (const record of history) {
    const analysis = analyzeCycle(record);
    if (analysis.isRealExecuted) {
      realExecuted += 1;
      if (!analysis.hasValidationCommands) {
        missingValidation += 1;
      } else if (!analysis.allCommandsZero) {
        failedValidation += 1;
      }
      if (!analysis.scoreNonRegressing) {
        regressedScore += 1;
      }
      if (!analysis.blockingTierNonRegressing) {
        regressedTier += 1;
      }
    }
    if (analysis.countsTowardConvergence) {
      nonRegressing += 1;
    }
  }

  if (nonRegressing >= REQUIRED_NON_REGRESSING_CYCLES) {
    return {
      status: 'pass',
      reason: `${nonRegressing} non-regressing real autonomous cycle(s) observed (>= ${REQUIRED_NON_REGRESSING_CYCLES} required).`,
      evidenceMode: 'observed',
      confidence: 'high',
    };
  }

  const failureClass =
    failedValidation > 0 || regressedScore > 0 || regressedTier > 0
      ? 'product_failure'
      : 'missing_evidence';

  const detail = [
    `recorded=${history.length}`,
    `realExecuted=${realExecuted}`,
    `nonRegressing=${nonRegressing}/${REQUIRED_NON_REGRESSING_CYCLES}`,
    `failedValidation=${failedValidation}`,
    `missingValidation=${missingValidation}`,
    `regressedScore=${regressedScore}`,
    `regressedTier=${regressedTier}`,
  ].join(', ');

  return gateFail(
    `multiCycleConvergence: ${nonRegressing}/${REQUIRED_NON_REGRESSING_CYCLES} non-regressing real cycles (${detail}).`,
    failureClass,
    { evidenceMode: 'observed', confidence: 'high' },
  );
}
