import { ensureDir, pathExists, readJsonFile, writeTextFile } from './safe-fs';
import { safeJoin } from './safe-path';
import type { PathProofExecutionResult } from './path-proof-execution-runner';
import type { PathProofPlan, PathProofTask } from './path-proof-runner';

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

function isPassFailStatus(status: PathProofRunnerResultStatus): boolean {
  return status === 'pass' || status === 'passed' || status === 'fail' || status === 'failed';
}

function observedStatus(status: PathProofRunnerResultStatus): 'observed_pass' | 'observed_fail' {
  return status === 'fail' || status === 'failed' ? 'observed_fail' : 'observed_pass';
}

function resultIsPlannedOnly(result: PathProofRunnerResult): boolean {
  return result.plannedOnly === true || result.status === 'planned_only';
}

function resultIsSkipped(result: PathProofRunnerResult): boolean {
  return result.skipped === true || result.status === 'skipped';
}

function resultIsNotRun(result: PathProofRunnerResult): boolean {
  return result.status === 'not_run';
}

function resultIsStale(result: PathProofRunnerResult): boolean {
  return result.stale === true || result.status === 'stale';
}

function resultHasCommandProof(result: PathProofRunnerResult): boolean {
  return result.command.trim().length > 0;
}

function parseTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resultHasExecutionWindow(result: PathProofRunnerResult): boolean {
  const startedAt = parseTimestamp(result.startedAt);
  const finishedAt = parseTimestamp(result.finishedAt);
  return startedAt !== null && finishedAt !== null && finishedAt >= startedAt;
}

export function resultCountsAsObservedPathProof(result: PathProofRunnerResult): boolean {
  return (
    result.executed === true &&
    !resultIsPlannedOnly(result) &&
    !resultIsSkipped(result) &&
    !resultIsStale(result) &&
    resultHasCommandProof(result) &&
    resultHasExecutionWindow(result) &&
    isPassFailStatus(result.status)
  );
}

function resultByTaskId(results: PathProofRunnerResult[]): Map<string, PathProofRunnerResult> {
  const entries = new Map<string, PathProofRunnerResult>();
  for (const result of results) {
    entries.set(result.taskId, result);
  }
  return entries;
}

function dispositionFor(result: PathProofRunnerResult | undefined): PathProofEvidenceDisposition {
  if (!result) {
    return 'missing_result';
  }
  if (resultCountsAsObservedPathProof(result)) {
    return observedStatus(result.status);
  }
  if (resultIsStale(result)) {
    return 'stale';
  }
  if (resultIsSkipped(result)) {
    return 'skipped';
  }
  if (resultIsNotRun(result)) {
    return 'not_run';
  }
  if (resultIsPlannedOnly(result) || result.executed === false) {
    return 'planned_only';
  }
  return 'not_observed';
}

function reasonFor(
  task: PathProofTask,
  result: PathProofRunnerResult | undefined,
  disposition: PathProofEvidenceDisposition,
): string {
  if (!result) {
    return 'No runner result was merged for this planned proof task.';
  }
  if (disposition === 'observed_pass' || disposition === 'observed_fail') {
    return 'Executed command produced terminal pass/fail proof.';
  }
  if (disposition === 'stale') {
    return 'Runner result is stale and cannot satisfy current path proof.';
  }
  if (disposition === 'skipped') {
    return 'Runner result was skipped or not run and cannot count as observed.';
  }
  if (disposition === 'not_run') {
    return 'Runner result explicitly reports not_run and cannot count as observed.';
  }
  if (disposition === 'planned_only') {
    return 'Runner result is planned-only or unexecuted and remains blueprint evidence.';
  }
  if (!resultHasExecutionWindow(result)) {
    return 'Runner result lacks a valid startedAt/finishedAt execution window.';
  }
  if (!resultHasCommandProof(result)) {
    return 'Runner result lacks command proof and cannot count as observed.';
  }
  if (!isPassFailStatus(result.status)) {
    return `Runner status ${result.status} is not a terminal pass/fail command result.`;
  }
  return task.reason;
}

