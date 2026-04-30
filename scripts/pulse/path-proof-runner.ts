import type { PulseExecutionMatrix, PulseExecutionMatrixPath } from './types';
import type {
  PathCoverageArtifactLink,
  PathCoverageEntry,
  PathCoverageExpectedEvidence,
  PathCoverageState,
} from './types.path-coverage-engine';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from './safe-fs';
import { safeJoin } from './safe-path';
import {
  isProtectedFile as isGovernanceProtectedFile,
  loadGovernanceBoundary,
  normalizePath,
  type GovernanceBoundary,
} from './scope-state-classify';

export type PathProofTaskMode =
  | 'endpoint'
  | 'ui'
  | 'worker'
  | 'webhook'
  | 'function'
  | 'not_executable'
  | 'human_required';

export interface PathProofTaskArtifactLink {
  artifactPath: string;
  relationship:
    | 'source_matrix'
    | 'coverage_state'
    | 'probe_blueprint'
    | 'observed_evidence'
    | 'proof_task_plan';
}

export interface PathProofTask {
  taskId: string;
  pathId: string;
  capabilityId: string | null;
  flowId: string | null;
  mode: PathProofTaskMode;
  status: 'planned';
  executed: false;
  coverageCountsAsObserved: false;
  autonomousExecutionAllowed: boolean;
  command: string;
  reason: string;
  sourceStatus: PulseExecutionMatrixPath['status'];
  risk: PulseExecutionMatrixPath['risk'];
  entrypoint: PulseExecutionMatrixPath['entrypoint'];
  breakpoint: PulseExecutionMatrixPath['breakpoint'];
  expectedEvidence: PathCoverageExpectedEvidence[];
  artifactLinks: PathProofTaskArtifactLink[];
}

export interface PathProofPlan {
  generatedAt: string;
  summary: {
    terminalWithoutObservedEvidence: number;
    plannedTasks: number;
    executableTasks: number;
    humanRequiredTasks: number;
    notExecutableTasks: number;
  };
  tasks: PathProofTask[];
}

export interface BuildPathProofPlanInput {
  matrix?: PulseExecutionMatrix;
  pathCoverage?: PathCoverageState;
  generatedAt?: string;
  writeArtifact?: boolean;
}

const OUTPUT_ARTIFACT = '.pulse/current/PULSE_PATH_PROOF_TASKS.json';
const MATRIX_ARTIFACT = '.pulse/current/PULSE_EXECUTION_MATRIX.json';
const COVERAGE_ARTIFACT = '.pulse/current/PULSE_PATH_COVERAGE.json';
const PATH_PROOF_EVIDENCE_ARTIFACT = '.pulse/current/PULSE_PATH_PROOF_EVIDENCE.json';

interface ObservedPathProofEvidenceEntry {
  pathId: string;
  observed: boolean;
  coverageCountsAsObserved: boolean;
  disposition: 'observed_pass' | 'observed_fail' | string;
  evidenceState: 'observed' | 'not_run' | string;
  freshness?: {
    status: 'fresh' | 'stale' | 'not_run' | string;
    observedAt: string | null;
  };
  observedEvidenceLink?: {
    observedAt: string;
  } | null;
}

interface ObservedPathProofEvidenceArtifact {
  tasks?: ObservedPathProofEvidenceEntry[];
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

function isTerminalProofCandidate(
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

function touchesProtectedGovernance(
  path: PulseExecutionMatrixPath,
  governanceBoundary: GovernanceBoundary,
): boolean {
  return unique([
    path.entrypoint.filePath ?? '',
    path.breakpoint?.filePath ?? '',
    ...path.filePaths,
  ]).some((filePath) => isGovernanceProtectedFile(normalizePath(filePath), governanceBoundary));
}

function classifyTaskMode(
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
): PathProofTaskArtifactLink[] {
  const links: PathProofTaskArtifactLink[] = [
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

function buildPathProofTask(
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

function readMatrix(rootDir: string): PulseExecutionMatrix {
  return readJsonFile<PulseExecutionMatrix>(safeJoin(rootDir, MATRIX_ARTIFACT));
}

function readPathCoverage(rootDir: string): PathCoverageState | undefined {
  const coveragePath = safeJoin(rootDir, COVERAGE_ARTIFACT);
  if (!pathExists(coveragePath)) {
    return undefined;
  }
  return readJsonFile<PathCoverageState>(coveragePath);
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readPathProofEvidence(rootDir: string): ObservedPathProofEvidenceArtifact | undefined {
  const evidencePath = safeJoin(rootDir, PATH_PROOF_EVIDENCE_ARTIFACT);
  if (!pathExists(evidencePath)) {
    return undefined;
  }
  return readJsonFile<ObservedPathProofEvidenceArtifact>(evidencePath);
}

function entryCountsAsFreshObservedProof(
  entry: ObservedPathProofEvidenceEntry,
  matrixGeneratedAt: string | undefined,
): boolean {
  const dispositionObserved =
    entry.disposition === 'observed_pass' || entry.disposition === 'observed_fail';
  const observedAt = entry.observedEvidenceLink?.observedAt ?? entry.freshness?.observedAt ?? null;
  const observedAtMs = parseTimestamp(observedAt);
  const matrixGeneratedAtMs = parseTimestamp(matrixGeneratedAt);

  return (
    entry.observed === true &&
    entry.coverageCountsAsObserved === true &&
    entry.evidenceState === 'observed' &&
    dispositionObserved &&
    entry.freshness?.status === 'fresh' &&
    observedAtMs !== null &&
    (matrixGeneratedAtMs === null || observedAtMs >= matrixGeneratedAtMs)
  );
}
