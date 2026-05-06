/**
 * PULSE Definition-of-Done Engine — type definitions.
 *
 * Defines the gate-level and engine-level APIs for the Capability DoD Engine
 * that evaluates every discovered capability against objective, evidence-backed
 * Definition-of-Done criteria across UI, API, service, persistence, side effects,
 * testing, runtime observation, observability, security, and recovery dimensions.
 *
 * Capabilities are classified into four maturity levels:
 *   - phantom: inferred only (no structural evidence beyond node inference)
 *   - latent:   some structural evidence, no runtime observation
 *   - real:     structural evidence + runtime observation confirmed
 *   - production: all DoD gates met (blocking + required + optional)
 *
 * The engine outputs two artifacts:
 *   - PULSE_DOD_ENGINE.json — per-capability gate evaluation
 *   - PULSE_DOD_STATE.json  — full classification state with scoring
 */

export type DoDGateStatus = 'pass' | 'fail' | 'not_applicable' | 'not_tested';
export type DoDOverallStatus = 'done' | 'partial' | 'blocked' | 'not_started';

/** Capability risk level used to determine DoD gate strictness. */
export type DoDRiskLevel = 'critical' | 'high' | 'medium' | 'low';

/** Four-level capability classification: phantom → latent → real → production. */
export type DoDCapabilityClassification = 'phantom' | 'latent' | 'real' | 'production';

/** Requirement strictness per risk level. */
export type DoDRequirementMode = 'required' | 'optional' | 'not_required';

export interface DoDGate {
  name: string;
  description: string;
  status: DoDGateStatus;
  evidence: string[];
  required: boolean;
  blocking: boolean;
}

export interface CapabilityDoD {
  capabilityId: string;
  capabilityName: string;
  overallStatus: DoDOverallStatus;
  gates: DoDGate[];
  blockingGates: string[];
  missingEvidence: string[];
  requiredBeforeReal: string[];
  lastEvaluated: string;
  confidence: number;
}

export interface DoDEngineState {
  generatedAt: string;
  summary: {
    totalCapabilities: number;
    doneCapabilities: number;
    partialCapabilities: number;
    blockedCapabilities: number;
    notStartedCapabilities: number;
    criticalCapabilities: number;
    criticalCapabilitiesDone: number;
  };
  evaluations: CapabilityDoD[];
}

// ── PULSE_DOD_STATE types ─────────────────────────────────────────────────

/** Per-gate requirement tuned by capability risk level. */
export interface DoDRiskGateSpec {
  name: string;
  description: string;
  critical: DoDRequirementMode;
  high: DoDRequirementMode;
  medium: DoDRequirementMode;
  low: DoDRequirementMode;
  blocking: boolean;
}

/** Per-capability classification entry written to PULSE_DOD_STATE.json. */
export interface DoDCapabilityEntry {
  capabilityId: string;
  capabilityName: string;
  riskLevel: DoDRiskLevel;
  classification: DoDCapabilityClassification;
  score: number;
  maxScore: number;
  passedGates: number;
  totalGates: number;
  gates: DoDGate[];
  structuralChecks: Record<string, boolean>;
  requiredBeforeProduction: string[];
  lastEvaluated: string;
}

/** Summary counts for each classification tier. */
export interface DoDStateSummary {
  totalCapabilities: number;
  phantom: number;
  latent: number;
  real: number;
  production: number;
  byRiskLevel: Record<DoDRiskLevel, number>;
  overallScore: number;
  overallMaxScore: number;
}

/** Full DoD state artifact written to PULSE_DOD_STATE.json. */
export interface DoDState {
  generatedAt: string;
  summary: DoDStateSummary;
  capabilities: DoDCapabilityEntry[];
}
