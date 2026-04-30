export async function runParallelAutonomousLoop(
  rootDir: string,
  options: PulseAutonomyRunOptions,
  plannerMode: 'agents_sdk' | 'deterministic',
  codexCliAvailable: boolean,
  agentsSdkVersion: string | null,
): Promise<PulseAutonomyState> {
  const rollbackGuard = detectRollbackGuard(rootDir);
  const previousState = loadPulseAutonomyState(rootDir);
  const previousOrchestrationState = loadPulseAgentOrchestrationState(rootDir);
  const initialDirective = runPulseGuidance(rootDir);
  const runnerInfo = {
    agentsSdkAvailable: Boolean(agentsSdkVersion),
    agentsSdkVersion,
    openAiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
    codexCliAvailable,
  };
  let state = buildPulseAutonomyStateSeed({
    rootDir,
    directive: initialDirective,
    previousState,
    codexCliAvailable,
    orchestrationMode: 'parallel',
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    riskProfile: options.riskProfile,
    plannerMode,
    plannerModel: options.plannerModel,
    codexModel: options.codexModel,
  });
  state = {
    ...state,
    status: 'running',
    continuous: options.continuous,
    maxIterations: options.maxIterations,
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    orchestrationMode: 'parallel',
    riskProfile: options.riskProfile,
    plannerMode,
    plannerModel: options.plannerModel,
    codexModel: options.codexModel,
    runner: runnerInfo,
    stopReason: null,
  };
  let orchestrationState = buildPulseAgentOrchestrationStateSeed({
    rootDir,
    directive: initialDirective,
    previousState: previousOrchestrationState,
    codexCliAvailable,
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    riskProfile: options.riskProfile,
    plannerMode,
  });
  orchestrationState = {
    ...orchestrationState,
    status: 'running',
    continuous: options.continuous,
    maxIterations: options.maxIterations,
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    riskProfile: options.riskProfile,
    plannerMode,
    runner: runnerInfo,
    stopReason: null,
  };
  writePulseAutonomyState(rootDir, state);
  writePulseAgentOrchestrationState(rootDir, orchestrationState);

  let consecutiveNoImprovement = 0;
  let iterations = 0;

  while (iterations < options.maxIterations) {
    iterations += 1;

    const directiveBefore = runPulseGuidance(rootDir);
    const stopReason = shouldStopForDirective(directiveBefore, options.riskProfile, state);
    if (stopReason) {
      const nextBatchUnits = selectMemoryAwareParallelUnits(
        rootDir,
        directiveBefore,
        options.parallelAgents,
        options.riskProfile,
        state,
        plannerMode,
      );
      const stopUpdates = buildStopEarlyStates(
        state,
        orchestrationState,
        directiveBefore,
        stopReason,
        nextBatchUnits,
        nextBatchUnits[0] || null,
      );
      state = { ...state, ...stopUpdates.state };
      orchestrationState = { ...orchestrationState, ...stopUpdates.orchestrationState };
      writePulseAutonomyState(rootDir, state);
      writePulseAgentOrchestrationState(rootDir, orchestrationState);
      return state;
    }

    const batchUnits = selectMemoryAwareParallelUnits(
      rootDir,
      directiveBefore,
      options.parallelAgents,
      options.riskProfile,
      state,
      plannerMode,
    );
    if (batchUnits.length === 0) {
      const noUnitReason =
        'No conflict-free automation-safe batch could be formed from the directive.';
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        status: 'blocked',
        stopReason: noUnitReason,
      };
      orchestrationState = {
        ...orchestrationState,
        generatedAt: new Date().toISOString(),
        status: 'blocked',
        stopReason: noUnitReason,
      };
      writePulseAutonomyState(rootDir, state);
      writePulseAgentOrchestrationState(rootDir, orchestrationState);
      return state;
    }
    const contextFabricBlocker = getContextFabricBlocker(directiveBefore, batchUnits);
    if (contextFabricBlocker) {
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        status: 'blocked',
        stopReason: contextFabricBlocker,
      };
      orchestrationState = {
        ...orchestrationState,
        generatedAt: new Date().toISOString(),
        status: 'blocked',
        stopReason: contextFabricBlocker,
      };
      writePulseAutonomyState(rootDir, state);
      writePulseAgentOrchestrationState(rootDir, orchestrationState);
      return state;
    }

    const iterationStartedAt = new Date().toISOString();
    const validationCommands = buildBatchValidationCommands(
      directiveBefore,
      batchUnits,
      options.validateCommands,
    );
    const regressionBefore = !options.dryRun ? captureRegressionSnapshot(rootDir) : null;
    let workerResults: PulseAgentOrchestrationWorkerResult[] = [];
    let validationResults: PulseAutonomyValidationCommandResult[] = [];

    if (!options.dryRun) {
      if (!codexCliAvailable) {
        const noCodexReason =
          'codex CLI is not available on PATH for parallel autonomous execution.';
        state = {
          ...state,
          generatedAt: new Date().toISOString(),
          status: 'failed',
          stopReason: noCodexReason,
        };
        orchestrationState = {
          ...orchestrationState,
          generatedAt: new Date().toISOString(),
          status: 'failed',
          stopReason: noCodexReason,
        };
        writePulseAutonomyState(rootDir, state);
        writePulseAgentOrchestrationState(rootDir, orchestrationState);
        return state;
      }

      workerResults = await Promise.all(
        batchUnits.map((unit, index) =>
          runParallelWorkerAssignment(
            rootDir,
            directiveBefore,
            unit,
            index + 1,
            batchUnits.length,
            options.codexModel,
            options.maxWorkerRetries,
          ),
        ),
      );
      validationResults = runValidationCommands(rootDir, validationCommands);
    } else {
      workerResults = buildDryRunWorkerResults(batchUnits, iterationStartedAt);
    }

    if (!options.dryRun) {
      workerResults = workerResults.map((worker) => {
        if (worker.status !== 'completed' || !worker.patchPath) {
          return worker;
        }
        const unit = batchUnits.find((candidate) => candidate.id === worker.unit?.id);
        if (!unit) {
          return {
            ...worker,
            status: 'failed' as const,
            applyStatus: 'failed' as const,
            applySummary: `Worker ${worker.workerId} patch could not be matched to an active lease.`,
            summary: `Worker ${worker.workerId} failed during integration: active lease not found.`,
          };
        }
        const applyResult = applyWorkerPatchToRoot(
          rootDir,
          worker.patchPath,
          worker.workerId,
          unit,
          worker.changedFiles,
        );
        return {
          ...worker,
          status: applyResult.status === 'applied' ? worker.status : ('failed' as const),
          applyStatus: applyResult.status,
          applySummary:
            worker.applySummary && worker.applySummary.length > 0
              ? `${worker.applySummary} ${applyResult.summary}`
              : applyResult.summary,
          summary:
            applyResult.status === 'applied'
              ? `${worker.summary} ${applyResult.summary}`
              : `Worker ${worker.workerId} failed during integration: ${applyResult.summary}`,
        };
      });
    }

    const directiveAfter = runPulseGuidance(rootDir);
    const beforeSnapshot = getDirectiveSnapshot(directiveBefore);
    const afterSnapshot = getDirectiveSnapshot(directiveAfter);
    const nextBatchUnits = selectMemoryAwareParallelUnits(
      rootDir,
      directiveAfter,
      options.parallelAgents,
      options.riskProfile,
      state,
      plannerMode,
    );
    const improved =
      directiveDigest(directiveBefore) !== directiveDigest(directiveAfter) ||
      afterSnapshot.score !== beforeSnapshot.score ||
      afterSnapshot.blockingTier !== beforeSnapshot.blockingTier ||
      batchUnits.some((unit) => !nextBatchUnits.some((candidate) => candidate.id === unit.id));

    consecutiveNoImprovement = improved ? 0 : consecutiveNoImprovement + 1;

    const workerFailure = workerResults.some(
      (worker) =>
        worker.status === 'failed' || (worker.codex.executed && worker.codex.exitCode !== 0),
    );
    const validationFailure = validationResults.some((result) => result.exitCode !== 0);
    const batchChangedFiles = [
      ...new Set(workerResults.flatMap((worker) => worker.changedFiles || [])),
    ];
    const regressionResult =
      !options.dryRun && regressionBefore
        ? detectRegression(regressionBefore, captureRegressionSnapshot(rootDir))
        : null;
    const regressionFailure = Boolean(regressionResult?.regressed);
    const rollbackSummary =
      !options.dryRun && (workerFailure || validationFailure || regressionFailure)
        ? rollbackGuard.enabled
          ? regressionFailure
            ? rollbackRegression(
                rootDir,
                batchChangedFiles,
                `RegressionGuard: ${regressionResult?.reasons.join(' | ')}`,
              ).summary
            : rollbackWorkspaceToHead(rootDir)
          : `Automatic rollback skipped: ${rollbackGuard.reason}`
        : null;
    if (regressionFailure) {
      const regressionSummary = `RegressionGuard: ${regressionResult?.reasons.join(' | ')}`;
      workerResults = workerResults.map((worker) => ({
        ...worker,
        status: worker.status === 'completed' ? ('failed' as const) : worker.status,
        applyStatus: worker.applyStatus === 'applied' ? ('failed' as const) : worker.applyStatus,
        applySummary: worker.applySummary
          ? `${worker.applySummary} ${regressionSummary}`
          : regressionSummary,
        summary: `${worker.summary} ${regressionSummary}`.trim(),
      }));
    }

    const batchRecord = buildBatchRecord(
      orchestrationState,
      batchUnits,
      workerResults,
      validationResults,
      directiveBefore,
      directiveAfter,
      iterationStartedAt,
      improved,
      rollbackSummary,
      options.dryRun,
      options.riskProfile,
      plannerMode,
    );
    orchestrationState = appendOrchestrationHistory(orchestrationState, batchRecord);
    orchestrationState = {
      ...orchestrationState,
      ...buildOrchestrationStateUpdate(
        orchestrationState,
        directiveAfter,
        workerFailure,
        validationFailure || regressionFailure,
        nextBatchUnits,
      ),
    };
    writePulseAgentOrchestrationState(rootDir, orchestrationState);

    const iterationRecord = buildIterationRecord(
      state,
      batchUnits,
      workerResults,
      validationResults,
      directiveBefore,
      directiveAfter,
      iterationStartedAt,
      improved,
      rollbackSummary,
      workerFailure,
      validationFailure || regressionFailure,
      options.dryRun,
      plannerMode,
    );
    state = appendHistory(state, iterationRecord);
    state = {
      ...state,
      ...buildStateUpdate(
        state,
        directiveAfter,
        orchestrationState.status,
        rollbackSummary,
        nextBatchUnits[0] || null,
      ),
    };
    writePulseAutonomyState(rootDir, state);

    if (state.status === 'completed' || state.status === 'failed') return state;

    if (!options.dryRun && consecutiveNoImprovement >= 2) {
      const noConvergeReason =
        'Autonomy loop stopped after repeated parallel batches without material Pulse convergence.';
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        status: 'blocked',
        stopReason: noConvergeReason,
      };
      orchestrationState = {
        ...orchestrationState,
        generatedAt: new Date().toISOString(),
        status: 'blocked',
        stopReason: noConvergeReason,
      };
      writePulseAutonomyState(rootDir, state);
      writePulseAgentOrchestrationState(rootDir, orchestrationState);
      return state;
    }

    if (!options.continuous) {
      if (iterations >= options.maxIterations) {
        const limitReason = `Reached max iterations (${options.maxIterations}) before certification.`;
        const hasNext = Boolean(state.nextActionableUnit);
        state = {
          ...state,
          generatedAt: new Date().toISOString(),
          status: hasNext ? 'idle' : 'blocked',
          stopReason: hasNext ? null : limitReason,
        };
        orchestrationState = {
          ...orchestrationState,
          generatedAt: new Date().toISOString(),
          status: orchestrationState.nextBatchUnits.length > 0 ? 'idle' : state.status,
          stopReason: state.stopReason,
        };
        writePulseAutonomyState(rootDir, state);
        writePulseAgentOrchestrationState(rootDir, orchestrationState);
        return state;
      }
      continue;
    }

    await sleep(options.intervalMs);
  }

  const finalStopReason = state.nextActionableUnit
    ? null
    : `Reached max iterations (${options.maxIterations}) before certification.`;
  state = {
    ...state,
    generatedAt: new Date().toISOString(),
    status: state.nextActionableUnit ? 'idle' : 'blocked',
    stopReason: finalStopReason,
  };
  orchestrationState = {
    ...orchestrationState,
    generatedAt: new Date().toISOString(),
    status: orchestrationState.nextBatchUnits.length > 0 ? 'idle' : state.status,
    stopReason: finalStopReason,
  };
  writePulseAutonomyState(rootDir, state);
  writePulseAgentOrchestrationState(rootDir, orchestrationState);
  return state;
}

