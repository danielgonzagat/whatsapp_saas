/** Build pulse autonomy state seed. */
export function buildPulseAutonomyStateSeed(
  input: PulseAutonomyArtifactSeedInput,
): PulseAutonomyState {
  const { directive } = input;
  const previousState = input.previousState as LegacyPulseAutonomyState | null | undefined;
  const blockedUnits = directive.blockedUnits || [];
  const history = buildSeedHistory(previousState);
  const riskProfile = input.riskProfile || previousState?.riskProfile || 'balanced';
  const rootDir = input.rootDir ?? process.cwd();
  const nextActionableUnit = toUnitSnapshot(
    getMemoryAwarePreferredAutomationSafeUnits(
      rootDir,
      directive,
      riskProfile,
      previousState,
      input.plannerMode || previousState?.plannerMode || 'deterministic',
    )[0] || null,
  );
  const canWorkNow = Boolean(nextActionableUnit) && directive.autonomyReadiness?.verdict !== 'NAO';
  const certified = directive.currentState?.certificationStatus === 'CERTIFIED';

  return {
    generatedAt: new Date().toISOString(),
    status: canWorkNow ? 'idle' : certified ? 'completed' : 'blocked',
    orchestrationMode: input.orchestrationMode || previousState?.orchestrationMode || 'single',
    riskProfile,
    plannerMode: input.plannerMode || previousState?.plannerMode || 'deterministic',
    continuous: previousState?.continuous || false,
    maxIterations: previousState?.maxIterations || DEFAULT_MAX_ITERATIONS,
    completedIterations: previousState?.completedIterations || history.length,
    parallelAgents:
      input.parallelAgents || previousState?.parallelAgents || DEFAULT_PARALLEL_AGENTS,
    maxWorkerRetries:
      input.maxWorkerRetries || previousState?.maxWorkerRetries || DEFAULT_MAX_WORKER_RETRIES,
    plannerModel: input.plannerModel ?? previousState?.plannerModel ?? null,
    codexModel: input.codexModel ?? previousState?.codexModel ?? null,
    guidanceGeneratedAt: directive.generatedAt || previousState?.guidanceGeneratedAt || null,
    currentCheckpoint: directive.currentCheckpoint || previousState?.currentCheckpoint || null,
    targetCheckpoint: directive.targetCheckpoint || previousState?.targetCheckpoint || null,
    visionGap: directive.visionGap || previousState?.visionGap || null,
    stopReason: canWorkNow
      ? null
      : normalizeAutonomyStopReason(
          directive.autonomyReadiness?.blockers?.join(' ') || previousState?.stopReason || null,
        ),
    nextActionableUnit,
    governedSandboxUnits: countGovernedSandboxUnits(blockedUnits, previousState),
    escalatedValidationUnits: countBlockedUnitsByMode(blockedUnits, 'escalated_validation'),
    observationOnlyUnits: countObservationOnlyUnits(blockedUnits),
    runner: {
      agentsSdkAvailable: previousState?.runner?.agentsSdkAvailable ?? true,
      agentsSdkVersion: previousState?.runner?.agentsSdkVersion ?? null,
      openAiApiKeyConfigured:
        previousState?.runner?.openAiApiKeyConfigured ?? Boolean(process.env.OPENAI_API_KEY),
      codexCliAvailable: previousState?.runner?.codexCliAvailable ?? false,
    },
    history,
  };
}

