/**
 * Standalone type definitions for the PULSE artifact pipeline.
 * Living in a leaf module so artifacts.directive.ts and its sibling
 * helpers can both import the snapshot/paths shapes without forming a
 * circular dependency back to artifacts.ts.
 */
import type { PulseAgentOrchestrationState, PulseAutonomyState } from './types.autonomy';
import type { PulseCapabilityState } from './types.capabilities/03-capability';
import type { PulseExternalSignalState } from './types.capabilities/05-external-signals';
import type { PulseFlowProjection } from './types.capabilities/04-flow-projection';
import type { PulseParityGapsArtifact } from './types.capabilities.parity';
import type { PulseCertification, PulseGateResult } from './types.evidence';
import type { PulseCodebaseTruth } from './types.truth';
import type { PulseCodacyEvidence, PulseStructuralGraph } from './types.structural';
import type { PulseConvergencePlan } from './types.convergence';
import type { PulseExecutionChainSet, PulseProductGraph } from './types.product-graph';
import type { PulseExecutionMatrix } from './types.execution-matrix';
import type { PulseHealth } from './types.health';
import type { PulseManifest } from './types.manifest';
import type { PulseProductVision } from './types.product-vision';
import type { PulseResolvedManifest } from './types.resolved-manifest';
import type { PulseScopeState } from './types.truth.scope';

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
