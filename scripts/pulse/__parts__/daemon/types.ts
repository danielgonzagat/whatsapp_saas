import type {
  Break,
  PulseCapabilityState,
  PulseCodebaseTruth,
  PulseCodacyEvidence,
  PulseCertification,
  PulseConfig,
  PulseExternalSignalState,
  PulseExecutionMatrix,
  PulseFlowProjection,
  PulseHealth,
  PulseManifest,
  PulseManifestLoadResult,
  PulseParityGapsArtifact,
  PulseParserInventory,
  PulseProductGraph,
  PulseProductVision,
  PulseResolvedManifest,
  PulseScopeState,
  PulseStructuralGraph,
} from '../../types';
import type { PulseExecutionChainSet } from '../../types.product-graph';
import type { CoreParserData } from '../../functional-map-types';
import type { PulseExecutionTracer } from '../../execution-trace';

/** Full scan result. */
export interface FullScanResult {
  /** Capability state. */
  capabilityState: PulseCapabilityState;
  /** Certification. */
  certification: PulseCertification;
  /** Codebase truth. */
  codebaseTruth: PulseCodebaseTruth;
  /** Codacy evidence. */
  codacyEvidence: PulseCodacyEvidence;
  /** Core data. */
  coreData: CoreParserData;
  /** Execution chains. */
  executionChains: PulseExecutionChainSet;
  /** Execution matrix. */
  executionMatrix: PulseExecutionMatrix;
  /** Extended breaks. */
  extendedBreaks: Break[];
  /** External signal state. */
  externalSignalState: PulseExternalSignalState;
  /** Flow projection. */
  flowProjection: PulseFlowProjection;
  /** Health. */
  health: PulseHealth;
  /** Manifest. */
  manifest: PulseManifest | null;
  /** Manifest result. */
  manifestResult: PulseManifestLoadResult;
  /** Parity gaps. */
  parityGaps: PulseParityGapsArtifact;
  /** Parser inventory. */
  parserInventory: PulseParserInventory;
  /** Product graph. */
  productGraph: PulseProductGraph;
  /** Product vision. */
  productVision: PulseProductVision;
  /** Resolved manifest. */
  resolvedManifest: PulseResolvedManifest;
  /** Scope state. */
  scopeState: PulseScopeState;
  /** Structural graph. */
  structuralGraph: PulseStructuralGraph;
}

/** Full scan options. */
export interface FullScanOptions {
  /** Include parser predicate. */
  includeParser?: (name: string) => boolean;
  /** Parser timeout ms. */
  parserTimeoutMs?: number;
  /** Execution tracer. */
  tracer?: PulseExecutionTracer;
}
