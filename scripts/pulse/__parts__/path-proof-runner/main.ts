import type { PulseExecutionMatrix, PulseExecutionMatrixPath } from '../../types';
import type {
  PathCoverageEntry,
  PathCoverageExpectedEvidence,
  PathCoverageState,
} from '../../types.path-coverage-engine';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import { isTerminalProofCandidate, buildPathProofTask } from './task-builders';
import { loadGovernanceBoundary } from '../../scope-state-classify';

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

function observedProofPathIdsFor(
  evidence: ObservedPathProofEvidenceArtifact | undefined,
  matrixGeneratedAt: string | undefined,
): Set<string> {
  const pathIds = new Set<string>();
  for (const entry of evidence?.tasks ?? []) {
    if (entryCountsAsFreshObservedProof(entry, matrixGeneratedAt)) {
      pathIds.add(entry.pathId);
    }
  }
  return pathIds;
}

export function buildPathProofPlan(
  rootDir: string,
  input: BuildPathProofPlanInput = {},
): PathProofPlan {
  const matrix = input.matrix ?? readMatrix(rootDir);
  const pathCoverage = input.pathCoverage ?? readPathCoverage(rootDir);
  const observedProofPathIds = observedProofPathIdsFor(
    readPathProofEvidence(rootDir),
    matrix.generatedAt,
  );
  const governanceBoundary = loadGovernanceBoundary(rootDir);
  const coverageByPathId = new Map<string, PathCoverageEntry>();

  for (const entry of pathCoverage?.paths ?? []) {
    coverageByPathId.set(entry.pathId, entry);
  }

  const tasks = matrix.paths
    .filter((path) => isTerminalProofCandidate(path, governanceBoundary, observedProofPathIds))
    .sort((left, right) => left.pathId.localeCompare(right.pathId))
    .map((path) => buildPathProofTask(path, coverageByPathId.get(path.pathId), governanceBoundary));

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
