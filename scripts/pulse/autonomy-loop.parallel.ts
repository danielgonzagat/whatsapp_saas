/**
 * Parallel autonomous loop — runs multiple Codex workers concurrently.
 * Called by autonomy-loop.ts when parallelAgents > 1.
 */
import type {
  PulseAgentOrchestrationState,
  PulseAgentOrchestrationWorkerResult,
  PulseAutonomyState,
  PulseAutonomyValidationCommandResult,
} from './types';
import type { PulseAutonomyRunOptions } from './autonomy-loop.types';
import { toUnitSnapshot } from './autonomy-loop.unit-ranking';
import {
  directiveDigest,
  getDirectiveSnapshot,
  selectMemoryAwareParallelUnits,
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
import {
  captureRegressionSnapshot,
  detectRegression,
  rollbackRegression,
} from './regression-guard';
import { shouldStopForDirective } from './autonomy-loop.planner';
import { runValidationCommands, runParallelWorkerAssignment } from './autonomy-loop.execution';
import { buildBatchValidationCommands } from './autonomy-loop.prompt';
import { sleep } from './autonomy-loop.utils';
import type { PulseAutonomousDirective } from './autonomy-loop.types';
import {
  buildBatchRecord,
  buildOrchestrationStateUpdate,
  buildIterationRecord,
  buildStateUpdate,
  buildStopEarlyStates,
  buildDryRunWorkerResults,
} from './autonomy-loop.parallel-helpers';

export function getContextFabricBlocker(
  directive: PulseAutonomousDirective,
  batchUnits: Array<{ leaseId?: string; contextDigest?: string }>,
): string | null {
  const contextFabric = directive.contextFabric;
  if (!contextFabric) {
    return 'PULSE context fabric is missing from the directive.';
  }
  if (contextFabric.staleContextBlocksExecution) {
    return `PULSE context fabric is stale: ${(contextFabric.blockers || []).join(', ') || 'unknown blocker'}.`;
  }
  if (
    contextFabric.contextBroadcastPass === false ||
    contextFabric.ownershipConflictPass === false ||
    contextFabric.protectedFilesForbiddenPass === false ||
    contextFabric.workerContextCompletenessPass === false
  ) {
    return 'PULSE context fabric gates are not passing for parallel worker execution.';
  }
  const digest = contextFabric.contextDigest;
  if (!digest) {
    return 'PULSE context fabric has no contextDigest.';
  }
  const missingLease = batchUnits.find(
    (unit) => !unit.leaseId || !unit.contextDigest || unit.contextDigest !== digest,
  );
  return missingLease
    ? 'Parallel worker selected without a valid lease and fresh contextDigest.'
    : null;
}
