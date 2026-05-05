/**
 * Parallel autonomous loop — post-worker iteration handler.
 * Handles patch application, directive comparison, regression guard,
 * rollback, record building, state persistence, convergence check,
 * and exit conditions for one loop iteration after workers have executed.
 */
import type {
  PulseAgentOrchestrationState,
  PulseAgentOrchestrationWorkerResult,
  PulseAutonomyState,
  PulseAutonomyValidationCommandResult,
} from '../../types';
import type { PulseAutonomyRunOptions } from '../../autonomy-loop.types';
import type { PulseAutonomousDirective } from '../../autonomy-loop.types';
import { toUnitSnapshot } from '../../autonomy-loop.unit-ranking';
import {
  directiveDigest,
  getDirectiveSnapshot,
  selectMemoryAwareParallelUnits,
  writePulseAutonomyState,
  writePulseAgentOrchestrationState,
  appendHistory,
  appendOrchestrationHistory,
  runPulseGuidance,
} from '../../autonomy-loop.state-io';
import { applyWorkerPatchToRoot, rollbackWorkspaceToHead } from '../../autonomy-loop.workspace';
import {
  captureRegressionSnapshot,
  detectRegression,
  rollbackRegression,
} from '../../regression-guard';
import { sleep } from '../../autonomy-loop.utils';
import {
  buildBatchRecord,
  buildOrchestrationStateUpdate,
  buildIterationRecord,
  buildStateUpdate,
} from '../../autonomy-loop.parallel-helpers';

export interface PostWorkerResult {
  state: PulseAutonomyState;
  orchestrationState: PulseAgentOrchestrationState;
  consecutiveNoImprovement: number;
  shouldReturn: boolean;
}

export async function handlePostWorkerIteration(params: {
  rootDir: string;
  options: PulseAutonomyRunOptions;
  state: PulseAutonomyState;
  orchestrationState: PulseAgentOrchestrationState;
  workerResults: PulseAgentOrchestrationWorkerResult[];
  validationResults: PulseAutonomyValidationCommandResult[];
  directiveBefore: PulseAutonomousDirective;
  batchUnits: Array<{ id: string; leaseId?: string; contextDigest?: string }>;
  regressionBefore: ReturnType<typeof captureRegressionSnapshot>;
  consecutiveNoImprovement: number;
  iterations: number;
  iterationStartedAt: string;
  rollbackGuard: ReturnType<typeof import('../../autonomy-loop.workspace').detectRollbackGuard>;
  plannerMode: 'agents_sdk' | 'deterministic';
}): Promise<PostWorkerResult> {
  const {
    rootDir,
    options,
    state: incomingState,
    orchestrationState: incomingOrchState,
    workerResults: incomingWorkerResults,
    validationResults,
    directiveBefore,
    batchUnits,
    regressionBefore,
    consecutiveNoImprovement: incomingConsecutiveNoImprovement,
    iterations,
    iterationStartedAt,
    rollbackGuard,
    plannerMode,
  } = params;

  let state = incomingState;
  let orchestrationState = incomingOrchState;
  let workerResults = incomingWorkerResults;
  let consecutiveNoImprovement = incomingConsecutiveNoImprovement;

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

  if (state.status === 'completed' || state.status === 'failed') {
    return { state, orchestrationState, consecutiveNoImprovement, shouldReturn: true };
  }

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
    return { state, orchestrationState, consecutiveNoImprovement, shouldReturn: true };
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
      return { state, orchestrationState, consecutiveNoImprovement, shouldReturn: true };
    }
    return { state, orchestrationState, consecutiveNoImprovement, shouldReturn: false };
  }

  await sleep(options.intervalMs);
  return { state, orchestrationState, consecutiveNoImprovement, shouldReturn: false };
}
