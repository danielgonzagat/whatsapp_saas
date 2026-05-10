import { ensureDir, pathExists, readJsonFile, writeTextFile } from '../safe-fs';
import { safeJoin } from '../safe-path';
import type { PathProofExecutionResult } from '../path-proof-execution-runner/main';
import type { PathProofPlan } from '../path-proof-runner/main';
import { buildEvidenceEntry, summarize } from './evidence-builder';
import type {
  PathProofRunnerResult,
  PathProofRunnerResultStatus,
  PathProofObservedEvidenceLink,
  PathProofEvidenceDisposition,
  PathProofEvidenceState,
  PathProofEvidenceFreshness,
  PathProofEvidenceEntry,
  PathProofEvidenceArtifact,
  BuildPathProofEvidenceInput,
} from './types';
import { PATH_PROOF_TASKS_ARTIFACT, PATH_PROOF_EVIDENCE_ARTIFACT } from './types';
export { PATH_PROOF_TASKS_ARTIFACT, PATH_PROOF_EVIDENCE_ARTIFACT };
export type {
  PathProofRunnerResult,
  PathProofRunnerResultStatus,
  PathProofObservedEvidenceLink,
  PathProofEvidenceDisposition,
  PathProofEvidenceState,
  PathProofEvidenceFreshness,
  PathProofEvidenceEntry,
  PathProofEvidenceArtifact,
  BuildPathProofEvidenceInput,
};

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
    ...(result.startedAt !== undefined ? { startedAt: result.startedAt } : {}),
    ...(result.finishedAt !== undefined ? { finishedAt: result.finishedAt } : {}),
    ...(typeof result.durationMs === 'number' ? { durationMs: result.durationMs } : {}),
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
