// PULSE — Live Codebase Nervous System
// Actor evidence, execution traces, world state, gate results, and certification types

import type {
  PulseGateName,
  PulseEnvironment,
  PulseManifestFinalReadinessCriteria,
  PulseCertificationProfile,
  PulseActorKind,
} from './types.health';
import type { PulseTruthMode } from './types.structural';
import type {
  PulseCapabilityStateSummary,
  PulseFlowProjectionSummary,
  PulseExternalSignalSummary,
} from './types.capabilities';
import type { PulseExecutionMatrixSummary } from './types.execution-matrix';
import type { PulseResolvedManifestSummary } from './types.resolved-manifest';
import type {
  PulseCodebaseTruthSummary,
  PulseTruthDivergence,
  PulseScopeStateSummary,
  PulseCodacySummary,
  PulseStructuralGraphSummary,
  PulseCodacyEvidenceSummary,
} from './types.truth';
import type {
  PulseGateFailureClass,
  PulseEvidenceRecord,
  PulseRuntimeEvidence,
  PulseBrowserEvidence,
  PulseFlowEvidence,
  PulseInvariantEvidence,
  PulseObservabilityEvidence,
  PulseRecoveryEvidence,
  PulseScenarioResult,
} from './types.convergence';
import type { PulseNoHardcodedRealityState } from './no-hardcoded-reality-state';

/** Pulse actor evidence shape. */
export interface PulseActorEvidence {
  /** Actor kind property. */
  actorKind: 'customer' | 'operator' | 'admin' | 'soak';
  /** Declared property. */
  declared: string[];
  /** Executed property. */
  executed: string[];
  /** Missing property. */
  missing: string[];
  /** Passed property. */
  passed: string[];
  /** Failed property. */
  failed: string[];
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Summary property. */
  summary: string;
  /** Results property. */
  results: PulseScenarioResult[];
}

/** Pulse surface classification type. */
export type PulseSurfaceClassification =
  | 'certified_interaction'
  | 'shared_capability'
  | 'ops_only'
  | 'legacy_shell'
  | 'decorative_only';

/** Pulse surface coverage entry shape. */
export interface PulseSurfaceCoverageEntry {
  /** Route property. */
  route: string;
  /** Group property. */
  group: string;
  /** Module key property. */
  moduleKey: string;
  /** Module name property. */
  moduleName: string;
  /** Classification property. */
  classification: PulseSurfaceClassification;
  /** Covered property. */
  covered: boolean;
  /** Actor kinds property. */
  actorKinds: PulseActorKind[];
  /** Scenario ids property. */
  scenarioIds: string[];
  /** Total interactions property. */
  totalInteractions: number;
  /** Persisted interactions property. */
  persistedInteractions: number;
}

/** Pulse synthetic coverage evidence shape. */
export interface PulseSyntheticCoverageEvidence {
  /** Executed property. */
  executed: boolean;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Summary property. */
  summary: string;
  /** Total pages property. */
  totalPages: number;
  /** User facing pages property. */
  userFacingPages: number;
  /** Covered pages property. */
  coveredPages: number;
  /** Uncovered pages property. */
  uncoveredPages: string[];
  /** Results property. */
  results: PulseSurfaceCoverageEntry[];
}

/** Pulse world state session shape. */
export interface PulseWorldStateSession {
  /** Kind property. */
  kind: PulseActorKind;
  /** Declared scenarios property. */
  declaredScenarios: number;
  /** Executed scenarios property. */
  executedScenarios: number;
  /** Passed scenarios property. */
  passedScenarios: number;
}

/** Pulse world state shape. */
export interface PulseWorldState {
  /** Generated at property. */
  generatedAt: string;
  /** Backend url property. */
  backendUrl?: string;
  /** Frontend url property. */
  frontendUrl?: string;
  /** Actor profiles property. */
  actorProfiles: string[];
  /** Executed scenarios property. */
  executedScenarios: string[];
  /** Pending async expectations property. */
  pendingAsyncExpectations: string[];
  /** Entities property. */
  entities: Record<string, string[]>;
  /** Async expectations status property. */
  asyncExpectationsStatus: Array<{
    scenarioId: string;
    expectation: string;
    status: 'pending' | 'satisfied' | 'failed' | 'timed_out' | 'missing_evidence' | 'not_executed';
  }>;
  /** Artifacts by scenario property. */
  artifactsByScenario: Record<string, string[]>;
  /** Sessions property. */
  sessions: PulseWorldStateSession[];
}

