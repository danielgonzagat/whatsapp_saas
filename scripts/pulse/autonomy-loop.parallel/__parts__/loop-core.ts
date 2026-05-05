/**
 * Parallel autonomous loop — core orchestrator.
 * Sets up state, enters the while loop, dispatches workers,
 * and delegates post-worker processing to handlePostWorkerIteration.
 */
import type {
  PulseAgentOrchestrationState,
  PulseAgentOrchestrationWorkerResult,
  PulseAutonomyState,
  PulseAutonomyValidationCommandResult,
} from '../../types.autonomy';
import type { PulseAutonomyRunOptions } from '../../autonomy-loop.types';
import { toUnitSnapshot } from '../../autonomy-loop.unit-ranking/__parts__/structural-rank';
import {
  directiveDigest,
  getDirectiveSnapshot,
} from '../../__parts__/autonomy-loop.state-io/directive';
import {
  selectMemoryAwareParallelUnits,
  runPulseGuidance,
} from '../../__parts__/autonomy-loop.state-io/unit-selection';
import {
  buildPulseAutonomyStateSeed,
  buildPulseAgentOrchestrationStateSeed,
} from '../../__parts__/autonomy-loop.state-io/seed-builders';
import {
  writePulseAutonomyState,
  loadPulseAutonomyState,
  writePulseAgentOrchestrationState,
  loadPulseAgentOrchestrationState,
  appendHistory,
  appendOrchestrationHistory,
} from '../../__parts__/autonomy-loop.state-io/state-io';
import { detectRollbackGuard } from '../../autonomy-loop.workspace';
import { captureRegressionSnapshot } from '../../regression-guard/__parts__/snapshot';
import { shouldStopForDirective } from '../../autonomy-loop.planner';
import { runValidationCommands, runParallelWorkerAssignment } from '../../autonomy-loop.execution';
import { buildBatchValidationCommands } from '../../autonomy-loop.prompt';
import { sleep } from '../../autonomy-loop.utils';
import type { PulseAutonomousDirective } from '../../autonomy-loop.types';
import {
  buildStopEarlyStates,
  buildDryRunWorkerResults,
} from '../../autonomy-loop.parallel-helpers';
import { getContextFabricBlocker } from './helpers';
import { handlePostWorkerIteration } from './loop-post';

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

    const postResult = await handlePostWorkerIteration({
      rootDir,
      options,
      state,
      orchestrationState,
      workerResults,
      validationResults,
      directiveBefore,
      batchUnits,
      regressionBefore,
      consecutiveNoImprovement,
      iterations,
      iterationStartedAt,
      rollbackGuard,
      plannerMode,
    });

    if (postResult.shouldReturn) return postResult.state;

    state = postResult.state;
    orchestrationState = postResult.orchestrationState;
    consecutiveNoImprovement = postResult.consecutiveNoImprovement;
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
