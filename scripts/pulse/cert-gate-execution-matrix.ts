import type { PulseExecutionMatrix, PulseGateResult } from './types';
import { gateFail } from './cert-gate-evaluators';

/** Gate: every discovered executable path is classified by the matrix. */
export function evaluateExecutionMatrixCompleteGate(
  matrix?: PulseExecutionMatrix | null,
): PulseGateResult {
  if (!matrix) {
    return gateFail(
      'PULSE_EXECUTION_MATRIX.json was not built for this certification run.',
      'missing_evidence',
      { evidenceMode: 'aspirational', confidence: 'low' },
    );
  }
  if (matrix.summary.nonTerminalPaths > 0 || matrix.summary.unknownPaths > 0) {
    return gateFail(
      `Execution matrix still has ${matrix.summary.unknownPaths} unknown path(s) and ${matrix.summary.nonTerminalPaths} non-terminal path(s).`,
      'checker_gap',
      { evidenceMode: 'inferred', confidence: 'high' },
    );
  }
  return {
    status: 'pass',
    reason: `Execution matrix classified ${matrix.summary.totalPaths} path(s) with zero unknown and zero non-terminal paths.`,
    evidenceMode: 'inferred',
    confidence: 'high',
  };
}

/** Gate: critical paths must be observed pass/fail or explicitly human-blocked. */
export function evaluateCriticalPathObservedGate(
  matrix?: PulseExecutionMatrix | null,
): PulseGateResult {
  if (!matrix) {
    return gateFail('Execution matrix is missing, so critical path observation is unknown.', 'missing_evidence');
  }
  if (matrix.summary.criticalUnobservedPaths > 0) {
    const affected = matrix.paths
      .filter(
        (path) =>
          path.risk === 'high' &&
          !['observed_pass', 'observed_fail', 'blocked_human_required'].includes(path.status),
      )
      .slice(0, 8);
    return gateFail(
      `Execution matrix still has ${matrix.summary.criticalUnobservedPaths} critical path(s) without observed pass/fail evidence: ${affected.map((path) => path.pathId).join(', ')}.`,
      'missing_evidence',
      {
        affectedCapabilityIds: affected
          .map((path) => path.capabilityId)
          .filter((id): id is string => Boolean(id)),
        affectedFlowIds: affected.map((path) => path.flowId).filter((id): id is string => Boolean(id)),
        evidenceMode: 'inferred',
        confidence: 'high',
      },
    );
  }
  return {
    status: 'pass',
    reason: 'All critical matrix paths are observed pass/fail or explicitly human-blocked.',
    evidenceMode: 'observed',
    confidence: 'high',
  };
}

/** Gate: observed failures must include an exact breakpoint. */
export function evaluateBreakpointPrecisionGate(
  matrix?: PulseExecutionMatrix | null,
): PulseGateResult {
  if (!matrix) {
    return gateFail('Execution matrix is missing, so breakpoint precision is unknown.', 'missing_evidence');
  }
  if (matrix.summary.impreciseBreakpoints > 0) {
    return gateFail(
      `Execution matrix has ${matrix.summary.impreciseBreakpoints} observed failure(s) without precise breakpoints.`,
      'checker_gap',
      { evidenceMode: 'observed', confidence: 'high' },
    );
  }
  return {
    status: 'pass',
    reason: 'Every observed failure in the execution matrix has a breakpoint.',
    evidenceMode: 'observed',
    confidence: 'high',
  };
}
