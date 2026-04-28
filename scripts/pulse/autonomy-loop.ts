/**
 * Autonomous Pulse loop — thin orchestrator.
 * All heavy helpers live in autonomy-loop.* sub-modules.
 */
import type {
  PulseAgentOrchestrationState,
  PulseAutonomyIterationRecord,
  PulseAutonomyState,
  PulseAutonomyValidationCommandResult,
} from './types';
import {
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_INTERVAL_MS,
  DEFAULT_PARALLEL_AGENTS,
  DEFAULT_MAX_WORKER_RETRIES,
  DEFAULT_PLANNER_MODEL,
  type PulseAutonomyRunOptions,
} from './autonomy-loop.types';
import {
  sleep,
  coercePositiveInt,
  readAgentsSdkVersion,
  commandExists,
} from './autonomy-loop.utils';
import { toUnitSnapshot, getPreferredAutomationSafeUnits } from './autonomy-loop.unit-ranking';
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
  runPulseGuidance,
} from './autonomy-loop.state-io';
import { detectRollbackGuard, rollbackWorkspaceToHead } from './autonomy-loop.workspace';
import {
  detectRegression,
  captureRegressionSnapshot,
  detectChangedFilesSinceHead,
  rollbackRegression,
  throwOnRegression,
  RegressionError,
} from './regression-guard';
import {
  buildDeterministicDecision,
  determinePlannerMode,
  shouldStopForDirective,
  planWithAgent,
} from './autonomy-loop.planner';
import { runValidationCommands } from './autonomy-loop.execution';
import { normalizeValidationCommands, buildUnitValidationCommands } from './autonomy-loop.prompt';
import { createExecutor, detectAvailableExecutor, type ExecutorKind } from './executor';
import { runParallelAutonomousLoop } from './autonomy-loop.parallel';

export { buildPulseAutonomyMemoryState } from './autonomy-loop.memory';
export {
  buildPulseAutonomyStateSeed,
  buildPulseAgentOrchestrationStateSeed,
} from './autonomy-loop.state-io';
export {
  prepareIsolatedWorkerWorkspace,
  collectWorkspacePatch,
  applyWorkerPatchToRoot,
} from './autonomy-loop.workspace';

// ── buildRunOptions ───────────────────────────────────────────────────────────

function buildRunOptions(
  rootDir: string,
  flags: {
    dryRun?: boolean;
    continuous?: boolean;
    maxIterations?: number | null;
    intervalMs?: number | null;
    parallelAgents?: number | null;
    maxWorkerRetries?: number | null;
    riskProfile?: 'safe' | 'balanced' | 'dangerous' | null;
    plannerModel?: string | null;
    codexModel?: string | null;
    disableAgentPlanner?: boolean;
    executor?: ExecutorKind | null;
  },
): PulseAutonomyRunOptions {
  const validateCommands = process.env.PULSE_AUTONOMY_VALIDATE
    ? process.env.PULSE_AUTONOMY_VALIDATE.split(';;')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

  return {
    rootDir,
    dryRun: Boolean(flags.dryRun),
    continuous: Boolean(flags.continuous),
    maxIterations:
      flags.maxIterations ||
      coercePositiveInt(process.env.PULSE_AUTONOMY_MAX_ITERATIONS, DEFAULT_MAX_ITERATIONS),
    intervalMs:
      flags.intervalMs ||
      coercePositiveInt(process.env.PULSE_AUTONOMY_INTERVAL_MS, DEFAULT_INTERVAL_MS),
    parallelAgents:
      flags.parallelAgents ||
      coercePositiveInt(process.env.PULSE_AUTONOMY_PARALLEL_AGENTS, DEFAULT_PARALLEL_AGENTS),
    maxWorkerRetries:
      flags.maxWorkerRetries ||
      coercePositiveInt(process.env.PULSE_AUTONOMY_MAX_WORKER_RETRIES, DEFAULT_MAX_WORKER_RETRIES),
    riskProfile:
      flags.riskProfile ||
      (process.env.PULSE_AUTONOMY_RISK_PROFILE === 'safe' ||
      process.env.PULSE_AUTONOMY_RISK_PROFILE === 'dangerous'
        ? process.env.PULSE_AUTONOMY_RISK_PROFILE
        : 'balanced'),
    plannerModel: flags.plannerModel || process.env.PULSE_AUTONOMY_MODEL || DEFAULT_PLANNER_MODEL,
    codexModel: flags.codexModel || process.env.PULSE_AUTONOMY_CODEX_MODEL || null,
    disableAgentPlanner:
      Boolean(flags.disableAgentPlanner) ||
      process.env.PULSE_AUTONOMY_DISABLE_AGENT_PLANNER === '1',
    executor: flags.executor || null,
    validateCommands,
  };
}

