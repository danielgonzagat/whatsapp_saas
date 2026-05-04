/**
 * Standalone type definitions for the PULSE artifact pipeline.
 * Living in a leaf module so artifacts.directive.ts and its sibling
 * helpers can both import the snapshot/paths shapes without forming a
 * circular dependency back to artifacts.ts.
 */
import type {
  PulseAgentOrchestrationState,
  PulseAutonomyState,
  PulseCapabilityState,
  PulseCertification,
  PulseCodebaseTruth,
  PulseCodacyEvidence,
  PulseConvergencePlan,
  PulseExecutionChainSet,
  PulseExecutionMatrix,
  PulseExternalSignalState,
  PulseFlowProjection,
  PulseHealth,
  PulseManifest,
  PulseParityGapsArtifact,
  PulseProductGraph,
  PulseProductVision,
  PulseResolvedManifest,
  PulseScopeState,
  PulseStructuralGraph,
  PulseGateResult,
} from './types';

/** Pulse artifact snapshot shape. */
export interface PulseArtifactSnapshot {
  health: PulseHealth;
  manifest: PulseManifest | null;
  codebaseTruth: PulseCodebaseTruth;
  resolvedManifest: PulseResolvedManifest;
  scopeState: PulseScopeState;
  codacyEvidence: PulseCodacyEvidence;
  structuralGraph: PulseStructuralGraph;
  executionChains: PulseExecutionChainSet;
  executionMatrix: PulseExecutionMatrix;
  productGraph: PulseProductGraph;
  capabilityState: PulseCapabilityState;
  flowProjection: PulseFlowProjection;
  parityGaps: PulseParityGapsArtifact;
  externalSignalState: PulseExternalSignalState;
  productVision: PulseProductVision;
  certification: PulseCertification;
  autonomyState?: PulseAutonomyState;
  agentOrchestrationState?: PulseAgentOrchestrationState;
  convergencePlan?: PulseConvergencePlan;
}

/** Pulse artifact paths shape. */
export interface PulseArtifactPaths {
  health: string;
  manifest: string;
  codebaseTruth: string;
  resolvedManifest: string;
  scopeState: string;
  structuralGraph: string;
  executionChains: string;
  executionMatrix: string;
  productGraph: string;
  capabilityState: string;
  flowProjection: string;
  parityGaps: string;
  externalSignalState: string;
  productVision: string;
  certification: string;
  machineReadiness: string;
  directive: string;
  report: string;
  artifactIndex: string;
}

/** PULSE-machine readiness criterion status. */
export type PulseMachineReadinessCriterionStatus = PulseGateResult['status'];

/** PULSE-machine readiness criterion shape. */
export interface PulseMachineReadinessCriterion {
  id:
    | 'bounded_run'
    | 'artifact_consistency'
    | 'execution_matrix'
    | 'critical_path_terminal'
    | 'breakpoint_precision'
    | 'external_reality'
    | 'self_trust'
    | 'multi_cycle';
  status: PulseMachineReadinessCriterionStatus;
  reason: string;
  evidence: Record<string, number | string | boolean | null>;
}

/** PULSE-machine readiness shape, intentionally distinct from product certification. */
export interface PulseMachineReadiness {
  scope: 'pulse_machine_not_kloel_product';
  status: 'READY' | 'NOT_READY';
  generatedAt: string;
  productCertificationStatus: PulseCertification['status'];
  productCertificationExcludedFromVerdict: true;
  canRunBoundedAutonomousCycle: boolean;
  canDeclareKloelProductCertified: boolean;
  criteria: PulseMachineReadinessCriterion[];
  blockers: string[];
}
