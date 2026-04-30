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

