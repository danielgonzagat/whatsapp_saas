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

// ── Moved from path-proof-evidence.ts ────────────────────────────────────

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
