type SnapshotStatus = 'ready' | 'missing' | 'stale' | 'invalid';
type LeaseStatus = 'active' | 'expired' | 'released' | 'conflicted';
type GitNexusSourceMode = 'local_files' | 'cli' | 'missing';

export interface ProtectedGovernanceConfig {
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
