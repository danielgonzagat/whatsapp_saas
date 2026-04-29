// PULSE Wave 5 — Production Proof Engine types

/** Status of a single proof dimension. */
export type ProofStatus = 'proven' | 'unproven' | 'failed' | 'stale' | 'not_required';

/** Per-capability production readiness proof. */
export interface ProductionProof {
  /** Capability being evaluated. */
  capabilityId: string;
  /** Whether this capability has an active deploy in the target environment. */
  deployStatus: ProofStatus;
  /** Whether the runtime health check returns OK. */
  healthCheck: ProofStatus;
  /** Whether at least one end-to-end scenario passed for this capability. */
  scenarioPass: ProofStatus;
  /** Whether runtime probes confirmed backend/frontend connectivity. */
  runtimeProbe: ProofStatus;
  /** Whether structured observability (logging, tracing, metrics) is configured. */
  observabilityCheck: ProofStatus;
  /** Whether there are no new unresolved Sentry issues since last deploy. */
  noSentryRegression: ProofStatus;
  /** Whether database mutations produced the expected side effects. */
  dbSideEffects: ProofStatus;
  /** Whether a rollback to the previous deploy version is possible. */
  rollbackPossible: ProofStatus;
  /** Whether the capability operates within its performance budget. */
  performanceBudget: ProofStatus;
  /** Aggregate status across all dimensions. */
  overallStatus: ProofStatus;
  /** ISO-8601 timestamp of last proven state, or null. */
  lastProven: string | null;
  /** Paths to evidence artifacts collected during proof evaluation. */
  evidencePaths: string[];
}

/** Full production proof state for all capabilities. */
export interface ProductionProofState {
  /** ISO-8601 timestamp when this state was generated. */
  generatedAt: string;
  /** Aggregate counts across all capabilities. */
  summary: {
    /** Total capabilities evaluated. */
    totalCapabilities: number;
    /** Capabilities with overallStatus = proven. */
    provenCapabilities: number;
    /** Capabilities with overallStatus = failed. */
    failedCapabilities: number;
    /** Capabilities with overallStatus = unproven. */
    unprovenCapabilities: number;
    /** Percentage of capabilities that are proven (0–100). */
    coveragePercent: number;
  };
  /** Per-capability proof evaluations. */
  proofs: ProductionProof[];
  /** Ordered deploy history for the target environment. */
  deployHistory: Array<{
    /** ISO-8601 timestamp of deploy. */
    timestamp: string;
    /** Target environment name. */
    environment: string;
    /** Deployed version identifier. */
    version: string;
    /** Deploy outcome. */
    status: string;
  }>;
}
