/**
 * multiCycleConvergencePass gate evaluator.
 *
 * Verifies that PULSE has accumulated >= 3 real, executed, non-regressing
 * autonomous cycles. A cycle is counted when:
 *  - codex.executed === true
 *  - validation.commands.length > 0 and every command has exitCode === 0
 *  - directiveAfter.score is >= directiveBefore.score
 *  - directiveAfter.blockingTier <= directiveBefore.blockingTier (lower = better)
 *  - execution matrix does not regress when before/after snapshots are present
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
  hasRuntimeValidation: boolean;
  allCommandsZero: boolean;
  scoreNonRegressing: boolean;
  blockingTierNonRegressing: boolean;
  adapterClosed: boolean;
  adapterBlockers: string[];
  executionMatrixNonRegressing: boolean;
  executionMatrixCompared: boolean;
  executionMatrixRegressions: string[];
  countsTowardConvergence: boolean;
}

type MatrixSummaryKey =
  | 'observedPass'
  | 'observedFail'
  | 'untested'
  | 'blockedHumanRequired'
  | 'unreachable'
  | 'inferredOnly'
  | 'unknownPaths'
  | 'criticalUnobservedPaths'
  | 'impreciseBreakpoints';

type MatrixSummarySnapshot = Partial<Record<MatrixSummaryKey, number>>;

const MATRIX_NON_REGRESSION_RULES: Array<{
  key: MatrixSummaryKey;
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

/** True iff the iteration represents an executed Codex run (not a dry-run). */
function isRealExecutedCycle(record: PulseAutonomyIterationRecord): boolean {
  const legacy = record as unknown as { status?: string; validationCommands?: unknown };
  if (legacy.status === 'completed' && legacy.validationCommands) {
    return true;
  }
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
  const legacy = record as unknown as {
    validationCommands?: { total?: number; passing?: number };
  };
  if (commands.length === 0 && legacy.validationCommands) {
    const total = legacy.validationCommands.total ?? 0;
    const passing = legacy.validationCommands.passing ?? 0;
    return {
      hasValidationCommands: total > 0,
      hasRuntimeValidation: total > 0,
      allCommandsZero: total > 0 && passing === total,
    };
  }
  const hasValidationCommands = commands.length > 0;
  const hasRuntimeValidation = commands.some((c) => touchesRuntime(c.command));
  const allCommandsZero = hasValidationCommands && commands.every((c) => c.exitCode === 0);
  return { hasValidationCommands, hasRuntimeValidation, allCommandsZero };
}

