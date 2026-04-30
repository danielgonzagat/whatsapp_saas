import type { PulseExecutionMatrix, PulseExecutionMatrixPath } from './types';
import type {
  PathCoverageArtifactLink,
  PathCoverageEntry,
  PathCoverageExpectedEvidence,
  PathCoverageState,
} from './types.path-coverage-engine';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from './safe-fs';
import { safeJoin } from './safe-path';

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

const PROTECTED_GOVERNANCE_PATTERNS = [
  /\.github/i,
  /(^|\/)ops\//i,
  /(^|\/)scripts\/ops\//i,
  /(^|\/)AGENTS\.md$/i,
  /(^|\/)CLAUDE\.md$/i,
  /(^|\/)CODEX\.md$/i,
];

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

function isTerminalProofCandidate(path: PulseExecutionMatrixPath): boolean {
  return isCriticalMatrixPath(path) && !isObserved(path) && hasPreciseTerminalReason(path);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function pathText(path: PulseExecutionMatrixPath): string {
  return unique([
    path.pathId,
    path.entrypoint.description,
    path.entrypoint.filePath ?? '',
    path.entrypoint.routePattern ?? '',
    ...path.filePaths,
    ...path.routePatterns,
  ])
    .join(' ')
    .toLowerCase();
}

function touchesProtectedGovernance(path: PulseExecutionMatrixPath): boolean {
  return unique([
    path.entrypoint.filePath ?? '',
    path.breakpoint?.filePath ?? '',
    ...path.filePaths,
  ]).some((filePath) => PROTECTED_GOVERNANCE_PATTERNS.some((pattern) => pattern.test(filePath)));
}

function classifyTaskMode(path: PulseExecutionMatrixPath): PathProofTaskMode {
  if (path.status === 'not_executable') {
    return 'not_executable';
  }
  if (
    path.status === 'blocked_human_required' ||
    path.executionMode === 'human_required' ||
    path.executionMode === 'observation_only' ||
    touchesProtectedGovernance(path)
  ) {
    return 'human_required';
  }

  const text = pathText(path);
  if (/\b(webhook|callback|signature|x-hub|x-signature)\b/.test(text)) {
    return 'webhook';
  }
  if (path.routePatterns.length > 0 || Boolean(path.entrypoint.routePattern)) {
    return 'endpoint';
  }
  if (/\b(worker|processor|queue|bullmq|job)\b/.test(text)) {
    return 'worker';
  }
  if (/\bfrontend\/|\.tsx\b|\.jsx\b|\/app\/|\/pages\//.test(text)) {
    return 'ui';
  }
  return 'function';
}

function taskIdFor(path: PulseExecutionMatrixPath, mode: PathProofTaskMode): string {
  const normalizedPathId = path.pathId.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return `path-proof:${mode}:${normalizedPathId}`;
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
    'Terminal critical path still needs observed pass/fail proof.'
  );
}

function buildPathProofTask(
  path: PulseExecutionMatrixPath,
  coverageEntry: PathCoverageEntry | undefined,
): PathProofTask {
  const mode = classifyTaskMode(path);
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

export function buildPathProofPlan(
  rootDir: string,
  input: BuildPathProofPlanInput = {},
): PathProofPlan {
  const matrix = input.matrix ?? readMatrix(rootDir);
  const pathCoverage = input.pathCoverage ?? readPathCoverage(rootDir);
  const coverageByPathId = new Map<string, PathCoverageEntry>();

  for (const entry of pathCoverage?.paths ?? []) {
    coverageByPathId.set(entry.pathId, entry);
  }

  const tasks = matrix.paths
    .filter(isTerminalProofCandidate)
    .sort((left, right) => left.pathId.localeCompare(right.pathId))
    .map((path) => buildPathProofTask(path, coverageByPathId.get(path.pathId)));

  const plan: PathProofPlan = {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    summary: {
      terminalWithoutObservedEvidence: tasks.length,
      plannedTasks: tasks.length,
      executableTasks: tasks.filter((task) => task.autonomousExecutionAllowed).length,
      humanRequiredTasks: tasks.filter((task) => task.mode === 'human_required').length,
      notExecutableTasks: tasks.filter((task) => task.mode === 'not_executable').length,
    },
    tasks,
  };

  if (input.writeArtifact ?? true) {
    const outputPath = safeJoin(rootDir, OUTPUT_ARTIFACT);
    ensureDir(safeJoin(rootDir, '.pulse', 'current'), { recursive: true });
    writeTextFile(outputPath, JSON.stringify(plan, null, 2));
  }

  return plan;
}
