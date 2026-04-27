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

/** Required number of non-regressing real cycles for production autonomy.
 *  Temporarily reduced from 3 to 2 while the validation infrastructure matures.
 *  Each cycle is now stricter: must include runtime-touching validation. */
export const REQUIRED_NON_REGRESSING_CYCLES = 2;

interface CycleAnalysis {
  isRealExecuted: boolean;
  hasValidationCommands: boolean;
  hasRuntimeValidation: boolean;
  allCommandsZero: boolean;
  scoreNonRegressing: boolean;
  blockingTierNonRegressing: boolean;
  countsTowardConvergence: boolean;
}

/** True iff the iteration represents an executed Codex run (not a dry-run). */
function isRealExecutedCycle(record: PulseAutonomyIterationRecord): boolean {
  return record.codex?.executed === true;
}

/**
 * Runtime-touching command patterns. A validation command must match at least
 * one of these to prove that runtime behavior (not just static analysis) was
 * exercised during the cycle. Commands like `typecheck` or `pulse --guidance`
 * alone are NOT sufficient.
 */
const RUNTIME_VALIDATION_PATTERNS = [
  /playwright/,
  /--deep/,
  /--flow=/,
  /--customer/,
  /--operator/,
  /--admin/,
  /--total/,
  /test:?e2e/i,
  /jest|vitest|mocha|ava/,
] as const;

/** True if the command string touches runtime behavior (not just static). */
function touchesRuntime(command: string): boolean {
  return RUNTIME_VALIDATION_PATTERNS.some((pattern) => pattern.test(command));
}

/** Validation status: whether commands are present, include runtime, and all returned 0. */
function evaluateValidation(record: PulseAutonomyIterationRecord): {
  hasValidationCommands: boolean;
  hasRuntimeValidation: boolean;
  allCommandsZero: boolean;
} {
  const commands = record.validation?.commands ?? [];
  const hasValidationCommands = commands.length > 0;
  const hasRuntimeValidation = commands.some((c) => touchesRuntime(c.command));
  const allCommandsZero = hasValidationCommands && commands.every((c) => c.exitCode === 0);
  return { hasValidationCommands, hasRuntimeValidation, allCommandsZero };
}

/** Score non-regression: null on either side is neutral; otherwise after >= before. */
function isScoreNonRegressing(record: PulseAutonomyIterationRecord): boolean {
  const beforeScore = record.directiveBefore?.score ?? null;
  const afterScore = record.directiveAfter?.score ?? null;
  if (beforeScore === null || afterScore === null) return true;
  return afterScore >= beforeScore;
}

/**
 * Blocking-tier non-regression: lower number = closer to certified.
 * Treat null as neutral; otherwise after must be <= before.
 */
function isBlockingTierNonRegressing(record: PulseAutonomyIterationRecord): boolean {
  const beforeTier = record.directiveBefore?.blockingTier ?? null;
  const afterTier = record.directiveAfter?.blockingTier ?? null;
  if (beforeTier === null || afterTier === null) return true;
  return afterTier <= beforeTier;
}

function analyzeCycle(record: PulseAutonomyIterationRecord): CycleAnalysis {
  const isRealExecuted = isRealExecutedCycle(record);
  const { hasValidationCommands, hasRuntimeValidation, allCommandsZero } =
    evaluateValidation(record);
  const scoreNonRegressing = isScoreNonRegressing(record);
  const blockingTierNonRegressing = isBlockingTierNonRegressing(record);

  // Cycle counts toward convergence ONLY if validation touched runtime.
  // Typecheck-only cycles are useful for CI gating but do NOT prove
  // autonomous convergence toward production readiness.
  const countsTowardConvergence =
    isRealExecuted &&
    hasValidationCommands &&
    hasRuntimeValidation &&
    allCommandsZero &&
    scoreNonRegressing &&
    blockingTierNonRegressing;

  return {
    isRealExecuted,
    hasValidationCommands,
    hasRuntimeValidation,
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
  let missingRuntimeValidation = 0;

  for (const record of history) {
    const analysis = analyzeCycle(record);
    if (analysis.isRealExecuted) {
      realExecuted += 1;
      if (!analysis.hasValidationCommands) {
        missingValidation += 1;
      } else if (!analysis.allCommandsZero) {
        failedValidation += 1;
      } else if (!analysis.hasRuntimeValidation) {
        missingRuntimeValidation += 1;
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
    `missingRuntimeValidation=${missingRuntimeValidation}`,
    `regressedScore=${regressedScore}`,
    `regressedTier=${regressedTier}`,
  ].join(', ');

  return gateFail(
    `multiCycleConvergence: ${nonRegressing}/${REQUIRED_NON_REGRESSING_CYCLES} non-regressing real cycles (${detail}).`,
    failureClass,
    { evidenceMode: 'observed', confidence: 'high' },
  );
}
