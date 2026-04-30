export function buildAutonomyCycleProof(
  previousAutonomyState: PulseAutonomyState | null,
): CycleProof {
  const history = previousAutonomyState?.history || [];
  const realExecutedCycles = history.filter((entry) => entry.codex.executed);
  const runtimeTouchingCycles = realExecutedCycles.filter(hasRuntimeTouchingValidationEvidence);
  const executionMatrixComparisons = realExecutedCycles.map((entry) =>
    evaluateCycleExecutionMatrixNonRegression(entry),
  );
  const successfulCycles = realExecutedCycles.filter((entry) => {
    const codexPassed = entry.codex.exitCode === 0;
    const validationPassed =
      entry.validation.executed &&
      entry.validation.commands.length > 0 &&
      entry.validation.commands.every((command) => command.exitCode === 0);
    const beforeScore =
      typeof entry.directiveBefore.score === 'number' ? entry.directiveBefore.score : null;
    const afterScore =
      typeof entry.directiveAfter?.score === 'number' ? entry.directiveAfter.score : null;
    const scoreNonRegressing =
      beforeScore === null || afterScore === null || afterScore >= beforeScore;
    const beforeTier =
      typeof entry.directiveBefore.blockingTier === 'number'
        ? entry.directiveBefore.blockingTier
        : null;
    const afterTier =
      typeof entry.directiveAfter?.blockingTier === 'number'
        ? entry.directiveAfter.blockingTier
        : null;
    const tierNonRegressing = beforeTier === null || afterTier === null || afterTier <= beforeTier;
    const matrix = evaluateCycleExecutionMatrixNonRegression(entry);
    const runtimeTouched = hasRuntimeTouchingValidationEvidence(entry);
    return (
      codexPassed &&
      validationPassed &&
      runtimeTouched &&
      scoreNonRegressing &&
      tierNonRegressing &&
      matrix.nonRegressing
    );
  });

  return {
    requiredCycles: REQUIRED_NON_REGRESSING_CYCLES,
    totalRecordedCycles: history.length,
    realExecutedCycles: realExecutedCycles.length,
    successfulNonRegressingCycles: successfulCycles.length,
    runtimeTouchingCycles: runtimeTouchingCycles.length,
    executionMatrixComparedCycles: executionMatrixComparisons.filter((result) => result.compared)
      .length,
    executionMatrixRegressedCycles: executionMatrixComparisons.filter(
      (result) => !result.nonRegressing,
    ).length,
    proven: successfulCycles.length >= REQUIRED_NON_REGRESSING_CYCLES,
  };
}

