// PULSE — Live Codebase Nervous System
// Shared type definitions — barrel re-export from domain split files.
// All existing imports from './types' continue to work unchanged.

// Leaf files first (no cross-re-exports)
export type * from './types.gate-failure';
export type * from './types.break-types';
export type * from './types.scenario-result';
export type * from './types.structural';
export type * from './types.product-vision';
export type * from './types.product-graph';
export type * from './types.execution-matrix';
export type * from './types.resolved-manifest';

// Core layer (re-exports BreakType — excluded here to avoid duplicate)
export type {
  UIElement,
  APICall,
  BackendRoute,
  PrismaModel,
  PrismaField,
  PrismaRelation,
  ServiceTrace,
  ProxyRoute,
  FacadeEntry,
} from './types.core';

// Health/config layer
export type {
  Break,
  PulseHealth,
  PulseConfig,
  PulseModuleState,
  PulseManifestModule,
  PulseEnvironment,
  PulseCertificationProfile,
  PulseFlowRunner,
  PulseFlowOracle,
  PulseActorKind,
  PulseScenarioKind,
  PulseScenarioRunner,
  PulseScenarioExecutionMode,
  PulseProviderMode,
  PulseTimeWindowMode,
  PulseActorProfile,
  PulseManifestScenarioSpec,
  PulseManifestFlowSpec,
  PulseInvariantSource,
  PulseInvariantEvaluator,
  PulseManifestInvariantSpec,
  PulseTemporaryAcceptanceTargetType,
  PulseTemporaryAcceptance,
  PulseManifestOverrides,
} from './types.health';

// Manifest layer (defines CertificationTier, GateName, Parser types)
export type {
  PulseManifestCertificationTier,
  PulseManifestFinalReadinessCriteria,
  PulseManifest,
  PulseGateName,
  PulseManifestLoadResult,
  PulseParserUnavailable,
  PulseParserDefinition,
  PulseParserInventory,
} from './types.manifest';

// Truth/scope layer (PulseShellComplexity comes via types.structural export above)
export type {
  PulseTruthPageSummary,
  PulseDiscoveredModule,
  PulseDiscoveredFlowCandidate,
  PulseTruthDivergence,
  PulseCodebaseTruthSummary,
  PulseCodebaseTruth,
  PulseScopeSurface,
  PulseScopeFileKind,
  PulseScopeExecutionMode,
  PulseCodacySeverity,
  PulseCodacyIssue,
  PulseCodacyHotspot,
  PulseCodacySummary,
  PulseScopeFile,
  PulseScopeModuleAggregate,
  PulseScopeParityStatus,
  PulseScopeParityConfidence,
  PulseScopeParity,
  PulseScopeStateSummary,
  PulseScopeState,
  PulseScopeOrphanFile,
  PulseScopeExcludedFile,
} from './types.truth';

// Capabilities, flow projection, external signals, parity gaps
export type * from './types.capabilities';

// Convergence (re-exports PulseGateFailureClass, PulseConvergenceOwnerLane — excluded)
export type {
  PulseConvergenceUnitPriority,
  PulseConvergenceUnitKind,
  PulseConvergenceUnitStatus,
  PulseConvergenceSource,
  PulseConvergenceExecutionMode,
  PulseConvergenceRiskLevel,
  PulseConvergenceProductImpact,
  PulseConvergenceEvidenceConfidence,
  PulseConvergenceUnit,
  PulseConvergencePlanSummary,
  PulseConvergencePlan,
  PulseEvidenceRecord,
  PulseRuntimeProbeStatus,
  PulseRuntimeProbe,
  PulseRuntimeEvidence,
  PulseBrowserFailureCode,
  PulseBrowserPreflight,
  PulseFlowResult,
  PulseInvariantResult,
  PulseBrowserEvidence,
  PulseFlowEvidence,
  PulseInvariantEvidence,
} from './types.convergence';

// Evidence layer (re-exports from scenario-result — excluded to avoid duplicate)
export type {
  PulseActorEvidence,
  PulseSurfaceClassification,
  PulseSurfaceCoverageEntry,
  PulseSyntheticCoverageEvidence,
  PulseWorldStateSession,
  PulseWorldState,
  PulseExecutionPhaseStatus,
  PulseExecutionPhase,
  PulseCertificationTarget,
  PulseExecutionTrace,
  PulseExecutionEvidence,
  PulseGateResult,
  PulseCertificationTierStatus,
  PulseSelfTrustCheckpoint,
  PulseSelfTrustReport,
  PulseCertification,
} from './types.evidence';

// Autonomy layer (re-exports product-graph — excluded to avoid duplicate)
export type {
  PulseAutonomyUnitSnapshot,
  PulseAutonomyValidationCommandResult,
  PulseAutonomyIterationRecord,
  PulseAutonomyState,
  PulseAgentOrchestrationWorkerResult,
  PulseAgentOrchestrationBatchRecord,
  PulseAgentOrchestrationState,
  PulseAutonomyConceptType,
  PulseAutonomySuggestedStrategy,
  PulseAutonomyMemoryConcept,
  PulseAutonomyMemoryState,
} from './types.autonomy';

// Legacy layer types (old-style shapes, kept for backward compat)
export type * from './types.legacy-layers';
