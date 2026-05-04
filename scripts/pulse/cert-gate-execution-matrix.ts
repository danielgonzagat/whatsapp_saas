import type { PulseExecutionMatrix, PulseExecutionMatrixPath, PulseGateResult } from './types';
import { gateFail } from './cert-gate-evaluators';
import { classifyExecutionReality } from './execution-reality-audit';
import type { PulseExecutionRealityInput } from './types.execution-reality-audit';

export interface PulsePathCoverageGateState {
  summary?: {
    totalPaths?: number;
    probeBlueprintGenerated?: number;
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
  if (path.status === 'blocked_human_required') {
    return false;
  }
  const breakpoint = path.breakpoint;
  if (!breakpoint) {
    return false;
  }
  const hasLocation = Boolean(breakpoint.filePath || breakpoint.nodeId || breakpoint.routePattern);
  return hasLocation && breakpoint.reason.length > 0 && breakpoint.recovery.length > 0;
}

function isCriticalMatrixPath(path: PulseExecutionMatrixPath): boolean {
  return path.risk === 'high' || path.risk === 'critical';
}

function toExecutionRealityInput(
  path: PulseExecutionMatrixPath,
  evidence: PulseExecutionMatrixPath['observedEvidence'][number],
): PulseExecutionRealityInput {
  return {
    id: `${path.pathId}:${evidence.source}:${evidence.artifactPath}`,
    sourceArtifact: evidence.artifactPath,
    status: evidence.status,
    source: evidence.source,
    executed: evidence.executed,
    summary: evidence.summary,
    artifactPaths: [evidence.artifactPath],
  };
}

function hasObservedRealityProof(path: PulseExecutionMatrixPath): boolean {
  return path.observedEvidence.some(
    (evidence) =>
      classifyExecutionReality(toExecutionRealityInput(path, evidence)).countsAsObservedProof,
  );
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

/** Gate: critical paths must be observed. Terminal reasons route proof work, not pass evidence. */
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
      `PULSE_PATH_COVERAGE.json still has ${criticalUnobserved} critical unobserved path(s). Next ai_safe action: regenerate PULSE_EXECUTION_MATRIX.json and PULSE_PATH_COVERAGE.json after running the matching validation probe for the listed path coverage entries.`,
      'missing_evidence',
      {
        evidenceMode: 'inferred',
        confidence: 'high',
      },
    );
  }
  const matrixCriticalUnobserved = matrix.paths.filter(
    (path) => isCriticalMatrixPath(path) && !hasPreciseTerminalReason(path),
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
  const observedStatusWithoutRealityProof = matrix.paths.filter(
    (path) =>
      isCriticalMatrixPath(path) &&
      (path.status === 'observed_pass' || path.status === 'observed_fail') &&
      !hasObservedRealityProof(path),
  );
  if (observedStatusWithoutRealityProof.length > 0) {
    const affected = observedStatusWithoutRealityProof.slice(0, 8);
    return gateFail(
      `${observedStatusWithoutRealityProof.length} critical path(s) claim observed status but PULSE_EXECUTION_REALITY_AUDIT classifies their evidence as non-observed proof: ${affected.map((path) => path.pathId).join(', ')}.`,
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
  const terminalWithoutObservedEvidence = matrix.paths.filter(
    (path) =>
      isCriticalMatrixPath(path) &&
      path.status !== 'observed_pass' &&
      path.status !== 'observed_fail' &&
      hasPreciseTerminalReason(path),
  );
  if (terminalWithoutObservedEvidence.length > 0) {
    const affected = terminalWithoutObservedEvidence.slice(0, 8);
    return gateFail(
      `${terminalWithoutObservedEvidence.length} terminal critical path(s) have precise proof blueprints but still need observed pass/fail evidence: ${affected.map((path) => path.pathId).join(', ')}. Next ai_safe action: run the listed validation command(s), attach runtime/flow/browser/external evidence, and refresh PULSE_EXECUTION_MATRIX.json plus PULSE_PATH_COVERAGE.json.`,
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
      'All critical matrix paths have observed pass/fail evidence in PULSE_EXECUTION_MATRIX.json.',
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