// ── Single-agent loop ─────────────────────────────────────────────────────────

/** Run the autonomous Pulse loop. */
export async function runPulseAutonomousLoop(
  rootDir: string,
  flags: {
    dryRun?: boolean;
    continuous?: boolean;
    maxIterations?: number | null;
    intervalMs?: number | null;
    parallelAgents?: number | null;
    maxWorkerRetries?: number | null;
    riskProfile?: 'safe' | 'balanced' | 'dangerous' | null;
    plannerModel?: string | null;
    codexModel?: string | null;
    disableAgentPlanner?: boolean;
    executor?: ExecutorKind | null;
  } = {},
): Promise<PulseAutonomyState> {
  const options = buildRunOptions(rootDir, flags);
  const codexCliAvailable = commandExists('codex', rootDir);
  const agentsSdkVersion = readAgentsSdkVersion(rootDir);
  const plannerMode = determinePlannerMode(options.disableAgentPlanner, rootDir);

  if (options.parallelAgents > 1) {
    return runParallelAutonomousLoop(
      rootDir,
      options,
      plannerMode,
      codexCliAvailable,
      agentsSdkVersion,
    );
  }

  const rollbackGuard = detectRollbackGuard(rootDir);
  const previousState = loadPulseAutonomyState(rootDir);
  const previousOrchestrationState = loadPulseAgentOrchestrationState(rootDir);
  const initialDirective = runPulseGuidance(rootDir);
  let state = buildPulseAutonomyStateSeed({
    directive: initialDirective,
    previousState,
    codexCliAvailable,
    orchestrationMode: 'single',
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    riskProfile: options.riskProfile,
    plannerMode,
    plannerModel: options.plannerModel,
    codexModel: options.codexModel,
  });
  let orchestrationState: PulseAgentOrchestrationState = buildPulseAgentOrchestrationStateSeed({
    directive: initialDirective,
    previousState: previousOrchestrationState,
    codexCliAvailable,
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    riskProfile: options.riskProfile,
    plannerMode,
  });

  const runnerInfo = {
    agentsSdkAvailable: Boolean(agentsSdkVersion),
    agentsSdkVersion,
    openAiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
    codexCliAvailable,
  };
  state = {
    ...state,
    status: 'running',
    continuous: options.continuous,
    maxIterations: options.maxIterations,
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    orchestrationMode: 'single',
    riskProfile: options.riskProfile,
    plannerMode,
    plannerModel: options.plannerModel,
    codexModel: options.codexModel,
    runner: runnerInfo,
    stopReason: null,
  };
  orchestrationState = {
    ...orchestrationState,
    status: 'idle',
    continuous: options.continuous,
    maxIterations: options.maxIterations,
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    riskProfile: options.riskProfile,
    runner: runnerInfo,
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
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        guidanceGeneratedAt: directiveBefore.generatedAt || state.guidanceGeneratedAt,
        currentCheckpoint: directiveBefore.currentCheckpoint || state.currentCheckpoint,
        targetCheckpoint: directiveBefore.targetCheckpoint || state.targetCheckpoint,
        visionGap: directiveBefore.visionGap || state.visionGap,
        nextActionableUnit: toUnitSnapshot(
          getPreferredAutomationSafeUnits(directiveBefore, options.riskProfile, state)[0] || null,
        ),
        status:
          directiveBefore.currentState?.certificationStatus === 'CERTIFIED'
            ? 'completed'
            : 'blocked',
        stopReason,
      };
      writePulseAutonomyState(rootDir, state);
      return state;
    }

    const validationCommands = normalizeValidationCommands(
      options.validateCommands,
      directiveBefore,
    );
    const decision =
      plannerMode === 'agents_sdk'
        ? await planWithAgent(
            rootDir,
            directiveBefore,
            state,
            options.plannerModel || DEFAULT_PLANNER_MODEL,
            validationCommands,
            options.riskProfile,
          )
        : buildDeterministicDecision(
            directiveBefore,
            validationCommands,
            options.riskProfile,
            state,
          );

    if (!decision.shouldContinue) {
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        guidanceGeneratedAt: directiveBefore.generatedAt || state.guidanceGeneratedAt,
        currentCheckpoint: directiveBefore.currentCheckpoint || state.currentCheckpoint,
        targetCheckpoint: directiveBefore.targetCheckpoint || state.targetCheckpoint,
        visionGap: directiveBefore.visionGap || state.visionGap,
        nextActionableUnit: toUnitSnapshot(
          getPreferredAutomationSafeUnits(directiveBefore, options.riskProfile, state)[0] || null,
        ),
        status: 'blocked',
        stopReason: decision.stopReason || 'Planner stopped the autonomous loop.',
      };
      writePulseAutonomyState(rootDir, state);
      return state;
    }

    const selectedUnit =
      getPreferredAutomationSafeUnits(directiveBefore, options.riskProfile, state).find(
        (unit) => unit.id === decision.selectedUnitId,
      ) || null;
    if (!selectedUnit) {
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        status: 'failed',
        stopReason: `Planner selected unknown or non-ai_safe unit: ${decision.selectedUnitId}`,
      };
      writePulseAutonomyState(rootDir, state);
      return state;
    }

    const executionValidationCommands = buildUnitValidationCommands(
      directiveBefore,
      selectedUnit,
      decision.validationCommands,
    );
    const iterationStartedAt = new Date().toISOString();
    // RegressionGuard: capture pre-execution snapshot from on-disk Pulse artifacts.
    // This is the source-of-truth for score, blockingTier, gates, scenarios, Codacy HIGH,
    // and runtime HIGH signals — strictly more comprehensive than directive currentState.
    const regressionBefore = !options.dryRun ? captureRegressionSnapshot(rootDir) : null;
    let codexResult = {
      executed: false,
      command: null as string | null,
      exitCode: null as number | null,
      finalMessage: null as string | null,
    };
    let validationResults: PulseAutonomyValidationCommandResult[] = [];

    // Use executor (pluggable — codex or kilo)
    const executor = options.executor
      ? createExecutor(options.executor as ExecutorKind)
      : createExecutor(detectAvailableExecutor() ?? 'codex');

    if (!options.dryRun) {
      if (!executor.isAvailable()) {
        state = {
          ...state,
          generatedAt: new Date().toISOString(),
          status: 'failed',
          stopReason: `Executor '${executor.name}' is not available for autonomous execution.`,
        };
        writePulseAutonomyState(rootDir, state);
        return state;
      }

      const executed = await executor.runUnit(rootDir, decision.codexPrompt, {
        model: options.codexModel,
      });
      codexResult = {
        executed: executed.executed,
        command: executed.command,
        exitCode: executed.exitCode,
        finalMessage: executed.finalMessage,
      };
      validationResults = runValidationCommands(rootDir, executionValidationCommands);
    }

    const directiveAfter = runPulseGuidance(rootDir);
    const beforeSnapshot = getDirectiveSnapshot(directiveBefore);
    const afterSnapshot = getDirectiveSnapshot(directiveAfter);
    const iterationStatus =
      directiveAfter.currentState?.certificationStatus === 'CERTIFIED'
        ? 'completed'
        : codexResult.executed && codexResult.exitCode !== 0
          ? 'failed'
          : validationResults.some((result) => result.exitCode !== 0)
            ? 'failed'
            : options.dryRun
              ? 'planned'
              : 'validated';

    const improved =
      directiveDigest(directiveBefore) !== directiveDigest(directiveAfter) ||
      afterSnapshot.score !== beforeSnapshot.score ||
      afterSnapshot.blockingTier !== beforeSnapshot.blockingTier ||
      !getPreferredAutomationSafeUnits(directiveAfter, options.riskProfile, state).some(
        (unit) => unit.id === selectedUnit.id,
      );

    const rollbackSummary =
      !options.dryRun && iterationStatus === 'failed'
        ? rollbackGuard.enabled
          ? rollbackWorkspaceToHead(rootDir)
          : `Automatic rollback skipped: ${rollbackGuard.reason}`
        : null;

    consecutiveNoImprovement = improved ? 0 : consecutiveNoImprovement + 1;

    const iterationRecord: PulseAutonomyIterationRecord = {
      iteration: state.completedIterations + 1,
      plannerMode,
      strategyMode: decision.strategyMode,
      status: iterationStatus,
      startedAt: iterationStartedAt,
      finishedAt: new Date().toISOString(),
      summary: options.dryRun
        ? `Planned ${selectedUnit.title} without executing Codex because dry-run is enabled.`
        : improved
          ? `Executed ${selectedUnit.title} and Pulse changed after validation.`
          : `Executed ${selectedUnit.title} but Pulse did not materially change after validation.${rollbackSummary ? ` ${rollbackSummary}` : ''}`,
      improved,
      unit: toUnitSnapshot(selectedUnit),
      directiveDigestBefore: directiveDigest(directiveBefore),
      directiveDigestAfter: directiveDigest(directiveAfter),
      directiveBefore: beforeSnapshot,
      directiveAfter: afterSnapshot,
      executionMatrixSummaryBefore: beforeSnapshot.executionMatrixSummary ?? null,
      executionMatrixSummaryAfter: afterSnapshot.executionMatrixSummary ?? null,
      codex: codexResult,
      validation: {
        executed: !options.dryRun,
        commands: validationResults,
      },
    };

    // ── RegressionGuard ──────────────────────────────────────────────────────
    // Use artifact-backed snapshots (score, blockingTier, gates, scenarios, Codacy HIGH,
    // runtime HIGH signals) to detect a real regression caused by this unit.  When a
    // regression is detected, perform a scoped git rollback limited to the files this
    // unit actually changed (so we can never wipe unrelated user work) and surface a
    // failed iteration record so memory + unit-ranking will skip the unit on retry.
    if (!options.dryRun && codexResult.executed && regressionBefore) {
      const regressionAfter = captureRegressionSnapshot(rootDir);
      const regressionResult = detectRegression(regressionBefore, regressionAfter);
      if (regressionResult.regressed) {
        // Snapshot the files this unit touched BEFORE rollback so we can scope it.
        const changedFiles = detectChangedFilesSinceHead(rootDir);
        const reason = `RegressionGuard: ${regressionResult.reasons.join(' | ')}`;
        const rollbackOutcome = rollbackGuard.enabled
          ? rollbackRegression(rootDir, changedFiles, reason)
          : {
              attempted: false,
              skipped: true,
              revertedFiles: [],
              removedUntracked: [],
              summary: `Rollback skipped: ${rollbackGuard.reason}`,
            };

        const failedRecord: PulseAutonomyIterationRecord = {
          ...iterationRecord,
          status: 'failed',
          improved: false,
          summary: `${iterationRecord.summary} ${reason} ${rollbackOutcome.summary}`.trim(),
        };
        state = appendHistory(state, failedRecord);
        state = {
          ...state,
          generatedAt: new Date().toISOString(),
          guidanceGeneratedAt: directiveAfter.generatedAt || state.guidanceGeneratedAt,
          currentCheckpoint: directiveAfter.currentCheckpoint || state.currentCheckpoint,
          targetCheckpoint: directiveAfter.targetCheckpoint || state.targetCheckpoint,
          visionGap: directiveAfter.visionGap || state.visionGap,
          nextActionableUnit: toUnitSnapshot(
            getPreferredAutomationSafeUnits(directiveAfter, options.riskProfile, state)[0] || null,
          ),
          status: 'failed',
          stopReason: `${reason} | ${rollbackOutcome.summary}`,
        };
        writePulseAutonomyState(rootDir, state);
        return state;
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    state = appendHistory(state, iterationRecord);
    state = {
      ...state,
      generatedAt: new Date().toISOString(),
      guidanceGeneratedAt: directiveAfter.generatedAt || state.guidanceGeneratedAt,
      currentCheckpoint: directiveAfter.currentCheckpoint || state.currentCheckpoint,
      targetCheckpoint: directiveAfter.targetCheckpoint || state.targetCheckpoint,
      visionGap: directiveAfter.visionGap || state.visionGap,
      nextActionableUnit: toUnitSnapshot(
        getPreferredAutomationSafeUnits(directiveAfter, options.riskProfile, state)[0] || null,
      ),
      status:
        directiveAfter.currentState?.certificationStatus === 'CERTIFIED'
          ? 'completed'
          : iterationStatus === 'failed'
            ? 'failed'
            : 'running',
      stopReason: rollbackSummary,
    };
    writePulseAutonomyState(rootDir, state);

    if (state.status === 'completed' || state.status === 'failed') {
      return state;
    }

    if (!options.dryRun && consecutiveNoImprovement >= 2) {
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        status: 'blocked',
        stopReason:
          'Autonomy loop stopped after repeated iterations without material Pulse convergence.',
      };
      writePulseAutonomyState(rootDir, state);
      return state;
    }

    if (!options.continuous) {
      if (iterations >= options.maxIterations) {
        const limitReason = `Reached max iterations (${options.maxIterations}) before certification.`;
        const hasNextActionableUnit = Boolean(state.nextActionableUnit);
        state = {
          ...state,
          generatedAt: new Date().toISOString(),
          status: hasNextActionableUnit ? 'idle' : 'blocked',
          stopReason: hasNextActionableUnit ? null : limitReason,
        };
        writePulseAutonomyState(rootDir, state);
        return state;
      }
      continue;
    }

    await sleep(options.intervalMs);
  }

  state = {
    ...state,
    generatedAt: new Date().toISOString(),
    status: state.nextActionableUnit ? 'idle' : 'blocked',
    stopReason: state.nextActionableUnit
      ? null
      : `Reached max iterations (${options.maxIterations}) before certification.`,
  };
  writePulseAutonomyState(rootDir, state);
  return state;
}
