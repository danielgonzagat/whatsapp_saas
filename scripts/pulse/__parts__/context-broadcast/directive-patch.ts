import type { PulseContextFabricBundle } from './types';
const DEFAULT_WORKER_COUNT = 10;
export function buildDirectiveContextFabricPatch(
  bundle: PulseContextFabricBundle,
): Record<string, unknown> {
  return {
    broadcastRef: 'PULSE_CONTEXT_BROADCAST.json',
    leasesRef: 'PULSE_WORKER_LEASES.json',
    gitnexusRef: bundle.broadcast.gitnexusRef,
    beadsRef: bundle.broadcast.beadsRef,
    contextDigest: bundle.broadcast.contextDigest,
    workerEnvelopeCount: bundle.broadcast.workers.length,
    contextBroadcastPass: bundle.broadcast.workers.length >= DEFAULT_WORKER_COUNT,
    ownershipConflictPass: bundle.leases.ownershipConflictPass,
    protectedFilesForbiddenPass: bundle.leases.protectedFilesForbiddenPass,
    workerContextCompletenessPass: bundle.broadcast.workers.every(
      (worker) =>
        worker.leaseId &&
        worker.contextDigest &&
        worker.validationContract.length > 0 &&
        worker.stopConditions.length > 0,
    ),
    staleContextBlocksExecution: bundle.delta.staleContextBlocksExecution,
    blockers: bundle.delta.blockers,
  };
}
