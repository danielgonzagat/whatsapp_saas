export type SignalSource =
  | 'github'
  | 'sentry'
  | 'datadog'
  | 'prometheus'
  | 'github_actions'
  | 'codacy'
  | 'codecov'
  | 'dependabot'
  | 'gitnexus'
  | 'otel_runtime';
export type SignalType =
  | 'runtime'
  | 'error'
  | 'latency'
  | 'throughput'
  | 'error_rate'
  | 'saturation'
  | 'deploy_failure'
  | 'test_failure'
  | 'graph_staleness'
  | 'static'
  | 'code_quality'
  | 'change'
  | 'dependency'
  | 'external';
export type OperationalEvidenceKind = 'runtime' | 'change' | 'static' | 'dependency' | 'external';
export type SignalSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type SignalAction =
  | 'block_merge'
  | 'block_deploy'
  | 'prioritize_fix'
  | 'create_issue'
  | 'log_only';
export type RuntimeSignalEvidenceMode =
  | 'observed'
  | 'inferred'
  | 'simulated'
  | 'not_available'
  | 'skipped';

export type RuntimeFusionEvidenceStatus =
  | 'observed'
  | 'inferred'
  | 'simulated'
  | 'not_available'
  | 'skipped'
  | 'invalid';

export type RuntimeFusionTruthMode = 'observed' | 'inferred' | 'not_available';

export interface RuntimeFusionMachineImprovementSignal {
  id: string;
  targetEngine: 'external-sources-orchestrator' | 'otel-runtime' | 'runtime-fusion';
  missingEvidence: 'external_signal' | 'runtime_trace' | 'adapter_status';
  truthMode: RuntimeFusionTruthMode;
  sourceStatus: RuntimeFusionEvidenceStatus | string;
  artifactPath: string;
  reason: string;
  recommendedPulseAction: string;
  productEditRequired: false;
}

export interface RuntimeSignal {
  id: string;
  source: SignalSource;
  type: SignalType;
  severity: SignalSeverity;
  action: SignalAction;
  message: string;
  affectedCapabilityIds: string[];
  affectedFlowIds: string[];
  affectedFilePaths: string[];
  frequency: number;
  affectedUsers: number;
  impactScore: number; // 0..1
  confidence: number; // 0..1
  evidenceKind: OperationalEvidenceKind;
  firstSeen: string;
  lastSeen: string;
  count: number;
  trend: 'worsening' | 'stable' | 'improving' | 'unknown';
  pinned: boolean; // prevents auto-close
  evidenceMode?: RuntimeSignalEvidenceMode;
  sourceArtifact?: string;
  observedAt?: string | null;
  affectedCapabilities?: string[];
  affectedFlows?: string[];
}

export interface RuntimeFusionState {
  generatedAt: string;
  signals: RuntimeSignal[];
  summary: {
    totalSignals: number;
    criticalSignals: number;
    highSignals: number;
    blockMergeSignals: number;
    blockDeploySignals: number;
    sourceCounts: Record<SignalSource, number>;
    signalsByCapability: Record<string, number>;
    signalsByFlow: Record<string, number>;
    topImpactCapabilities: Array<{ capabilityId: string; impactScore: number }>;
    topImpactFlows: Array<{ flowId: string; impactScore: number }>;
  };
  evidence: {
    externalSignalState: {
      status: RuntimeFusionEvidenceStatus;
      artifactPath: string;
      totalSignals: number;
      observedSignals: number;
      inferredSignals: number;
      adapterStatusCounts: Record<string, number>;
      notAvailableAdapters: string[];
      skippedAdapters: string[];
      staleAdapters: string[];
      invalidAdapters: string[];
      reason: string;
    };
    runtimeTraces: {
      status: RuntimeFusionEvidenceStatus;
      artifactPath: string;
      source: string | null;
      totalTraces: number;
      totalSpans: number;
      errorTraces: number;
      derivedSignals: number;
      reason: string;
    };
  };
  priorityOverrides: Array<{
    capabilityId: string;
    originalPriority: string;
    newPriority: string;
    reason: string;
  }>;
  machineImprovementSignals: RuntimeFusionMachineImprovementSignal[];
}
