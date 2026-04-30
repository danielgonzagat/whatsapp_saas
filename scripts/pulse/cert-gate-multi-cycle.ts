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
import type {
  PulseAutonomyIterationRecord,
  PulseAutonomyState,
  PulseAutonomyValidationCommandResult,
  PulseGateResult,
} from './types';
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
  codexPassed: boolean;
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
function isCodexExecutionPassing(record: PulseAutonomyIterationRecord): boolean {
  if (!isRealExecutedCycle(record)) return false;
  const legacy = record as unknown as { status?: string; validationCommands?: unknown };
  if (legacy.status === 'completed' && legacy.validationCommands && !record.codex?.exitCode) {
    return true;
  }
  return record.codex?.exitCode === 0;
}
const RUNTIME_EVIDENCE_TOKEN_GRAMMAR = new Set([
  'browser',
  'e2e',
  'external',
  'flow',
  'playwright',
  'probe',
  'runtime',
  'scenario',
]);
const TEST_EXECUTION_TOKEN_GRAMMAR = new Set([
  'ava',
  'jest',
  'mocha',
  'spec',
  'test',
  'tests',
  'vitest',
]);
const STATIC_ONLY_TOKEN_GRAMMAR = new Set([
  'check',
  'checkall',
  'eslint',
  'guidance',
  'lint',
  'noemit',
  'prettier',
  'tsc',
  'typecheck',
]);
const NON_RUNTIME_LONG_OPTION_GRAMMAR = new Set([
  'config',
  'final',
  'guidance',
  'json',
  'noemit',
  'passwithnotests',
  'profile',
  'runinband',
  'watch',
]);
function normalizeGrammarToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}
function tokenizeCommandGrammar(command: string): string[] {
  return command
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9_-]+/)
    .map(normalizeGrammarToken)
    .filter((token) => token.length > 0);
}
function readBooleanEvidenceField(
  commandObject: Record<string, unknown>,
  fieldName: string,
): boolean {
  const value = commandObject[fieldName];
  return value === true;
}
function hasStructuredRuntimeEvidence(command: PulseAutonomyValidationCommandResult): boolean {
  const commandObject: Record<string, unknown> = { ...command };
  for (const key of Object.keys(commandObject)) {
    const keyTokens = tokenizeCommandGrammar(key);
    const isRuntimeEvidenceKey = keyTokens.some((token) =>
      RUNTIME_EVIDENCE_TOKEN_GRAMMAR.has(token),
    );
    if (isRuntimeEvidenceKey && readBooleanEvidenceField(commandObject, key)) {
      return true;
    }
    const value = commandObject[key];
    if (isRuntimeEvidenceKey && Array.isArray(value) && value.length > 0) {
      return true;
    }
  }
  return false;
}
function commandGrammarTouchesRuntime(command: string): boolean {
  const tokens = tokenizeCommandGrammar(command);
  if (tokens.some((token) => RUNTIME_EVIDENCE_TOKEN_GRAMMAR.has(token))) {
    return true;
  }
  if (tokens.some((token) => TEST_EXECUTION_TOKEN_GRAMMAR.has(token))) {
    return !tokens.every((token) => STATIC_ONLY_TOKEN_GRAMMAR.has(token));
  }
  const longOptions = command
    .split(/\s+/)
    .filter((part) => part.startsWith('--'))
    .map((part) => normalizeGrammarToken(part.split('=')[0] ?? ''))
    .filter((token) => token.length > 0);
  return (
    tokens.includes('run') &&
    tokens.includes('js') &&
    longOptions.some((token) => !NON_RUNTIME_LONG_OPTION_GRAMMAR.has(token))
  );
}
/** True if validation carries runtime behavior evidence, not just static analysis. */
function touchesRuntime(command: PulseAutonomyValidationCommandResult): boolean {
  return hasStructuredRuntimeEvidence(command) || commandGrammarTouchesRuntime(command.command);
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
  const hasRuntimeValidation = commands.some(touchesRuntime);
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
  const directive =
    phase === 'before' ? asObject(record.directiveBefore) : asObject(record.directiveAfter);
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
function formatCycleLabel(record: PulseAutonomyIterationRecord, index: number): string {
  return `cycle${record.iteration ?? index + 1}`;
}
function formatNumericTransition(before: number | null, after: number | null): string {
  return `${before ?? 'missing'}->${after ?? 'missing'}`;
}
function analyzeCycle(record: PulseAutonomyIterationRecord): CycleAnalysis {
  const isRealExecuted = isRealExecutedCycle(record);
  const codexPassed = isCodexExecutionPassing(record);
  const { hasValidationCommands, hasRuntimeValidation, allCommandsZero } =
    evaluateValidation(record);
  const scoreNonRegressing = isScoreNonRegressing(record);
  const blockingTierNonRegressing = isBlockingTierNonRegressing(record);
  const { adapterClosed, adapterBlockers } = evaluateAdapters(record);
  const { executionMatrixCompared, executionMatrixNonRegressing, executionMatrixRegressions } =
    evaluateExecutionMatrixNonRegression(record);
  // Cycle counts toward convergence ONLY if validation touched runtime.
  // Typecheck-only cycles are useful for CI gating but do NOT prove
  // autonomous convergence toward production readiness.
  const countsTowardConvergence =
    isRealExecuted &&
    codexPassed &&
    hasValidationCommands &&
    hasRuntimeValidation &&
    allCommandsZero &&
    scoreNonRegressing &&
    blockingTierNonRegressing &&
    adapterClosed &&
    executionMatrixNonRegressing;
  return {
    isRealExecuted,
    codexPassed,
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
