import type { PulseExecutionMatrixPath } from '../../types';
import type {
  PathCoverageArtifactLink,
  PathCoverageEntry,
  PathCoverageExpectedEvidence,
} from '../../types.path-coverage-engine';
import {
  isProtectedFile as isGovernanceProtectedFile,
  loadGovernanceBoundary,
  normalizePath,
  type GovernanceBoundary,
} from '../../scope-state-classify';
import type { PathProofTask, PathProofTaskMode } from '../../path-proof-runner';

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

function isObserved(path: PulseExecutionMatrixPath): boolean {
  return path.status === 'observed_pass' || path.status === 'observed_fail';
}

function isTerminallyClassifiedWithoutAutonomousProof(
  path: PulseExecutionMatrixPath,
  governanceBoundary: GovernanceBoundary,
): boolean {
  return (
    path.status === 'not_executable' ||
    path.status === 'unreachable' ||
    path.status === 'observation_only' ||
    path.status === 'blocked_human_required' ||
    path.executionMode === 'human_required' ||
    path.executionMode === 'observation_only' ||
    touchesProtectedGovernance(path, governanceBoundary)
  );
}

function hasAutonomousProofEntrypoint(path: PulseExecutionMatrixPath): boolean {
  return Boolean(
    path.routePatterns.length > 0 ||
    path.entrypoint.routePattern ||
    path.entrypoint.nodeId ||
    path.entrypoint.filePath ||
    path.capabilityId ||
    path.flowId ||
    path.chain.length > 0,
  );
}

