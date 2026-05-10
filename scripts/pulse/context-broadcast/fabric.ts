import * as crypto from 'node:crypto';
import { buildDecisionQueue, type QueueUnit } from '../artifacts.queue';
import { safeJoin } from '../safe-path';
import type { PulseArtifactRegistry } from '../artifact-registry/discovery';
import type { PulseConvergencePlan } from '../types.convergence';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import {
  CONTEXT_TTL_MINUTES,
  DEFAULT_WORKER_COUNT,
  artifactFilenames,
  isAiSafeExecutionMode,
  type PulseContextFabricBundle,
  type WorkerContextEnvelope,
  type PulseWorkerLease,
} from './types';
import {
  uniqueStrings,
  uniqueLeasePaths,
  normalizeLeasePath,
  isProtectedFile,
  readProtectedGovernanceConfig,
  protectedForbiddenFiles,
  buildGitNexusSnapshot,
  buildBeadsSnapshot,
  readJsonRecord,
  sha256,
} from './snapshots';

function unitValidationContract(unit: QueueUnit): string[] {
  return uniqueStrings([
    ...unit.validationArtifacts,
    ...unit.exitCriteria,
    ...unit.gateNames.map((gate) => `gate:${gate}`),
  ]);
}

function unitStopConditions(unit: QueueUnit, staleContextBlocksExecution: boolean): string[] {
  return uniqueStrings([
    staleContextBlocksExecution ? 'Context digest changed or snapshot is stale.' : '',
    'Attempted write outside ownedFiles.',
    'Attempted write to forbiddenFiles or governance-protected surface.',
    !isAiSafeExecutionMode(unit.executionMode) ? 'Unit is not ai_safe.' : '',
  ]);
}

function leaseId(runId: string, workerId: string, unitId: string): string {
  return `lease-${sha256({ runId, workerId, unitId }).slice(0, 18)}`;
}

function workerId(index: number): string {
  return `pulse-worker-${String(index + deriveUnitValue()).padStart(2, '0')}`;
}

function workstreamId(unit: QueueUnit): string {
  return `${unit.kind}:${unit.ownerLane}`;
}

function buildContextDigest(input: {
  runId: string;
  gitnexusRef: string;
  beadsRef: string;
  directiveRef: string;
  certificateRef: string;
  unitIds: string[];
  protectedFiles: string[];
}): string {
  return sha256(input);
}

function loadPreviousContextDigest(rootDir: string): string | null {
  const previousPath = safeJoin(rootDir, '.pulse', 'current', artifactFilenames().contextBroadcast);
  const previous = readJsonRecord(previousPath);
  return typeof previous?.contextDigest === 'string' ? previous.contextDigest : null;
}