function observedLinkFor(
  result: PathProofRunnerResult,
  disposition: PathProofEvidenceDisposition,
): PathProofObservedEvidenceLink | null {
  if (disposition !== 'observed_pass' && disposition !== 'observed_fail') {
    return null;
  }

  return {
    artifactPath: result.artifactPath ?? PATH_PROOF_EVIDENCE_ARTIFACT,
    relationship: 'observed_evidence',
    command: result.command,
    status: disposition,
    exitCode: result.exitCode,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    observedAt: result.finishedAt ?? result.startedAt ?? new Date().toISOString(),
    summary:
      result.summary ?? `Observed ${disposition.replace('observed_', '')} for ${result.taskId}.`,
  };
}

function buildFreshness(
  result: PathProofRunnerResult | undefined,
  disposition: PathProofEvidenceDisposition,
  generatedAt: string,
): PathProofEvidenceFreshness {
  if (disposition !== 'observed_pass' && disposition !== 'observed_fail') {
    return {
      status: disposition === 'stale' ? 'stale' : 'not_run',
      generatedAt,
      observedAt: null,
      ageMs: null,
      reason:
        disposition === 'stale'
          ? 'Runner result is marked stale.'
          : 'No observed execution window is attached to this task.',
    };
  }

  const observedAt = result?.finishedAt ?? null;
  const observedAtMs = parseTimestamp(observedAt ?? undefined);
  const generatedAtMs = parseTimestamp(generatedAt);

  return {
    status: 'fresh',
    generatedAt,
    observedAt,
    ageMs:
      observedAtMs !== null && generatedAtMs !== null
        ? Math.max(0, generatedAtMs - observedAtMs)
        : null,
    reason: 'Observed command proof has a valid execution window for this artifact run.',
  };
}

function buildEvidenceEntry(
  task: PathProofTask,
  result: PathProofRunnerResult | undefined,
  generatedAt: string,
): PathProofEvidenceEntry {
  const disposition = dispositionFor(result);
  const observedEvidenceLink = result ? observedLinkFor(result, disposition) : null;
  const evidenceState: PathProofEvidenceState =
    observedEvidenceLink !== null ? 'observed' : 'not_run';

  return {
    taskId: task.taskId,
    pathId: task.pathId,
    capabilityId: task.capabilityId,
    flowId: task.flowId,
    mode: task.mode,
    taskStatus: task.status,
    taskExecuted: task.executed,
    taskCoverageCountsAsObserved: task.coverageCountsAsObserved,
    autonomousExecutionAllowed: task.autonomousExecutionAllowed,
    command: task.command,
    expectedEvidence: task.expectedEvidence,
    disposition,
    evidenceState,
    observed: observedEvidenceLink !== null,
    coverageCountsAsObserved: observedEvidenceLink !== null,
    freshness: buildFreshness(result, disposition, generatedAt),
    reason: reasonFor(task, result, disposition),
    result: result ?? null,
    observedEvidenceLink,
  };
}

function summarize(
  plan: PathProofPlan,
  runnerResults: PathProofRunnerResult[],
  tasks: PathProofEvidenceEntry[],
): PathProofEvidenceArtifact['summary'] {
  return {
    totalTasks: tasks.length,
    runnerResults: runnerResults.length,
    observedEvidenceLinks: tasks.filter((task) => task.observedEvidenceLink !== null).length,
    observedPass: tasks.filter((task) => task.disposition === 'observed_pass').length,
    observedFail: tasks.filter((task) => task.disposition === 'observed_fail').length,
    notRun: tasks.filter((task) => task.evidenceState === 'not_run').length,
    plannedOnly: tasks.filter((task) => task.disposition === 'planned_only').length,
    skipped: tasks.filter((task) => task.disposition === 'skipped').length,
    stale: tasks.filter((task) => task.disposition === 'stale').length,
    missingResult: tasks.filter((task) => task.disposition === 'missing_result').length,
    notObserved: tasks.filter((task) => !task.observed).length,
    commandlessResults: runnerResults.filter((result) => !resultHasCommandProof(result)).length,
    executableTasks: plan.summary.executableTasks,
    humanRequiredTasks: plan.summary.humanRequiredTasks,
    notExecutableTasks: plan.summary.notExecutableTasks,
  };
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
