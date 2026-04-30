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

