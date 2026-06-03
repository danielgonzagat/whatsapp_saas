export interface PulseCertificateGate {
  status: string;
  reason: string;
  failureClass?: string;
  affectedCapabilityIds?: string[];
  affectedFlowIds?: string[];
  evidenceMode?: string;
  confidence?: string;
}

export interface PulseCertificateNoHardcodedReality {
  artifact: string;
  version: number;
  generatedAt: string;
  operationalIdentity: string;
  scannedFiles: number;
  totalEvents: number;
  summary: {
    totalFindings: number;
    byKind: Record<string, number>;
    topFiles: Array<{ filePath: string; findings: number }>;
    totalPredicates: number;
    byPredicateKind: Record<string, number>;
  };
  hardcodeEvents: unknown[];
}

export interface PulseCertificate {
  projectId: string;
  projectName: string;
  commitSha: string;
  environment: string;
  timestamp: string;
  status: string;
  humanReplacementStatus: string;
  profile: unknown;
  certificationScope: unknown;
  score: number;
  rawScore: number;
  certificationTarget: {
    tier: unknown;
    final: boolean;
    profile: unknown;
    certificationScope: unknown;
  };
  blockingTier: number;
  gates: Record<string, PulseCertificateGate>;
  criticalFailures: string[];
  dynamicBlockingReasons: string[];
  noHardcodedRealityState: PulseCertificateNoHardcodedReality | null;
}

export interface BlockerEntry {
  rank: number;
  gate: string;
  severity: string;
  reason: string;
  failureClass: string;
}

export interface BlockerRank {
  schema: string;
  computedAt: string;
  pipeline: string;
  unifiedVerdict: string;
  totalBlockers: number;
  gateSummary: {
    total: number;
    pass: number;
    fail: number;
  };
  blockers: BlockerEntry[];
}

export type UnifiedVerdict = 'READY_FOR_PRODUCTION' | 'NOT_READY_FOR_PRODUCTION';

export interface ArtifactVerdict {
  path: string;
  verdict: string;
  source: string;
}

export interface RawPulseHealth {
  score: number;
  totalNodes: number;
  breaks: Array<{ type: string; severity: string; file: string; line: number; description: string }>;
}

export interface RawPulseWorldState {
  generatedAt: string;
  actorProfiles: string[];
  executedScenarios: string[];
  pendingAsyncExpectations: string[];
  entities: Record<string, unknown>;
  asyncExpectationsStatus: Array<{
    scenarioId: string;
    expectation: string;
    status: string;
  }>;
}

export interface RawPulseCodacyState {
  version: number;
  syncedAt: string;
  totalIssues: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  repositorySummary: {
    grade: number;
    gradeLetter: string;
    issuesCount: number;
    issuesPercentage: number;
  };
}
