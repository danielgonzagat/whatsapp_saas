/**
 * Pure record-builder helpers for the parallel autonomous loop.
 * Companion to autonomy-loop.parallel.ts — no I/O, no side effects.
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
import type { PulseAutonomousDirective, PulseAutonomousDirectiveUnit } from './autonomy-types';
import { toUnitSnapshot, selectParallelUnits } from './autonomy-loop.unit-ranking';
import { directiveDigest, getDirectiveSnapshot } from './autonomy-loop.state-io';
import { summarizeBatchUnits } from './autonomy-loop.prompt';

export function buildBatchRecord(
  orchestrationState: PulseAgentOrchestrationState,
  batchUnits: PulseAutonomousDirectiveUnit[],
  workerResults: PulseAgentOrchestrationWorkerResult[],
  validationResults: PulseAutonomyValidationCommandResult[],
  directiveBefore: PulseAutonomousDirective,
  directiveAfter: PulseAutonomousDirective,
  iterationStartedAt: string,
  improved: boolean,
  rollbackSummary: string | null,
  dryRun: boolean,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  plannerMode: 'agents_sdk' | 'deterministic',
): PulseAgentOrchestrationBatchRecord {
  return {
    batch: orchestrationState.completedIterations + 1,
    strategy: 'capability_flow_locking',
    riskProfile,
    plannerMode,
    startedAt: iterationStartedAt,
    finishedAt: new Date().toISOString(),
    summary: dryRun
      ? `Planned parallel batch: ${summarizeBatchUnits(batchUnits)}.`
      : improved
        ? `Executed parallel batch with ${workerResults.length} worker(s) and Pulse changed after validation.`
        : `Executed parallel batch with ${workerResults.length} worker(s) but Pulse did not materially change after validation.${rollbackSummary ? ` ${rollbackSummary}` : ''}`,
    directiveDigestBefore: directiveDigest(directiveBefore),
    directiveDigestAfter: directiveDigest(directiveAfter),
    improved,
    workers: workerResults,
    validation: {
      executed: !dryRun,
      commands: validationResults,
    },
  };
}

export function buildOrchestrationStateUpdate(
  orchestrationState: PulseAgentOrchestrationState,
  directiveAfter: PulseAutonomousDirective,
  state: PulseAutonomyState,
  parallelAgents: number,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  workerFailure: boolean,
  validationFailure: boolean,
): Partial<PulseAgentOrchestrationState> {
  return {
    generatedAt: new Date().toISOString(),
    guidanceGeneratedAt: directiveAfter.generatedAt || orchestrationState.guidanceGeneratedAt,
    currentCheckpoint: directiveAfter.currentCheckpoint || orchestrationState.currentCheckpoint,
    targetCheckpoint: directiveAfter.targetCheckpoint || orchestrationState.targetCheckpoint,
    visionGap: directiveAfter.visionGap || orchestrationState.visionGap,
    nextBatchUnits: selectParallelUnits(directiveAfter, parallelAgents, riskProfile, state)
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
}

export function buildIterationRecord(
  state: PulseAutonomyState,
  batchUnits: PulseAutonomousDirectiveUnit[],
  workerResults: PulseAgentOrchestrationWorkerResult[],
  validationResults: PulseAutonomyValidationCommandResult[],
  directiveBefore: PulseAutonomousDirective,
  directiveAfter: PulseAutonomousDirective,
  iterationStartedAt: string,
  improved: boolean,
  rollbackSummary: string | null,
  workerFailure: boolean,
  validationFailure: boolean,
  dryRun: boolean,
  plannerMode: 'agents_sdk' | 'deterministic',
): PulseAutonomyIterationRecord {
  const beforeSnapshot = getDirectiveSnapshot(directiveBefore);
  const afterSnapshot = getDirectiveSnapshot(directiveAfter);
  const iterationStatus =
    directiveAfter.currentState?.certificationStatus === 'CERTIFIED'
      ? 'completed'
      : workerFailure || validationFailure
        ? 'failed'
        : dryRun
          ? 'planned'
          : 'validated';

  return {
    iteration: state.completedIterations + 1,
    plannerMode,
    status: iterationStatus,
    startedAt: iterationStartedAt,
    finishedAt: new Date().toISOString(),
    summary: dryRun
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
      executed: !dryRun,
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
      executed: !dryRun,
      commands: validationResults,
    },
  };
}

export function buildStateUpdate(
  state: PulseAutonomyState,
  directiveAfter: PulseAutonomousDirective,
  orchestrationStatus: PulseAgentOrchestrationState['status'],
  rollbackSummary: string | null,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
): Partial<PulseAutonomyState> {
  return {
    generatedAt: new Date().toISOString(),
    guidanceGeneratedAt: directiveAfter.generatedAt || state.guidanceGeneratedAt,
    currentCheckpoint: directiveAfter.currentCheckpoint || state.currentCheckpoint,
    targetCheckpoint: directiveAfter.targetCheckpoint || state.targetCheckpoint,
    visionGap: directiveAfter.visionGap || state.visionGap,
    nextActionableUnit: toUnitSnapshot(
      selectParallelUnits(directiveAfter, 1, riskProfile, state)[0] || null,
    ),
    status: orchestrationStatus,
    stopReason: rollbackSummary,
  };
}

export function buildStopEarlyStates(
  state: PulseAutonomyState,
  orchestrationState: PulseAgentOrchestrationState,
  directive: PulseAutonomousDirective,
  stopReason: string,
  parallelAgents: number,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
): {
  state: Partial<PulseAutonomyState>;
  orchestrationState: Partial<PulseAgentOrchestrationState>;
} {
  const isCertified = directive.currentState?.certificationStatus === 'CERTIFIED';
  const now = new Date().toISOString();
  return {
    state: {
      generatedAt: now,
      guidanceGeneratedAt: directive.generatedAt || state.guidanceGeneratedAt,
      currentCheckpoint: directive.currentCheckpoint || state.currentCheckpoint,
      targetCheckpoint: directive.targetCheckpoint || state.targetCheckpoint,
      visionGap: directive.visionGap || state.visionGap,
      nextActionableUnit: toUnitSnapshot(
        selectParallelUnits(directive, 1, riskProfile, state)[0] || null,
      ),
      status: isCertified ? 'completed' : 'blocked',
      stopReason,
    },
    orchestrationState: {
      generatedAt: now,
      guidanceGeneratedAt: directive.generatedAt || orchestrationState.guidanceGeneratedAt,
      currentCheckpoint: directive.currentCheckpoint || orchestrationState.currentCheckpoint,
      targetCheckpoint: directive.targetCheckpoint || orchestrationState.targetCheckpoint,
      visionGap: directive.visionGap || orchestrationState.visionGap,
      nextBatchUnits: selectParallelUnits(directive, parallelAgents, riskProfile, state)
        .map((unit) => toUnitSnapshot(unit))
        .filter((unit): unit is PulseAutonomyUnitSnapshot => Boolean(unit)),
      status: isCertified ? 'completed' : 'blocked',
      stopReason,
    },
  };
}

export function buildDryRunWorkerResults(
  batchUnits: PulseAutonomousDirectiveUnit[],
  iterationStartedAt: string,
): PulseAgentOrchestrationWorkerResult[] {
  return batchUnits.map((unit, index) => ({
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