function evaluateAdapters(record: PulseAutonomyIterationRecord): {
  adapterClosed: boolean;
  adapterBlockers: string[];
} {
  const legacy = record as unknown as {
    missingAdapters?: string[];
    adapterStatus?: Record<string, string>;
  };
  const missing = legacy.missingAdapters || [];
  const invalidOrMissing = Object.entries(legacy.adapterStatus || {})
    .filter(([, status]) => status === 'not_available' || status === 'invalid')
    .map(([source]) => source);
  const adapterBlockers = [...new Set([...missing, ...invalidOrMissing])];
  return {
    adapterClosed: adapterBlockers.length === 0,
    adapterBlockers,
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readMatrixSummary(candidate: unknown): MatrixSummarySnapshot | null {
  const object = asObject(candidate);
  if (!object) return null;

  const summaryObject = asObject(object.summary) || object;
  const summary: MatrixSummarySnapshot = {};
  for (const rule of MATRIX_NON_REGRESSION_RULES) {
    const value = readNumber(summaryObject[rule.key]);
    if (value !== null) {
      summary[rule.key] = value;
    }
  }

  return Object.keys(summary).length > 0 ? summary : null;
}

function readExecutionMatrixSummary(
  record: PulseAutonomyIterationRecord,
  phase: 'before' | 'after',
): MatrixSummarySnapshot | null {
  const object = asObject(record);
  const directive = phase === 'before' ? asObject(record.directiveBefore) : asObject(record.directiveAfter);
  const suffix = phase === 'before' ? 'Before' : 'After';
  const candidates = [
    object?.[`executionMatrix${suffix}`],
    object?.[`executionMatrixSummary${suffix}`],
    object?.[`matrix${suffix}`],
    object?.[`matrixSummary${suffix}`],
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

function evaluateExecutionMatrixNonRegression(record: PulseAutonomyIterationRecord): {
  executionMatrixCompared: boolean;
  executionMatrixNonRegressing: boolean;
  executionMatrixRegressions: string[];
} {
  const before = readExecutionMatrixSummary(record, 'before');
  const after = readExecutionMatrixSummary(record, 'after');
  if (!before || !after) {
    return {
      executionMatrixCompared: false,
      executionMatrixNonRegressing: true,
      executionMatrixRegressions: [],
    };
  }

  const regressions: string[] = [];
  for (const rule of MATRIX_NON_REGRESSION_RULES) {
    const beforeValue = before[rule.key];
    const afterValue = after[rule.key];
    if (beforeValue === undefined || afterValue === undefined) continue;
    const regressed =
      rule.direction === 'increase' ? afterValue < beforeValue : afterValue > beforeValue;
    if (regressed) {
      regressions.push(`${rule.key}:${beforeValue}->${afterValue}`);
    }
  }

  return {
    executionMatrixCompared: true,
    executionMatrixNonRegressing: regressions.length === 0,
    executionMatrixRegressions: regressions,
  };
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
  const { adapterClosed, adapterBlockers } = evaluateAdapters(record);
  const {
    executionMatrixCompared,
    executionMatrixNonRegressing,
    executionMatrixRegressions,
  } = evaluateExecutionMatrixNonRegression(record);

  // Cycle counts toward convergence ONLY if validation touched runtime.
  // Typecheck-only cycles are useful for CI gating but do NOT prove
  // autonomous convergence toward production readiness.
  const countsTowardConvergence =
    isRealExecuted &&
    hasValidationCommands &&
    hasRuntimeValidation &&
    allCommandsZero &&
    scoreNonRegressing &&
    blockingTierNonRegressing &&
    adapterClosed &&
    executionMatrixNonRegressing;

  return {
    isRealExecuted,
    hasValidationCommands,
    hasRuntimeValidation,
    allCommandsZero,
    scoreNonRegressing,
    blockingTierNonRegressing,
    adapterClosed,
    adapterBlockers,
    executionMatrixCompared,
    executionMatrixNonRegressing,
    executionMatrixRegressions,
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
  let executionMatrixCompared = 0;
  let regressedExecutionMatrix = 0;
  const executionMatrixRegressions = new Set<string>();
  const adapterBlockers = new Set<string>();

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
      if (!analysis.adapterClosed) {
        for (const adapter of analysis.adapterBlockers) {
          adapterBlockers.add(adapter);
        }
      }
      if (analysis.executionMatrixCompared) {
        executionMatrixCompared += 1;
      }
      if (!analysis.executionMatrixNonRegressing) {
        regressedExecutionMatrix += 1;
        for (const regression of analysis.executionMatrixRegressions) {
          executionMatrixRegressions.add(regression);
        }
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
    failedValidation > 0 ||
    regressedScore > 0 ||
    regressedTier > 0 ||
    regressedExecutionMatrix > 0
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
    `executionMatrixCompared=${executionMatrixCompared}`,
    `regressedExecutionMatrix=${regressedExecutionMatrix}`,
    executionMatrixRegressions.size > 0
      ? `executionMatrixRegression(s)=${[...executionMatrixRegressions].join('|')}`
      : '',
    adapterBlockers.size > 0 ? `missing adapter(s)=${[...adapterBlockers].join('|')}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return gateFail(
    `multiCycleConvergence: ${nonRegressing}/${REQUIRED_NON_REGRESSING_CYCLES} non-regressing real cycles (${detail}).`,
    failureClass,
    { evidenceMode: 'observed', confidence: 'high' },
  );
}
