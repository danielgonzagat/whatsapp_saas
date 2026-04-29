import type { PulseExecutionMatrix, PulseExecutionMatrixPath, PulseGateResult } from './types';
import { gateFail } from './cert-gate-evaluators';

export interface PulsePathCoverageGateState {
  summary?: {
    totalPaths?: number;
    inferredOnly?: number;
    criticalInferredOnly?: number;
    criticalUnobserved?: number;
    coveragePercent?: number;
  };
}

function hasPreciseTerminalReason(path: PulseExecutionMatrixPath): boolean {
  if (path.status === 'observed_pass' || path.status === 'observed_fail') {
    return true;
  }
  if (
    path.status === 'blocked_human_required' ||
    path.status === 'inferred_only' ||
    path.status === 'untested'
  ) {
    return false;
  }
  const breakpoint = path.breakpoint;
  if (!breakpoint) {
    return false;
  }
  const hasLocation = Boolean(breakpoint.filePath || breakpoint.nodeId || breakpoint.routePattern);
  return hasLocation && breakpoint.reason.length > 0 && breakpoint.recovery.length > 0;
}

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

/** Gate: critical paths must be observed or carry a precise terminal reason. */
export function evaluateCriticalPathObservedGate(
  matrix?: PulseExecutionMatrix | null,
  pathCoverage?: PulsePathCoverageGateState | null,
): PulseGateResult {
  if (!matrix) {
    return gateFail(
      'Execution matrix is missing, so critical path observation is unknown.',
      'missing_evidence',
    );
  }
  const criticalUnobserved =
    pathCoverage?.summary?.criticalUnobserved ?? pathCoverage?.summary?.criticalInferredOnly ?? 0;
  if (criticalUnobserved > 0) {
    return gateFail(
      `Path coverage still has ${criticalUnobserved} critical unobserved path(s); execution matrix precision cannot be treated as observed proof.`,
      'missing_evidence',
      {
        evidenceMode: 'inferred',
        confidence: 'high',
      },
    );
  }
  const matrixCriticalUnobserved = matrix.paths.filter(
    (path) => (path.risk === 'high' || path.risk === 'critical') && !hasPreciseTerminalReason(path),
  );
  if (matrix.summary.criticalUnobservedPaths > 0 || matrixCriticalUnobserved.length > 0) {
    const affected = matrixCriticalUnobserved.slice(0, 8);
    const unobservedCount = Math.max(
      matrix.summary.criticalUnobservedPaths,
      matrixCriticalUnobserved.length,
    );
    return gateFail(
      `Execution matrix still has ${unobservedCount} critical path(s) without observed evidence or a precise terminal reason: ${affected.map((path) => path.pathId).join(', ')}.`,
      'missing_evidence',
      {
        affectedCapabilityIds: affected
          .map((path) => path.capabilityId)
          .filter((id): id is string => Boolean(id)),
        affectedFlowIds: affected
          .map((path) => path.flowId)
          .filter((id): id is string => Boolean(id)),
        evidenceMode: 'inferred',
        confidence: 'high',
      },
    );
  }
  return {
    status: 'pass',
    reason:
      'All critical matrix paths are observed pass/fail or carry a precise non-executable terminal reason.',
    evidenceMode: 'observed',
    confidence: 'high',
  };
}

/** Gate: observed failures must include an exact breakpoint. */
export function evaluateBreakpointPrecisionGate(
  matrix?: PulseExecutionMatrix | null,
): PulseGateResult {
  if (!matrix) {
    return gateFail(
      'Execution matrix is missing, so breakpoint precision is unknown.',
      'missing_evidence',
    );
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
