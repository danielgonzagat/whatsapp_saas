import type {
  PulseAutonomyIterationRecord,
  PulseAutonomyState,
  PulseAutonomyValidationCommandResult,
} from '../../types';
import { DEFAULT_PLANNER_MODEL } from '../../autonomy-loop.types';
import { sleep, readAgentsSdkVersion, commandExists } from '../../autonomy-loop.utils';
import { toUnitSnapshot } from '../../autonomy-loop.unit-ranking';
import {
  directiveDigest,
  getDirectiveSnapshot,
  getMemoryAwarePreferredAutomationSafeUnits,
  writePulseAutonomyState,
  appendHistory,
  runPulseGuidance,
} from '../../autonomy-loop.state-io';
import { rollbackWorkspaceToHead } from '../../autonomy-loop.workspace';
import { captureRegressionSnapshot } from '../../regression-guard';
import {
  buildDeterministicDecision,
  determinePlannerMode,
  shouldStopForDirective,
  planWithAgent,
} from '../../autonomy-loop.planner';
import { runValidationCommands } from '../../autonomy-loop.execution';
import {
  normalizeValidationCommands,
  buildUnitValidationCommands,
  buildCodexPrompt,
} from '../../autonomy-loop.prompt';
import { createExecutor, detectAvailableExecutor, type ExecutorKind } from '../../executor';
import { runParallelAutonomousLoop } from '../../autonomy-loop.parallel';
import {
  deriveStringUnionMembersFromTypeContract,
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel';
import {
  certifiedConvergenceLabel,
  buildRunOptions,
  bootstrapSingleAgentLoop,
  handleRegressionGuard,
  buildIterationRecord,
} from './run-helpers';

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

  if (options.parallelAgents > deriveUnitValue()) {
    return runParallelAutonomousLoop(
      rootDir,
      options,
      plannerMode,
      codexCliAvailable,
      agentsSdkVersion,
    );
  }

  const { state: seededState, rollbackGuard } = bootstrapSingleAgentLoop(
    rootDir,
    options,
    codexCliAvailable,
    agentsSdkVersion,
    plannerMode,
  );
  let state = seededState;
  let consecutiveNoImprovement = deriveZeroValue();
  let iterations = deriveZeroValue();

  while (iterations < options.maxIterations) {
    iterations += deriveUnitValue();

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
          getMemoryAwarePreferredAutomationSafeUnits(
            rootDir,
            directiveBefore,
            options.riskProfile,
            state,
            plannerMode,
          )[0] || null,
        ),
        status:
          directiveBefore.currentState?.certificationStatus === certifiedConvergenceLabel
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
    const plannerModeSet = deriveStringUnionMembersFromTypeContract(
      'scripts/pulse/autonomy-loop.types.ts',
      'plannerMode',
    );
    const agentsSdkLabel = [...plannerModeSet][0];

    const decision =
      plannerMode === agentsSdkLabel
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
          getMemoryAwarePreferredAutomationSafeUnits(
            rootDir,
            directiveBefore,
            options.riskProfile,
            state,
            plannerMode,
          )[0] || null,
        ),
        status: 'blocked',
        stopReason: decision.stopReason || 'Planner stopped the autonomous loop.',
      };
      writePulseAutonomyState(rootDir, state);
      return state;
    }

    const memoryAwareUnits = getMemoryAwarePreferredAutomationSafeUnits(
      rootDir,
      directiveBefore,
      options.riskProfile,
      state,
      plannerMode,
      decision.strategyMode,
    );
    const selectedUnit =
      memoryAwareUnits.find((unit) => unit.id === decision.selectedUnitId) ||
      memoryAwareUnits[0] ||
      null;
    if (!selectedUnit) {
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        status: 'blocked',
        stopReason: `No memory-eligible ai_safe unit remains for strategy ${decision.strategyMode}_${plannerMode}.`,
      };
      writePulseAutonomyState(rootDir, state);
      return state;
    }
    const selectedCodexPrompt =
      selectedUnit.id === decision.selectedUnitId
        ? decision.codexPrompt
        : buildCodexPrompt(directiveBefore, selectedUnit);
    const selectedValidationCommands =
      selectedUnit.id === decision.selectedUnitId
        ? decision.validationCommands
        : validationCommands;

    const executionValidationCommands = buildUnitValidationCommands(
      directiveBefore,
      selectedUnit,
      selectedValidationCommands,
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

      const executed = await executor.runUnit(rootDir, selectedCodexPrompt, {
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
      directiveAfter.currentState?.certificationStatus === certifiedConvergenceLabel
        ? 'completed'
        : codexResult.executed && codexResult.exitCode !== deriveZeroValue()
          ? 'failed'
          : validationResults.some((result) => result.exitCode !== deriveZeroValue())
            ? 'failed'
            : options.dryRun
              ? 'planned'
              : 'validated';

    const improved =
      directiveDigest(directiveBefore) !== directiveDigest(directiveAfter) ||
      afterSnapshot.score !== beforeSnapshot.score ||
      afterSnapshot.blockingTier !== beforeSnapshot.blockingTier ||
      !getMemoryAwarePreferredAutomationSafeUnits(
        rootDir,
        directiveAfter,
        options.riskProfile,
        state,
        plannerMode,
        decision.strategyMode,
      ).some((unit) => unit.id === selectedUnit.id);

    const rollbackSummary =
      !options.dryRun && iterationStatus === 'failed'
        ? rollbackGuard.enabled
          ? rollbackWorkspaceToHead(rootDir)
          : `Automatic rollback skipped: ${rollbackGuard.reason}`
        : null;

    consecutiveNoImprovement = improved
      ? deriveZeroValue()
      : consecutiveNoImprovement + deriveUnitValue();

    const iterationRecord = buildIterationRecord(
      state,
      plannerMode,
      decision.strategyMode,
      iterationStatus,
      iterationStartedAt,
      options.dryRun,
      improved,
      selectedUnit,
      directiveBefore,
      directiveAfter,
      beforeSnapshot,
      afterSnapshot,
      rollbackSummary,
      codexResult,
      validationResults,
    );

    // ── RegressionGuard ──────────────────────────────────────────────────────
    // Use artifact-backed snapshots (score, blockingTier, gates, scenarios, Codacy HIGH,
    // runtime HIGH signals) to detect a real regression caused by this unit.  When a
    // regression is detected, perform a scoped git rollback limited to the files this
    // unit actually changed (so we can never wipe unrelated user work) and surface a
    // failed iteration record so memory + unit-ranking will skip the unit on retry.
    const regressionState = await handleRegressionGuard(
      rootDir,
      options.dryRun,
      codexResult.executed,
      regressionBefore,
      options.riskProfile,
      rollbackGuard,
      state,
      iterationRecord,
      directiveAfter,
      plannerMode,
    );
    if (regressionState) return regressionState;
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
        getMemoryAwarePreferredAutomationSafeUnits(
          rootDir,
          directiveAfter,
          options.riskProfile,
          state,
          plannerMode,
        )[0] || null,
      ),
      status:
        directiveAfter.currentState?.certificationStatus === certifiedConvergenceLabel
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

    const u = deriveUnitValue();
    if (!options.dryRun && consecutiveNoImprovement >= u + u) {
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
