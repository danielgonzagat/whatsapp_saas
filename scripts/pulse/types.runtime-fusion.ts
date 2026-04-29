export type SignalSource =
  | 'sentry'
  | 'datadog'
  | 'prometheus'
  | 'github_actions'
  | 'codecov'
  | 'gitnexus'
  | 'otel_runtime';
export type SignalType =
  | 'error'
  | 'latency'
  | 'throughput'
  | 'error_rate'
  | 'saturation'
  | 'deploy_failure'
  | 'test_failure'
  | 'graph_staleness';
export type SignalSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type SignalAction =
  | 'block_merge'
  | 'block_deploy'
  | 'prioritize_fix'
  | 'create_issue'
  | 'log_only';

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
  firstSeen: string;
  lastSeen: string;
  count: number;
  trend: 'worsening' | 'stable' | 'improving' | 'unknown';
  pinned: boolean; // prevents auto-close
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
  priorityOverrides: Array<{
    capabilityId: string;
    originalPriority: string;
    newPriority: string;
    reason: string;
  }>;
}
