import type {
  PathProofRunnerResult,
  PathProofEvidenceDisposition,
  PathProofEvidenceFreshness,
  PathProofObservedEvidenceLink,
  PathProofEvidenceEntry,
} from '../../path-proof-evidence';
import type { PathProofTask } from '../../path-proof-runner';

const PATH_PROOF_EVIDENCE_ARTIFACT = '.pulse/current/PULSE_PATH_PROOF_EVIDENCE.json';

function isPassFailStatus(status: PathProofRunnerResult['status']): boolean {
  return status === 'pass' || status === 'passed' || status === 'fail' || status === 'failed';
}

function observedStatus(
  status: PathProofRunnerResult['status'],
): 'observed_pass' | 'observed_fail' {
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

export function dispositionFor(
  result: PathProofRunnerResult | undefined,
): PathProofEvidenceDisposition {
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

export function reasonFor(
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

export function observedLinkFor(
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

export function buildFreshness(
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

export function buildEvidenceEntry(
  task: PathProofTask,
  result: PathProofRunnerResult | undefined,
  generatedAt: string,
): PathProofEvidenceEntry {
  const disposition = dispositionFor(result);
  const observedEvidenceLink = result ? observedLinkFor(result, disposition) : null;
  const evidenceState: PathProofEvidenceEntry['evidenceState'] =
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

export function summarize(
  plan: import('../../path-proof-runner').PathProofPlan,
  runnerResults: PathProofRunnerResult[],
  tasks: PathProofEvidenceEntry[],
): import('../../path-proof-evidence').PathProofEvidenceArtifact['summary'] {
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
