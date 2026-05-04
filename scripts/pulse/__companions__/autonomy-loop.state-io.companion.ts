function buildAgentOrchestrationSeedHistory(
  previousState?: PulseAgentOrchestrationState | null,
): PulseAgentOrchestrationBatchRecord[] {
  return previousState?.history?.slice(-20) || [];
}

/** Build pulse agent orchestration state seed. */
export function buildPulseAgentOrchestrationStateSeed(
  input: PulseAgentOrchestrationArtifactSeedInput,
): PulseAgentOrchestrationState {
  const { directive, previousState } = input;
  const history = buildAgentOrchestrationSeedHistory(previousState);
  const riskProfile = input.riskProfile || previousState?.riskProfile || 'balanced';
  const preferredUnits = selectMemoryAwareParallelUnits(
    input.rootDir ?? process.cwd(),
    directive,
    input.parallelAgents || previousState?.parallelAgents || DEFAULT_PARALLEL_AGENTS,
    riskProfile,
    null,
    input.plannerMode || previousState?.plannerMode || 'deterministic',
  );
  const nextBatchUnits = preferredUnits
    .map((unit) => toUnitSnapshot(unit))
    .filter((unit): unit is PulseAutonomyUnitSnapshot => Boolean(unit));
  const canWorkNow = nextBatchUnits.length > 0 && directive.autonomyReadiness?.verdict !== 'NAO';
  const certified = directive.currentState?.certificationStatus === 'CERTIFIED';

  return {
    generatedAt: new Date().toISOString(),
    status: canWorkNow ? 'idle' : certified ? 'completed' : 'blocked',
    strategy: 'capability_flow_locking',
    riskProfile,
    plannerMode: input.plannerMode || previousState?.plannerMode || 'deterministic',
    continuous: previousState?.continuous || false,
    maxIterations: previousState?.maxIterations || DEFAULT_MAX_ITERATIONS,
    completedIterations: previousState?.completedIterations || history.length,
    parallelAgents:
      input.parallelAgents || previousState?.parallelAgents || DEFAULT_PARALLEL_AGENTS,
    maxWorkerRetries:
      input.maxWorkerRetries || previousState?.maxWorkerRetries || DEFAULT_MAX_WORKER_RETRIES,
    guidanceGeneratedAt: directive.generatedAt || previousState?.guidanceGeneratedAt || null,
    currentCheckpoint: directive.currentCheckpoint || previousState?.currentCheckpoint || null,
    targetCheckpoint: directive.targetCheckpoint || previousState?.targetCheckpoint || null,
    visionGap: directive.visionGap || previousState?.visionGap || null,
    stopReason: canWorkNow
      ? null
      : normalizeAutonomyStopReason(
          directive.autonomyReadiness?.blockers?.join(' ') || previousState?.stopReason || null,
        ),
    nextBatchUnits,
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

export function writePulseAutonomyState(rootDir: string, state: PulseAutonomyState): void {
  writeAtomicArtifact(getAutonomyArtifactPath(rootDir), rootDir, JSON.stringify(state, null, 2));
  const memoryState = buildPulseAutonomyMemoryState({
    autonomyState: state,
    orchestrationState: loadPulseAgentOrchestrationState(rootDir),
  });
  writeAtomicArtifact(
    getAutonomyMemoryArtifactPath(rootDir),
    rootDir,
    JSON.stringify(memoryState, null, 2),
  );
}

export function loadPulseAutonomyState(rootDir: string): PulseAutonomyState | null {
  return readOptionalArtifact<PulseAutonomyState>(getAutonomyArtifactPath(rootDir));
}

export function writePulseAgentOrchestrationState(
  rootDir: string,
  state: PulseAgentOrchestrationState,
): void {
  writeAtomicArtifact(
    getAgentOrchestrationArtifactPath(rootDir),
    rootDir,
    JSON.stringify(state, null, 2),
  );
  const memoryState = buildPulseAutonomyMemoryState({
    autonomyState: loadPulseAutonomyState(rootDir),
    orchestrationState: state,
  });
  writeAtomicArtifact(
    getAutonomyMemoryArtifactPath(rootDir),
    rootDir,
    JSON.stringify(memoryState, null, 2),
  );
}

export function loadPulseAgentOrchestrationState(
  rootDir: string,
): PulseAgentOrchestrationState | null {
  return readOptionalArtifact<PulseAgentOrchestrationState>(
    getAgentOrchestrationArtifactPath(rootDir),
  );
}

export function appendHistory(
  state: PulseAutonomyState,
  iteration: PulseAutonomyIterationRecord,
): PulseAutonomyState {
  return {
    ...state,
    history: [...state.history, iteration].slice(-20),
    completedIterations: state.completedIterations + 1,
  };
}

export function appendOrchestrationHistory(
  state: PulseAgentOrchestrationState,
  batch: PulseAgentOrchestrationBatchRecord,
): PulseAgentOrchestrationState {
  return {
    ...state,
    history: [...state.history, batch].slice(-20),
    completedIterations: state.completedIterations + 1,
  };
}

// ── Moved from autonomy-loop.state-io.ts ─────────────────────────────────

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
