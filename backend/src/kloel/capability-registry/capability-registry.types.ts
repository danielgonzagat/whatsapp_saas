export type CapabilityMaturity = 'developing' | 'operational' | 'productionReady';

export interface PromoteCriteria {
  consecutivePulseGreenCycles: number;
  runtimeEvidencePct: number;
  rCriterionDelta?: number;
  rCriterionThresholdReached?: boolean;
}

export interface AuditEntry {
  timestamp: string;
  action: 'promoted' | 'demoted';
  from: CapabilityMaturity;
  to: CapabilityMaturity;
  reason?: string;
}

export interface CapabilityRecord {
  id: string;
  maturity: CapabilityMaturity;
  runtimeEvidencePct: number;
  lastInvokedAt: string | null;
  invokeCount: number;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  auditTrail: AuditEntry[];
}

export type InvocationOutcome = 'success' | 'failure';

export interface CapabilityRegistrySnapshot {
  readonly records: readonly CapabilityRecord[];
  readonly snapshotAt: string;
}