export function isTerminalProofCandidate(
  path: PulseExecutionMatrixPath,
  governanceBoundary: GovernanceBoundary,
  observedProofPathIds: Set<string>,
): boolean {
  return (
    isCriticalMatrixPath(path) &&
    !isObserved(path) &&
    !observedProofPathIds.has(path.pathId) &&
    !isTerminallyClassifiedWithoutAutonomousProof(path, governanceBoundary) &&
    hasAutonomousProofEntrypoint(path) &&
    hasPreciseTerminalReason(path)
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function touchesProtectedGovernance(
  path: PulseExecutionMatrixPath,
  governanceBoundary: GovernanceBoundary,
): boolean {
  return unique([
    path.entrypoint.filePath ?? '',
    path.breakpoint?.filePath ?? '',
    ...path.filePaths,
  ]).some((filePath) => isGovernanceProtectedFile(normalizePath(filePath), governanceBoundary));
}

export function classifyTaskMode(
  path: PulseExecutionMatrixPath,
  governanceBoundary: GovernanceBoundary,
): PathProofTaskMode {
  if (path.status === 'not_executable') {
    return 'not_executable';
  }
  if (
    path.status === 'blocked_human_required' ||
    path.executionMode === 'human_required' ||
    path.executionMode === 'observation_only' ||
    touchesProtectedGovernance(path, governanceBoundary)
  ) {
    return 'human_required';
  }

  const chainRoles = new Set(path.chain.map((step) => step.role));
  if (
    chainRoles.has('side_effect') &&
    path.requiredEvidence.some((requirement) => requirement.kind === 'external')
  ) {
    return 'webhook';
  }
  if (path.routePatterns.length > 0 || Boolean(path.entrypoint.routePattern)) {
    return 'endpoint';
  }
  if (chainRoles.has('worker') || chainRoles.has('queue')) {
    return 'worker';
  }
  if (
    chainRoles.has('trigger') ||
    chainRoles.has('interface') ||
    chainRoles.has('feedback_ui') ||
    path.requiredEvidence.some((requirement) => requirement.kind === 'e2e')
  ) {
    return 'ui';
  }
  return 'function';
}

function taskIdFor(path: PulseExecutionMatrixPath, mode: PathProofTaskMode): string {
  const normalizedPathId = normalizeTaskIdSegment(path.pathId);
  return `path-proof:${mode}:${normalizedPathId}`;
}

function normalizeTaskIdSegment(value: string): string {
  const output: string[] = [];
  let previousWasSeparator = false;

  for (const char of value) {
    const isAllowed =
      (char >= 'a' && char <= 'z') ||
      (char >= 'A' && char <= 'Z') ||
      (char >= '0' && char <= '9') ||
      char === '_';

    if (isAllowed) {
      output.push(char);
      previousWasSeparator = false;
      continue;
    }

    if (char === '-') {
      if (output.length > 0 && !previousWasSeparator) {
        output.push(char);
        previousWasSeparator = true;
      }
      continue;
    }

    if (output.length > 0 && !previousWasSeparator) {
      output.push('-');
      previousWasSeparator = true;
    }
  }

  while (output[output.length - 1] === '-') {
    output.pop();
  }

  return output.join('');
}

function defaultExpectedEvidence(path: PulseExecutionMatrixPath): PathCoverageExpectedEvidence[] {
  return path.requiredEvidence.map((requirement) => ({
    kind: requirement.kind,
    required: requirement.required,
    reason: requirement.reason,
  }));
}

function normalizeArtifactLinks(
  coverageEntry: PathCoverageEntry | undefined,
  path: PulseExecutionMatrixPath,
): PathProofTask['artifactLinks'] {
  const MATRIX_ARTIFACT = '.pulse/current/PULSE_EXECUTION_MATRIX.json';
  const COVERAGE_ARTIFACT = '.pulse/current/PULSE_PATH_COVERAGE.json';
  const OUTPUT_ARTIFACT = '.pulse/current/PULSE_PATH_PROOF_TASKS.json';

  const links: PathProofTask['artifactLinks'] = [
    { artifactPath: MATRIX_ARTIFACT, relationship: 'source_matrix' },
    { artifactPath: COVERAGE_ARTIFACT, relationship: 'coverage_state' },
    { artifactPath: OUTPUT_ARTIFACT, relationship: 'proof_task_plan' },
  ];

  const coverageLinks: PathCoverageArtifactLink[] = coverageEntry?.artifactLinks ?? [];
  for (const link of coverageLinks) {
    links.push({ artifactPath: link.artifactPath, relationship: link.relationship });
  }

  for (const artifactPath of path.observedEvidence.map((entry) => entry.artifactPath)) {
    links.push({ artifactPath, relationship: 'observed_evidence' });
  }

  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.relationship}:${link.artifactPath}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildTaskReason(
  path: PulseExecutionMatrixPath,
  coverageEntry: PathCoverageEntry | undefined,
  mode: PathProofTaskMode,
): string {
  if (mode === 'not_executable') {
    return path.breakpoint?.reason ?? 'Path is terminally classified as not executable.';
  }
  if (mode === 'human_required') {
    return path.breakpoint?.reason ?? 'Path requires governed human validation before execution.';
  }
  return (
    coverageEntry?.terminalProof.reason ??
    path.breakpoint?.reason ??
    `Terminal critical path for ${path.capabilityId ?? path.entrypoint.description} still needs observed pass/fail proof.`
  );
}

export function buildPathProofTask(
  path: PulseExecutionMatrixPath,
  coverageEntry: PathCoverageEntry | undefined,
  governanceBoundary: GovernanceBoundary,
): PathProofTask {
  const mode = classifyTaskMode(path, governanceBoundary);
  const autonomousExecutionAllowed = mode !== 'human_required' && mode !== 'not_executable';
  const command = coverageEntry?.terminalProof.validationCommand ?? path.validationCommand;

  return {
    taskId: taskIdFor(path, mode),
    pathId: path.pathId,
    capabilityId: path.capabilityId,
    flowId: path.flowId,
    mode,
    status: 'planned',
    executed: false,
    coverageCountsAsObserved: false,
    autonomousExecutionAllowed,
    command,
    reason: buildTaskReason(path, coverageEntry, mode),
    sourceStatus: path.status,
    risk: path.risk,
    entrypoint: path.entrypoint,
    breakpoint: path.breakpoint,
    expectedEvidence: coverageEntry?.expectedEvidence ?? defaultExpectedEvidence(path),
    artifactLinks: normalizeArtifactLinks(coverageEntry, path),
  };
}
