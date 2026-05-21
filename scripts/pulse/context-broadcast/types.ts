import { discoverAllObservedArtifactFilenames } from '../dynamic-reality-kernel/token-evidence';
import { discoverConvergenceExecutionModeLabels } from '../__kernel_additions__/discoverConvergenceExecutionModeLabels';

type SnapshotStatus = 'ready' | 'missing' | 'stale' | 'invalid';
type LeaseStatus = 'active' | 'expired' | 'released' | 'conflicted';
type GitNexusSourceMode = 'local_files' | 'cli' | 'missing';

let _artifactFilenames: ReturnType<typeof discoverAllObservedArtifactFilenames> | null = null;
export function artifactFilenames() {
  if (!_artifactFilenames) _artifactFilenames = discoverAllObservedArtifactFilenames();
  return _artifactFilenames;
}

export function isAiSafeExecutionMode(mode: string): boolean {
  return discoverConvergenceExecutionModeLabels().has(mode) && mode === 'ai_safe';
}

interface ProtectedGovernanceConfig {
  protectedExact: string[];
  protectedPrefixes: string[];
}

interface PulseContextSnapshot {
  provider: 'gitnexus' | 'beads';
  status: SnapshotStatus;
  generatedAt: string;
  ref: string;
  currentCommit: string | null;
  sourceMode: GitNexusSourceMode;
  summary: string;
  warnings: string[];
  errors: string[];
  metadata: Record<string, string | number | boolean | null>;
}

export interface WorkerContextEnvelope {
  workerId: string;
  workstreamId: string;
  unitId: string;
  leaseId: string;
  leaseStatus: LeaseStatus;
  leaseExpiresAt: string;
  contextDigest: string;
  ownedFiles: string[];
  readOnlyFiles: string[];
  forbiddenFiles: string[];
  affectedCapabilities: string[];
  affectedFlows: string[];
  gitnexusDelta: PulseContextSnapshot;
  beadsDelta: PulseContextSnapshot;
  validationContract: string[];
  stopConditions: string[];
}

export interface PulseWorkerLease {
  leaseId: string;
  workerId: string;
  unitId: string;
  ownedFiles: string[];
  readOnlyFiles: string[];
  forbiddenFiles: string[];
  expiresAt: string;
  status: LeaseStatus;
  conflictReasons: string[];
}

export interface PulseContextBroadcast {
  generatedAt: string;
  runId: string;
  contextDigest: string;
  gitnexusRef: string;
  beadsRef: string;
  directiveRef: string;
  certificateRef: string;
  workers: WorkerContextEnvelope[];
}

export interface PulseContextDelta {
  generatedAt: string;
  runId: string;
  contextDigest: string;
  previousDigest: string | null;
  changed: boolean;
  staleContextBlocksExecution: boolean;
  blockers: string[];
}

export interface PulseContextFabricBundle {
  artifactRefs: {
    contextBroadcast: string;
    workerLeases: string;
    gitnexusState: string;
    beadsState: string;
  };
  gitnexusState: PulseContextSnapshot;
  beadsState: PulseContextSnapshot;
  broadcast: PulseContextBroadcast;
  leases: {
    generatedAt: string;
    runId: string;
    contextDigest: string;
    ttlMinutes: number;
    leases: PulseWorkerLease[];
    ownershipConflictPass: boolean;
    protectedFilesForbiddenPass: boolean;
  };
  delta: PulseContextDelta;
}

export const CONTEXT_TTL_MINUTES = 30;
export const DEFAULT_WORKER_COUNT = 10;

export type {
  SnapshotStatus,
  LeaseStatus,
  GitNexusSourceMode,
  ProtectedGovernanceConfig,
  PulseContextSnapshot,
};
