import type { PulseHealth } from '../types.health';
import type { PulseManifest } from '../types.manifest';
import type { PulseCodebaseTruth } from '../types.truth';
import type { PulseResolvedManifest } from '../types.resolved-manifest';
import type { PulseScopeState } from '../types.truth.scope';
import type { PulseCodacyEvidence, PulseStructuralGraph } from '../types.structural';
import type { PulseExecutionChainSet, PulseProductGraph } from '../types.product-graph';
import type { PulseExecutionMatrix } from '../types.execution-matrix';
import type { PulseCapabilityState } from '../types.capabilities/03-capability';
import type { PulseFlowProjection } from '../types.capabilities/04-flow-projection';
import type { PulseParityGapsArtifact } from '../types.capabilities.parity';
import type { PulseExternalSignalState } from '../types.capabilities/05-external-signals';
import type { PulseProductVision } from '../types.product-vision';
import type { PulseCertification } from '../types.evidence';
import type { PulseArtifactRegistry } from '../artifact-registry/discovery';

/** Pulse artifact snapshot shape. */
export interface PulseArtifactSnapshot {
  /** Health property. */
  health: PulseHealth;
  /** Manifest property. */
  manifest: PulseManifest | null;
  /** Codebase truth property. */
  codebaseTruth: PulseCodebaseTruth;
  /** Resolved manifest property. */
  resolvedManifest: PulseResolvedManifest;
  /** Scope state property. */
  scopeState: PulseScopeState;
  /** Codacy evidence property. */
  codacyEvidence: PulseCodacyEvidence;
  /** Structural graph property. */
  structuralGraph: PulseStructuralGraph;
  /** Execution chains property. */
  executionChains: PulseExecutionChainSet;
  /** Execution matrix property. */
  executionMatrix: PulseExecutionMatrix;
  /** Product graph property. */
  productGraph: PulseProductGraph;
  /** Capability state property. */
  capabilityState: PulseCapabilityState;
  /** Flow projection property. */
  flowProjection: PulseFlowProjection;
  /** Parity gaps property. */
  parityGaps: PulseParityGapsArtifact;
  /** External signal state property. */
  externalSignalState: PulseExternalSignalState;
  /** Product vision property. */
  productVision: PulseProductVision;
  /** Certification property. */
  certification: PulseCertification;
}

/** Pulse artifact paths shape. */
export interface PulseArtifactPaths {
  /** Canonical report path property. */
  reportPath: string;
  /** Canonical certificate path property. */
  certificatePath: string;
  /** Canonical machine-readiness path property. */
  machineReadinessPath: string;
  /** Canonical directive path property. */
  cliDirectivePath: string;
  /** Canonical artifact index path property. */
  artifactIndexPath: string;
}

// Re-export PulseArtifactRegistry for consumers that import it from here.
export type { PulseArtifactRegistry };
