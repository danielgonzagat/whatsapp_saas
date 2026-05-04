import { buildDecisionQueue, type QueueUnit } from '../../artifacts.queue';
import {
  readProtectedGovernanceConfig,
  isProtectedFile,
  protectedForbiddenFiles,
} from './governance';
import {
  buildContextDigest,
  loadPreviousContextDigest,
  normalizeLeasePath,
  sha256,
  uniqueLeasePaths,
  uniqueStrings,
} from './utils';
import { buildGitNexusSnapshot } from './gitnexus-snapshot';
import { buildBeadsSnapshot } from './beads-snapshot';
import type { PulseContextFabricBundle, PulseWorkerLease, WorkerContextEnvelope } from './types';
import type { PulseArtifactRegistry } from '../../artifact-registry';
import type { PulseConvergencePlan } from '../../types';

const CONTEXT_TTL_MINUTES = 30;
const DEFAULT_WORKER_COUNT = 10;

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
    unit.executionMode !== 'ai_safe' ? 'Unit is not ai_safe.' : '',
  ]);
}

function leaseId(runId: string, workerId: string, unitId: string): string {
  return `lease-${sha256({ runId, workerId, unitId }).slice(0, 18)}`;
}

function workerId(index: number): string {
  return `pulse-worker-${String(index + 1).padStart(2, '0')}`;
}

function workstreamId(unit: QueueUnit): string {
  return `${unit.kind}:${unit.ownerLane}`;
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
    .filter((unit) => unit.executionMode === 'ai_safe')
    .slice(0, input.workerCount ?? DEFAULT_WORKER_COUNT);
  const directiveRef = `PULSE_CLI_DIRECTIVE.json#${sha256(input.directiveContent).slice(0, 16)}`;
  const certificateRef = `PULSE_CERTIFICATE.json#${sha256(input.certificateContent).slice(0, 16)}`;
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
      'PULSE_CONTEXT_BROADCAST.json',
      'PULSE_WORKER_LEASES.json',
      'PULSE_GITNEXUS_STATE.json',
      'PULSE_BEADS_STATE.json',
    ]);
    const conflictReasons =
      duplicateReadOnly.length > 0
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
            workers.filter((candidate) => candidate.ownedFiles.includes(filePath)).length === 1,
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
