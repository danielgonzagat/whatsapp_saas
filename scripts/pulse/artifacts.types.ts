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
  productGraph: string;
  capabilityState: string;
  flowProjection: string;
  parityGaps: string;
  externalSignalState: string;
  productVision: string;
  certification: string;
  directive: string;
  report: string;
  artifactIndex: string;
}