/** Pulse execution phase status type. */
export type PulseExecutionPhaseStatus = 'running' | 'passed' | 'failed' | 'timed_out' | 'skipped';

/** Pulse execution phase shape. */
export interface PulseExecutionPhase {
  /** Phase property. */
  phase: string;
  /** Phase status property. */
  phaseStatus: PulseExecutionPhaseStatus;
  /** Started at property. */
  startedAt: string;
  /** Finished at property. */
  finishedAt?: string;
  /** Duration ms property. */
  durationMs?: number;
  /** Error summary property. */
  errorSummary?: string;
  /** Metadata property. */
  metadata?: Record<string, string | number | boolean>;
}

/** Pulse certification target shape. */
export interface PulseCertificationTarget {
  /** Tier property. */
  tier: number | null;
  /** Final property. */
  final: boolean;
  /** Profile property. */
  profile?: PulseCertificationProfile | null;
  /** Certification scope property. */
  certificationScope?: PulseCertificationProfile | null;
}

/** Pulse execution trace shape. */
export interface PulseExecutionTrace {
  /** Run id property. */
  runId: string;
  /** Generated at property. */
  generatedAt: string;
  /** Updated at property. */
  updatedAt: string;
  /** Environment property. */
  environment?: PulseEnvironment;
  /** Certification target property. */
  certificationTarget?: PulseCertificationTarget;
  /** Phases property. */
  phases: PulseExecutionPhase[];
  /** Summary property. */
  summary: string;
  /** Artifact paths property. */
  artifactPaths: string[];
}

/** Pulse execution evidence shape. */
export interface PulseExecutionEvidence {
  /** Runtime property. */
  runtime: PulseRuntimeEvidence;
  /** Browser property. */
  browser: PulseBrowserEvidence;
  /** Flows property. */
  flows: PulseFlowEvidence;
  /** Invariants property. */
  invariants: PulseInvariantEvidence;
  /** Observability property. */
  observability: PulseObservabilityEvidence;
  /** Recovery property. */
  recovery: PulseRecoveryEvidence;
  /** Customer property. */
  customer: PulseActorEvidence;
  /** Operator property. */
  operator: PulseActorEvidence;
  /** Admin property. */
  admin: PulseActorEvidence;
  /** Soak property. */
  soak: PulseActorEvidence;
  /** Synthetic coverage property. */
  syntheticCoverage: PulseSyntheticCoverageEvidence;
  /** World state property. */
  worldState: PulseWorldState;
  /** Execution trace property. */
  executionTrace: PulseExecutionTrace;
}

/** Pulse gate result shape. */
export interface PulseGateResult {
  /** Status property. */
  status: 'pass' | 'fail';
  /** Reason property. */
  reason: string;
  /** Failure class property. */
  failureClass?: PulseGateFailureClass;
  /** Evidence mode property. */
  evidenceMode?: PulseTruthMode;
  /** Confidence property. */
  confidence?: 'high' | 'medium' | 'low';
  /** Affected capability ids property. */
  affectedCapabilityIds?: string[];
  /** Affected flow ids property. */
  affectedFlowIds?: string[];
}

/** Pulse certification tier status shape. */
export interface PulseCertificationTierStatus {
  /** Id property. */
  id: number;
  /** Name property. */
  name: string;
  /** Status property. */
  status: 'pass' | 'fail';
  /** Gates property. */
  gates: PulseGateName[];
  /** Blocking gates property. */
  blockingGates: PulseGateName[];
  /** Reason property. */
  reason: string;
}

/** PULSE self-trust checkpoint shape. */
export interface PulseSelfTrustCheckpoint {
  /** Check id property. */
  id: string;
  /** Check name property. */
  name: string;
  /** Check description property. */
  description: string;
  /** Pass property. */
  pass: boolean;
  /** Failure reason property. */
  reason?: string;
  /** Severity property. */
  severity: 'critical' | 'high' | 'medium';
  /** Score property. */
  score: number;
}