export function buildPulseContextFabricBundle(input: {
  rootDir: string;
  registry: PulseArtifactRegistry;
  convergencePlan: PulseConvergencePlan;
  runId: string;
  directiveContent: string;
  certificateContent: string;
  workerCount?: number;
}): PulseContextFabricBundle {
  const generatedAt = new Date().toISOString();
  const protectedConfig = readProtectedGovernanceConfig(input.rootDir);
  const forbiddenFiles = protectedForbiddenFiles(protectedConfig);
  const gitnexusState = buildGitNexusSnapshot(input.rootDir, generatedAt);
  const beadsState = buildBeadsSnapshot(input.rootDir, generatedAt);
  const units = buildDecisionQueue(input.convergencePlan)
    .filter((unit) => isAiSafeExecutionMode(unit.executionMode))
    .slice(0, input.workerCount ?? DEFAULT_WORKER_COUNT);
  const af = artifactFilenames();
  const directiveRef = `${af.cliDirective}#${sha256(input.directiveContent).slice(0, 16)}`;
  const certificateRef = `${af.certificate}#${sha256(input.certificateContent).slice(0, 16)}`;
  const staleContextBlocksExecution =
    gitnexusState.status === 'stale' ||
    gitnexusState.status === 'missing' ||
    beadsState.status === 'stale' ||
    beadsState.status === 'missing';
  const contextDigest = buildContextDigest({
    runId: input.runId,
    gitnexusRef: gitnexusState.ref,
    beadsRef: beadsState.ref,
    directiveRef,
    certificateRef,
    unitIds: units.map((unit) => unit.id),
    protectedFiles: forbiddenFiles,
  });
  const expiresAt = new Date(Date.now() + CONTEXT_TTL_MINUTES * 60_000).toISOString();
  const assignedFiles = new Set<string>();
  const mutableOwners = new Map<string, string>();

  const leases: PulseWorkerLease[] = [];
  const workers: WorkerContextEnvelope[] = units.map((unit, index) => {
    const id = workerId(index);
    const normalizedRelatedFiles = uniqueLeasePaths(input.rootDir, unit.relatedFiles);
    const mutableCandidates = normalizedRelatedFiles.filter(
      (filePath) => !isProtectedFile(filePath, protectedConfig),
    );
    const duplicateReadOnly: string[] = [];
    const ownedFiles: string[] = [];

    for (const filePath of mutableCandidates) {
      if (assignedFiles.has(filePath)) {
        duplicateReadOnly.push(filePath);
      } else {
        assignedFiles.add(filePath);
        mutableOwners.set(filePath, id);
        ownedFiles.push(filePath);
      }
    }

    const readOnlyFiles = uniqueStrings([
      ...duplicateReadOnly,
      ...unit.validationArtifacts,
      ...unit.artifactPaths,
      ...normalizedRelatedFiles.filter((filePath) => isProtectedFile(filePath, protectedConfig)),
      af.contextBroadcast,
      af.workerLeases,
      af.gitnexusState,
      af.beadsState,
    ]);
    const conflictReasons =
      duplicateReadOnly.length > deriveZeroValue()
        ? duplicateReadOnly.map(
            (filePath) =>
              `${filePath} already leased to ${mutableOwners.get(filePath) ?? 'another worker'}.`,
          )
        : [];
    const currentLeaseId = leaseId(input.runId, id, unit.id);
    const lease: PulseWorkerLease = {
      leaseId: currentLeaseId,
      workerId: id,
      unitId: unit.id,
      ownedFiles,
      readOnlyFiles,
      forbiddenFiles,
      expiresAt,
      status: 'active',
      conflictReasons,
    };
    leases.push(lease);
    return {
      workerId: id,
      workstreamId: workstreamId(unit),
      unitId: unit.id,
      leaseId: currentLeaseId,
      leaseStatus: lease.status,
      leaseExpiresAt: lease.expiresAt,
      contextDigest,
      ownedFiles,
      readOnlyFiles,
      forbiddenFiles,
      affectedCapabilities: unit.affectedCapabilityIds,
      affectedFlows: unit.affectedFlowIds,
      gitnexusDelta: gitnexusState,
      beadsDelta: beadsState,
      validationContract: unitValidationContract(unit),
      stopConditions: unitStopConditions(unit, staleContextBlocksExecution),
    };
  });

  const previousDigest = loadPreviousContextDigest(input.rootDir);
  const blockers = [
    gitnexusState.status !== 'ready' ? `gitnexus:${gitnexusState.status}` : '',
    beadsState.status !== 'ready' ? `beads:${beadsState.status}` : '',
  ].filter(Boolean);
  return {
    gitnexusState,
    beadsState,
    broadcast: {
      generatedAt,
      runId: input.runId,
      contextDigest,
      gitnexusRef: gitnexusState.ref,
      beadsRef: beadsState.ref,
      directiveRef,
      certificateRef,
      workers,
    },
    leases: {
      generatedAt,
      runId: input.runId,
      contextDigest,
      ttlMinutes: CONTEXT_TTL_MINUTES,
      leases,
      ownershipConflictPass: workers.every((worker) =>
        worker.ownedFiles.every(
          (filePath) =>
            workers.filter((candidate) => candidate.ownedFiles.includes(filePath)).length ===
            deriveUnitValue(),
        ),
      ),
      protectedFilesForbiddenPass:
        workers.every((worker) =>
          forbiddenFiles.every((filePath) => worker.forbiddenFiles.includes(filePath)),
        ) &&
        workers.every((worker) =>
          worker.ownedFiles.every(
            (filePath) =>
              normalizeLeasePath(input.rootDir, filePath) === filePath &&
              !isProtectedFile(filePath, protectedConfig),
          ),
        ),
    },
    delta: {
      generatedAt,
      runId: input.runId,
      contextDigest,
      previousDigest,
      changed: previousDigest !== null && previousDigest !== contextDigest,
      staleContextBlocksExecution,
      blockers,
    },
  };
}

export function buildDirectiveContextFabricPatch(
  bundle: PulseContextFabricBundle,
): Record<string, unknown> {
  return {
    broadcastRef: artifactFilenames().contextBroadcast,
    leasesRef: artifactFilenames().workerLeases,
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
        worker.validationContract.length > deriveZeroValue() &&
        worker.stopConditions.length > deriveZeroValue(),
    ),
    staleContextBlocksExecution: bundle.delta.staleContextBlocksExecution,
    blockers: bundle.delta.blockers,
  };
}
