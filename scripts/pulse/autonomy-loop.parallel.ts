/**
 * Parallel autonomous loop — runs multiple Codex workers concurrently.
 * Called by autonomy-loop.ts when parallelAgents > 1.
 */
import type {
  PulseAgentOrchestrationBatchRecord,
  PulseAgentOrchestrationState,
  PulseAgentOrchestrationWorkerResult,
  PulseAutonomyIterationRecord,
  PulseAutonomyState,
  PulseAutonomyUnitSnapshot,
  PulseAutonomyValidationCommandResult,
} from './types';
import type { PulseAutonomyRunOptions } from './autonomy-loop.types';
import {
  toUnitSnapshot,
  getPreferredAutomationSafeUnits,
  selectParallelUnits,
} from './autonomy-loop.unit-ranking';
import {
  directiveDigest,
  getDirectiveSnapshot,
  buildPulseAutonomyStateSeed,
  buildPulseAgentOrchestrationStateSeed,
  writePulseAutonomyState,
  loadPulseAutonomyState,
  writePulseAgentOrchestrationState,
  loadPulseAgentOrchestrationState,
  appendHistory,
  appendOrchestrationHistory,
  runPulseGuidance,
} from './autonomy-loop.state-io';
import {
  detectRollbackGuard,
  rollbackWorkspaceToHead,
  applyWorkerPatchToRoot,
} from './autonomy-loop.workspace';
import { shouldStopForDirective } from './autonomy-loop.planner';
import { runValidationCommands, runParallelWorkerAssignment } from './autonomy-loop.execution';
import { buildBatchValidationCommands, summarizeBatchUnits } from './autonomy-loop.prompt';
import { sleep } from './autonomy-loop.utils';

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
      const isCertified = directiveBefore.currentState?.certificationStatus === 'CERTIFIED';
      const now = new Date().toISOString();
      state = {
        ...state,
        generatedAt: now,
        guidanceGeneratedAt: directiveBefore.generatedAt || state.guidanceGeneratedAt,
        currentCheckpoint: directiveBefore.currentCheckpoint || state.currentCheckpoint,
        targetCheckpoint: directiveBefore.targetCheckpoint || state.targetCheckpoint,
        visionGap: directiveBefore.visionGap || state.visionGap,
        nextActionableUnit: toUnitSnapshot(
          selectParallelUnits(directiveBefore, 1, options.riskProfile, state)[0] || null,
        ),
        status: isCertified ? 'completed' : 'blocked',
        stopReason,
      };
      orchestrationState = {
        ...orchestrationState,
        generatedAt: now,
        guidanceGeneratedAt: directiveBefore.generatedAt || orchestrationState.guidanceGeneratedAt,
        currentCheckpoint:
          directiveBefore.currentCheckpoint || orchestrationState.currentCheckpoint,
        targetCheckpoint: directiveBefore.targetCheckpoint || orchestrationState.targetCheckpoint,
        visionGap: directiveBefore.visionGap || orchestrationState.visionGap,
        nextBatchUnits: selectParallelUnits(
          directiveBefore,
          options.parallelAgents,
          options.riskProfile,
          state,
        )
          .map((unit) => toUnitSnapshot(unit))
          .filter((unit): unit is PulseAutonomyUnitSnapshot => Boolean(unit)),
        status: state.status,
        stopReason,
      };
      writePulseAutonomyState(rootDir, state);
      writePulseAgentOrchestrationState(rootDir, orchestrationState);
      return state;
    }

    const batchUnits = selectParallelUnits(
      directiveBefore,
      options.parallelAgents,
      options.riskProfile,
      state,
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

    const iterationStartedAt = new Date().toISOString();
    const validationCommands = buildBatchValidationCommands(
      directiveBefore,
      batchUnits,
      options.validateCommands,
    );
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
      workerResults = batchUnits.map((unit, index) => ({
        workerId: `worker-${index + 1}`,
        attemptCount: 0,
        status: 'planned' as const,
        summary: `Planned ${unit.title} without executing Codex because dry-run is enabled.`,
        unit: toUnitSnapshot(unit),
        startedAt: iterationStartedAt,
        finishedAt: new Date().toISOString(),
        lockedCapabilities: unit.affectedCapabilities || [],
        lockedFlows: unit.affectedFlows || [],
        workspaceMode: 'isolated_copy' as const,
        workspacePath: null,
        patchPath: null,
        changedFiles: [],
        applyStatus: 'planned' as const,
        applySummary:
          'Worker execution planned in isolated mode but skipped because dry-run is enabled.',
        logPath: null,
        codex: { executed: false, command: null, exitCode: null, finalMessage: null },
      }));
    }

    if (!options.dryRun) {
      workerResults = workerResults.map((worker) => {
        if (worker.status !== 'completed' || !worker.patchPath) {
          return worker;
        }
        const applyResult = applyWorkerPatchToRoot(rootDir, worker.patchPath, worker.workerId);
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
    const improved =
      directiveDigest(directiveBefore) !== directiveDigest(directiveAfter) ||
      afterSnapshot.score !== beforeSnapshot.score ||
      afterSnapshot.blockingTier !== beforeSnapshot.blockingTier ||
      batchUnits.some(
        (unit) =>
          !getPreferredAutomationSafeUnits(directiveAfter, options.riskProfile, state).some(
            (candidate) => candidate.id === unit.id,
          ),
      );

    consecutiveNoImprovement = improved ? 0 : consecutiveNoImprovement + 1;

    const workerFailure = workerResults.some(
      (worker) =>
        worker.status === 'failed' || (worker.codex.executed && worker.codex.exitCode !== 0),
    );
    const validationFailure = validationResults.some((result) => result.exitCode !== 0);
    const rollbackSummary =
      !options.dryRun && (workerFailure || validationFailure)
        ? rollbackGuard.enabled
          ? rollbackWorkspaceToHead(rootDir)
          : `Automatic rollback skipped: ${rollbackGuard.reason}`
        : null;

    const batchRecord: PulseAgentOrchestrationBatchRecord = {
      batch: orchestrationState.completedIterations + 1,
      strategy: 'capability_flow_locking',
      riskProfile: options.riskProfile,
      plannerMode,
      startedAt: iterationStartedAt,
      finishedAt: new Date().toISOString(),
      summary: options.dryRun
        ? `Planned parallel batch: ${summarizeBatchUnits(batchUnits)}.`
        : improved
          ? `Executed parallel batch with ${workerResults.length} worker(s) and Pulse changed after validation.`
          : `Executed parallel batch with ${workerResults.length} worker(s) but Pulse did not materially change after validation.${rollbackSummary ? ` ${rollbackSummary}` : ''}`,
      directiveDigestBefore: directiveDigest(directiveBefore),
      directiveDigestAfter: directiveDigest(directiveAfter),
      improved,
      workers: workerResults,
      validation: {
        executed: !options.dryRun,
        commands: validationResults,
      },
    };
    orchestrationState = appendOrchestrationHistory(orchestrationState, batchRecord);
    orchestrationState = {
      ...orchestrationState,
      generatedAt: new Date().toISOString(),
      guidanceGeneratedAt: directiveAfter.generatedAt || orchestrationState.guidanceGeneratedAt,
      currentCheckpoint: directiveAfter.currentCheckpoint || orchestrationState.currentCheckpoint,
      targetCheckpoint: directiveAfter.targetCheckpoint || orchestrationState.targetCheckpoint,
      visionGap: directiveAfter.visionGap || orchestrationState.visionGap,
      nextBatchUnits: selectParallelUnits(
        directiveAfter,
        options.parallelAgents,
        options.riskProfile,
        state,
      )
        .map((unit) => toUnitSnapshot(unit))
        .filter((unit): unit is PulseAutonomyUnitSnapshot => Boolean(unit)),
      status:
        directiveAfter.currentState?.certificationStatus === 'CERTIFIED'
          ? 'completed'
          : workerFailure || validationFailure
            ? 'failed'
            : 'running',
      stopReason: null,
    };
    writePulseAgentOrchestrationState(rootDir, orchestrationState);

    const iterationStatus =
      directiveAfter.currentState?.certificationStatus === 'CERTIFIED'
        ? 'completed'
        : workerFailure || validationFailure
          ? 'failed'
          : options.dryRun
            ? 'planned'
            : 'validated';

    const iterationRecord: PulseAutonomyIterationRecord = {
      iteration: state.completedIterations + 1,
      plannerMode,
      status: iterationStatus,
      startedAt: iterationStartedAt,
      finishedAt: new Date().toISOString(),
      summary: options.dryRun
        ? `Planned parallel batch without executing Codex because dry-run is enabled: ${summarizeBatchUnits(batchUnits)}.`
        : improved
          ? `Executed parallel batch and Pulse changed after validation: ${summarizeBatchUnits(batchUnits)}.`
          : `Executed parallel batch without material Pulse change: ${summarizeBatchUnits(batchUnits)}.${rollbackSummary ? ` ${rollbackSummary}` : ''}`,
      improved,
      unit: toUnitSnapshot(batchUnits[0] || null),
      directiveDigestBefore: directiveDigest(directiveBefore),
      directiveDigestAfter: directiveDigest(directiveAfter),
      directiveBefore: beforeSnapshot,
      directiveAfter: afterSnapshot,
      codex: {
        executed: !options.dryRun,
        command:
          workerResults
            .map((worker) => worker.codex.command)
            .filter((value): value is string => Boolean(value))
            .join(' && ') || null,
        exitCode: workerFailure ? 1 : 0,
        finalMessage:
          workerResults
            .map((worker) => worker.codex.finalMessage)
            .filter((value): value is string => Boolean(value))
            .join('\n---\n') || null,
      },
      validation: {
        executed: !options.dryRun,
        commands: validationResults,
      },
    };
    state = appendHistory(state, iterationRecord);
    state = {
      ...state,
      generatedAt: new Date().toISOString(),
      guidanceGeneratedAt: directiveAfter.generatedAt || state.guidanceGeneratedAt,
      currentCheckpoint: directiveAfter.currentCheckpoint || state.currentCheckpoint,
      targetCheckpoint: directiveAfter.targetCheckpoint || state.targetCheckpoint,
      visionGap: directiveAfter.visionGap || state.visionGap,
      nextActionableUnit: toUnitSnapshot(
        selectParallelUnits(directiveAfter, 1, options.riskProfile, state)[0] || null,
      ),
      status: orchestrationState.status,
      stopReason: rollbackSummary,
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
        const hasBatch = orchestrationState.nextBatchUnits.length > 0;
        state = {
          ...state,
          generatedAt: new Date().toISOString(),
          status: hasNext ? 'idle' : 'blocked',
          stopReason: hasNext ? null : limitReason,
        };
        orchestrationState = {
          ...orchestrationState,
          generatedAt: new Date().toISOString(),
          status: hasBatch ? 'idle' : state.status,
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