/** PULSE self-trust report shape. */
export interface PulseSelfTrustReport {
  /** Timestamp property. */
  timestamp: string;
  /** Overall pass property. */
  overallPass: boolean;
  /** Score property. */
  score: number;
  /** Checks property. */
  checks: PulseSelfTrustCheckpoint[];
  /** Failed checks property. */
  failedChecks: PulseSelfTrustCheckpoint[];
  /** Confidence property. */
  confidence: 'high' | 'medium' | 'low';
  /** Recommendations property. */
  recommendations: string[];
}

/** Pulse certification shape. */
export interface PulseCertification {
  /** Certification scope property. */
  certificationScope?: PulseCertificationProfile | null;
  /** Version property. */
  version: string;
  /** Status property. */
  status: 'CERTIFIED' | 'PARTIAL' | 'NOT_CERTIFIED';
  /** Human replacement status property. */
  humanReplacementStatus: 'READY' | 'NOT_READY';
  /** Raw score property. */
  rawScore: number;
  /** Score property. */
  score: number;
  /** Commit sha property. */
  commitSha: string;
  /** Environment property. */
  environment: PulseEnvironment;
  /** Timestamp property. */
  timestamp: string;
  /** Manifest path property. */
  manifestPath: string | null;
  /** Unknown surfaces property. */
  unknownSurfaces: string[];
  /** Unavailable checks property. */
  unavailableChecks: string[];
  /** Unsupported stacks property. */
  unsupportedStacks: string[];
  /** Critical failures property. */
  criticalFailures: string[];
  /** Gates property. */
  gates: Record<PulseGateName, PulseGateResult>;
  /** Truth summary property. */
  truthSummary: PulseCodebaseTruthSummary;
  /** Truth divergence property. */
  truthDivergence: PulseTruthDivergence;
  /** Scope state summary property. */
  scopeStateSummary: PulseScopeStateSummary | null;
  /** Codacy summary property. */
  codacySummary: PulseCodacySummary | null;
  /** Codacy evidence summary property. */
  codacyEvidenceSummary?: PulseCodacyEvidenceSummary | null;
  /** External signal summary property. */
  externalSignalSummary?: PulseExternalSignalSummary | null;
  /** Required missing adapter count mirrored for cross-artifact comparison. */
  missingAdaptersCount?: number;
  /** Required stale adapter count mirrored for cross-artifact comparison. */
  staleAdaptersCount?: number;
  /** Required invalid adapter count mirrored for cross-artifact comparison. */
  invalidAdaptersCount?: number;
  /** Required blocking adapter count mirrored for cross-artifact comparison. */
  blockingAdaptersCount?: number;
  /** Execution matrix summary property. */
  executionMatrixSummary?: PulseExecutionMatrixSummary | null;
  /** Resolved manifest summary property. */
  resolvedManifestSummary: PulseResolvedManifestSummary;
  /** Structural graph summary property. */
  structuralGraphSummary?: PulseStructuralGraphSummary | null;
  /** Capability state summary property. */
  capabilityStateSummary?: PulseCapabilityStateSummary | null;
  /** Flow projection summary property. */
  flowProjectionSummary?: PulseFlowProjectionSummary | null;
  /** Unresolved modules property. */
  unresolvedModules: string[];
  /** Unresolved flows property. */
  unresolvedFlows: string[];
  /** Certification target property. */
  certificationTarget: PulseCertificationTarget;
  /** Tier status property. */
  tierStatus: PulseCertificationTierStatus[];
  /** Blocking tier property. */
  blockingTier: number | null;
  /** Accepted flows remaining property. */
  acceptedFlowsRemaining: string[];
  /** Pending critical scenarios property. */
  pendingCriticalScenarios: string[];
  /** Final readiness criteria property. */
  finalReadinessCriteria: PulseManifestFinalReadinessCriteria | null;
  /** Evidence summary property. */
  evidenceSummary: PulseExecutionEvidence;
  /** Gate evidence property. */
  gateEvidence: Partial<Record<PulseGateName, PulseEvidenceRecord[]>>;
  /** Dynamic blocking reasons property. */
  dynamicBlockingReasons: string[];
  /** PULSE self-trust report property. */
  selfTrustReport?: PulseSelfTrustReport | null;
  /** No-hardcoded-reality state used by certification and downstream artifacts. */
  noHardcodedRealityState?: PulseNoHardcodedRealityState | null;
}
