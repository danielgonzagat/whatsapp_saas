export function buildProofSynthesisState(
  rootDir: string,
  inputOverride?: ProofSynthesisInput[],
): ProofSynthesisState {
  const inputs = inputOverride ?? [
    ...readBehaviorNodes(rootDir).map(fromBehaviorNode),
    ...readMatrixPaths(rootDir).map(fromMatrixPath),
    ...readCoverageEntries(rootDir).map(fromCoverageEntry),
  ];

  const targets = dedupeTargets(inputs.map(synthesizeProofPlans));
  const totalPlans = targets.reduce((sum, target) => sum + target.plans.length, 0);

  const state: ProofSynthesisState = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalTargets: targets.length,
      totalPlans,
      plannedPlans: totalPlans,
      observedPlans: 0,
      targetsWithoutPlan: targets.filter((target) => target.plans.length === 0).length,
    },
    targets,
  };

  const outputDir = safeJoin(rootDir, '.pulse', 'current');
  ensureDir(outputDir, { recursive: true });
  writeTextFile(safeJoin(outputDir, ARTIFACT_FILENAME), JSON.stringify(state, null, 2));

  return state;
}
