import { ensureDir, pathExists, readJsonFile, writeTextFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import type { PathProofExecutionResult } from '../../path-proof-execution-runner';
import type { PathProofPlan, PathProofTask } from '../../path-proof-runner';
import {
  resultByTaskId as _resultByTaskId,
  buildEvidenceEntry,
  summarize,
} from './evidence-builder';

export const PATH_PROOF_TASKS_ARTIFACT = '.pulse/current/PULSE_PATH_PROOF_TASKS.json';
export const PATH_PROOF_EVIDENCE_ARTIFACT = '.pulse/current/PULSE_PATH_PROOF_EVIDENCE.json';

export type PathProofRunnerResultStatus =
  | 'pass'
  | 'fail'
  | 'passed'
  | 'failed'
  | 'planned_only'
  | 'skipped'
  | 'stale'
  | 'not_run'
  | 'error';

export interface PathProofRunnerResult {
  taskId: string;
  pathId?: string;
  command: string;
  status: PathProofRunnerResultStatus;
  executed: boolean;
  plannedOnly?: boolean;
  skipped?: boolean;
  stale?: boolean;
  exitCode?: number;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  artifactPath?: string;
  summary?: string;
}

export interface PathProofObservedEvidenceLink {
  artifactPath: string;
  relationship: 'observed_evidence';
  command: string;
  status: 'observed_pass' | 'observed_fail';
  exitCode?: number;
  startedAt?: string;
  finishedAt?: string;
  observedAt: string;
  summary: string;
}

export type PathProofEvidenceDisposition =
  | 'observed_pass'
  | 'observed_fail'
  | 'not_run'
  | 'planned_only'
  | 'skipped'
  | 'stale'
  | 'missing_result'
  | 'not_observed';

export type PathProofEvidenceState = 'observed' | 'not_run';

export interface PathProofEvidenceFreshness {
  status: 'fresh' | 'stale' | 'not_run';
  generatedAt: string;
  observedAt: string | null;
  ageMs: number | null;
  reason: string;
}

export interface PathProofEvidenceEntry {
  taskId: string;
  pathId: string;
  capabilityId: string | null;
  flowId: string | null;
  mode: PathProofTask['mode'];
  taskStatus: PathProofTask['status'];
  taskExecuted: false;
  taskCoverageCountsAsObserved: false;
  autonomousExecutionAllowed: boolean;
  command: string;
  expectedEvidence: PathProofTask['expectedEvidence'];
  disposition: PathProofEvidenceDisposition;
  evidenceState: PathProofEvidenceState;
  observed: boolean;
  coverageCountsAsObserved: boolean;
  freshness: PathProofEvidenceFreshness;
  reason: string;
  result: PathProofRunnerResult | null;
  observedEvidenceLink: PathProofObservedEvidenceLink | null;
}

export interface PathProofEvidenceArtifact {
  artifact: 'PULSE_PATH_PROOF_EVIDENCE';
  artifactVersion: 1;
  generatedAt: string;
  sourceArtifacts: {
    tasks: typeof PATH_PROOF_TASKS_ARTIFACT;
    self: typeof PATH_PROOF_EVIDENCE_ARTIFACT;
  };
  summary: {
    totalTasks: number;
    runnerResults: number;
    observedEvidenceLinks: number;
    observedPass: number;
    observedFail: number;
    notRun: number;
    plannedOnly: number;
    skipped: number;
    stale: number;
    missingResult: number;
    notObserved: number;
    commandlessResults: number;
    executableTasks: number;
    humanRequiredTasks: number;
    notExecutableTasks: number;
  };
  tasks: PathProofEvidenceEntry[];
}

export interface BuildPathProofEvidenceInput {
  plan?: PathProofPlan;
  runnerResults?: PathProofRunnerResult[];
  generatedAt?: string;
  writeArtifact?: boolean;
}

function runnerStatusForExecutionResult(
  status: PathProofExecutionResult['status'],
): PathProofRunnerResultStatus {
  switch (status) {
    case 'observed_pass':
      return 'passed';
    case 'observed_fail':
      return 'failed';
    case 'execution_skipped':
      return 'skipped';
    case 'planned_only':
      return 'planned_only';
  }
}

export function pathProofExecutionResultToRunnerResult(
  result: PathProofExecutionResult,
): PathProofRunnerResult {
  return {
    taskId: result.taskId,
    pathId: result.pathId,
    command: result.command,
    status: runnerStatusForExecutionResult(result.status),
    executed: result.executed,
    plannedOnly: result.status === 'planned_only',
    skipped: result.status === 'execution_skipped',
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    durationMs: result.durationMs,
    summary: result.reason,
    ...(typeof result.exitCode === 'number' ? { exitCode: result.exitCode } : {}),
  };
}

export function pathProofExecutionResultsToRunnerResults(
  results: readonly PathProofExecutionResult[],
): PathProofRunnerResult[] {
  return results.map(pathProofExecutionResultToRunnerResult);
}

function resultByTaskId(results: PathProofRunnerResult[]): Map<string, PathProofRunnerResult> {
  const entries = new Map<string, PathProofRunnerResult>();
  for (const result of results) {
    entries.set(result.taskId, result);
  }
  return entries;
}

export function mergePathProofRunnerResults(
  plan: PathProofPlan,
  runnerResults: PathProofRunnerResult[] = [],
  generatedAt: string = new Date().toISOString(),
): PathProofEvidenceArtifact {
  const resultsByTaskId = resultByTaskId(runnerResults);
  const tasks = plan.tasks.map((task) =>
    buildEvidenceEntry(task, resultsByTaskId.get(task.taskId), generatedAt),
  );

  return {
    artifact: 'PULSE_PATH_PROOF_EVIDENCE',
    artifactVersion: 1,
    generatedAt,
    sourceArtifacts: {
      tasks: PATH_PROOF_TASKS_ARTIFACT,
      self: PATH_PROOF_EVIDENCE_ARTIFACT,
    },
    summary: summarize(plan, runnerResults, tasks),
    tasks,
  };
}

function readPathProofPlan(rootDir: string): PathProofPlan {
  return readJsonFile<PathProofPlan>(safeJoin(rootDir, PATH_PROOF_TASKS_ARTIFACT));
}

export function buildPathProofEvidenceArtifact(
  rootDir: string,
  input: BuildPathProofEvidenceInput = {},
): PathProofEvidenceArtifact {
  const plan = input.plan ?? readPathProofPlan(rootDir);
  const artifact = mergePathProofRunnerResults(
    plan,
    input.runnerResults ?? [],
    input.generatedAt ?? new Date().toISOString(),
  );

  if (input.writeArtifact ?? true) {
    const outputPath = safeJoin(rootDir, PATH_PROOF_EVIDENCE_ARTIFACT);
    ensureDir(safeJoin(rootDir, '.pulse', 'current'), { recursive: true });
    writeTextFile(outputPath, JSON.stringify(artifact, null, 2));
  }

  return artifact;
}

export function pathProofEvidenceArtifactExists(rootDir: string): boolean {
  return pathExists(safeJoin(rootDir, PATH_PROOF_EVIDENCE_ARTIFACT));
}
