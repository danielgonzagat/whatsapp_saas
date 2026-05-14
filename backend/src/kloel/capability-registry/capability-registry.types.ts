export type CapabilityMaturity = 'developing' | 'operational' | 'productionReady';

export interface CapabilityRecord {
  id: string;
  maturity: CapabilityMaturity;
  runtimeEvidencePct: number;
  lastInvokedAt: string | null;
  invokeCount: number;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
}

export type InvocationOutcome = 'success' | 'failure';

export interface CapabilityRegistrySnapshot {
  readonly records: readonly CapabilityRecord[];
  readonly snapshotAt: string;
}
