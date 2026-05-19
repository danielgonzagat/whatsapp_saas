/**
 * UTP-ABI-005/006 — A/B telemetry types for ABI substitution decisions.
 *
 * Implements PCI.2 §8 (docs/contracts/pci/02-abi-schema.md) and E.14.
 *
 * AbExperimentSample records a single observation from either the legacy
 * system-prompt path or the ABI-substitution path. Samples are buffered
 * in-memory and consumed by the AbiAbTelemetryService for delta reporting
 * and rollback signaling.
 *
 * AbHarnessRecord extends the concept for the AbiAbHarnessService, adding
 * hallucinated-fact tracking, commercial-outcome proxies, and token counts
 * needed for R-tier delta projection and promote_variant_to_default decisions.
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

export interface AbClaimEvidence {
  readonly claim: string;
  readonly hasProof: boolean;
  readonly proofSource: string | null;
}

export interface AbCommercialOutcome {
  readonly conversionSignal: boolean;
  readonly satisfactionSignal: boolean | null;
}

export interface AbHarnessRecord {
  readonly recordId: string;
  readonly workspaceId: string;
  readonly userMessage: string;
  readonly abiUsed: boolean;
  readonly latencyMs: number;
  readonly tokensUsed: number;
  readonly success: boolean;
  readonly claims: AbClaimEvidence[];
  readonly commercialOutcome: AbCommercialOutcome | null;
  readonly collectedAt: string;
}

export type AbRCriterionName =
  | 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9' | 'R10'
  | 'R11' | 'R12' | 'R13' | 'R14' | 'R15' | 'R16' | 'R17' | 'R18' | 'R19' | 'R20'
  | 'R21' | 'R22' | 'R23' | 'R24' | 'R25' | 'R26' | 'R27' | 'R28' | 'R29' | 'R30'
  | 'R31' | 'R32' | 'R33' | 'R34' | 'R35' | 'R36' | 'R37' | 'R38';

export interface AbRCriterionDescriptor {
  readonly name: AbRCriterionName;
  readonly family: string;
  readonly description: string;
}

export interface AbRCriterionDelta {
  readonly criterion: AbRCriterionDescriptor;
  readonly baselineScore: number;
  readonly variantScore: number;
  readonly delta: number;
  readonly direction: 'improved' | 'regressed' | 'unchanged';
}

export interface AbPromotionDecision {
  readonly promoteVariantToDefault: boolean;
  readonly reason: string;
  readonly workspaceId: string;
  readonly sampleSize: number;
  readonly minSamplesRequired: number;
  readonly criteriaImproved: number;
  readonly criteriaRegressed: number;
  readonly criteriaUnchanged: number;
  readonly totalCriteria: number;
  readonly deltas: AbRCriterionDelta[];
  readonly computedAt: string;
}

export interface AbPathRunnerResult {
  readonly success: boolean;
  readonly latencyMs: number;
  readonly tokensUsed: number;
  readonly responseText: string;
}

export type AbPathRunnerFn = (params: {
  readonly workspaceId: string;
  readonly userMessage: string;
  readonly useAbi: boolean;
}) => Promise<AbPathRunnerResult>;

export type AbCommercialOutcomeDetectorFn = (params: {
  readonly responseText: string;
  readonly workspaceId: string;
}) => AbCommercialOutcome | null;
