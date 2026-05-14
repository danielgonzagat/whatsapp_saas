/**
 * UTP-ABI-005 — A/B telemetry types for ABI substitution decisions.
 *
 * Implements PCI.2 §8 (docs/contracts/pci/02-abi-schema.md) and E.14.
 *
 * AbExperimentSample records a single observation from either the legacy
 * system-prompt path or the ABI-substitution path. Samples are buffered
 * in-memory and consumed by the AbiAbTelemetryService for delta reporting
 * and rollback signaling.
 */
export interface AbExperimentSample {
  readonly sampleId: string;
  readonly flowName: string;
  readonly abiUsed: boolean;
  readonly latencyMs: number;
  readonly success: boolean;
  readonly collectedAt: string;
  readonly workspaceId?: string;
}

export interface AbDeltaReport {
  readonly flowName: string;
  readonly legacy: {
    readonly count: number;
    readonly successRate: number;
    readonly latencyP50Ms: number;
    readonly latencyP95Ms: number;
  };
  readonly abi: {
    readonly count: number;
    readonly successRate: number;
    readonly latencyP50Ms: number;
    readonly latencyP95Ms: number;
  };
  readonly computedAt: string;
}

export interface AbRollbackDecision {
  readonly shouldRollback: boolean;
  readonly reason?: string;
  readonly delta: AbDeltaReport;
  readonly computedAt: string;
}

export interface AbRollbackOptions {
  readonly minSamplesPerPath?: number;
  readonly maxSuccessRateGapPct?: number;
  readonly maxLatencyP95Multiplier?: number;
}
