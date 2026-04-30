// PULSE — Live Codebase Nervous System
// Convergence plan, gate types, and runtime/flow/invariant evidence types

import type { PulseGateName, PulseProviderMode } from './types.health';
import type { PulseTruthMode } from './types.structural';
import type { PulseGateFailureClass, PulseConvergenceOwnerLane } from './types.gate-failure';

export type { PulseGateFailureClass, PulseConvergenceOwnerLane } from './types.gate-failure';

/** Pulse convergence unit priority type. */
export type PulseConvergenceUnitPriority = 'P0' | 'P1' | 'P2' | 'P3';
/** Pulse convergence unit kind type. */
export type PulseConvergenceUnitKind =
  | 'scenario'
  | 'security'
  | 'static'
  | 'runtime'
  | 'change'
  | 'dependency'
  | 'gate'
  | 'scope'
  | 'capability'
  | 'flow';
/** Pulse convergence unit status type. */
export type PulseConvergenceUnitStatus = 'open' | 'watch';
/** Pulse convergence source type. */
export type PulseConvergenceSource = 'pulse' | 'codacy' | 'scope' | 'gate' | 'external';
/** Pulse convergence execution mode type. `human_required` is legacy input only. */
export type PulseConvergenceExecutionMode =
  | 'ai_safe'
  | 'observation_only'
  | 'governed_validation'
  | 'human_required';
/** Pulse convergence risk level type. */
export type PulseConvergenceRiskLevel = 'critical' | 'high' | 'medium' | 'low';
/** Pulse convergence product impact type. */
export type PulseConvergenceProductImpact =
  | 'transformational'
  | 'material'
  | 'enabling'
  | 'diagnostic';
/** Pulse convergence evidence confidence type. */
export type PulseConvergenceEvidenceConfidence = 'high' | 'medium' | 'low';

/** Pulse convergence unit shape. */
export interface PulseConvergenceUnit {
  /** Id property. */
  id: string;
  /** Order property. */
  order: number;
  /** Priority property. */
  priority: PulseConvergenceUnitPriority;
  /** Kind property. */
  kind: PulseConvergenceUnitKind;
  /** Status property. */
  status: PulseConvergenceUnitStatus;
  /** Source property. */
  source: PulseConvergenceSource;
  /** Execution mode property. */
  executionMode: PulseConvergenceExecutionMode;
  /** Owner lane property. */
  ownerLane: PulseConvergenceOwnerLane;
  /** Risk level property. */
  riskLevel: PulseConvergenceRiskLevel;
  /** Evidence mode property. */
  evidenceMode: PulseTruthMode;
  /** Confidence property. */
  confidence: PulseConvergenceEvidenceConfidence;
  /** Product impact property. */
  productImpact: PulseConvergenceProductImpact;
  /** Title property. */
  title: string;
  /** Summary property. */
  summary: string;
  /** Vision delta property. */
  visionDelta: string;
  /** Target state property. */
  targetState: string;
  /** Failure class property. */
  failureClass: PulseGateFailureClass | 'mixed' | 'unknown';
  /** Actor kinds property. */
  actorKinds: string[];
  /** Gate names property. */
  gateNames: PulseGateName[];
  /** Scenario ids property. */
  scenarioIds: string[];
  /** Module keys property. */
  moduleKeys: string[];
  /** Route patterns property. */
  routePatterns: string[];
  /** Flow ids property. */
  flowIds: string[];
  /** Affected capability ids property. */
  affectedCapabilityIds: string[];
  /** Affected flow ids property. */
  affectedFlowIds: string[];
  /** Async expectations property. */
  asyncExpectations: string[];
  /** Dynamic finding event labels property. */
  breakTypes: string[];
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Related files property. */
  relatedFiles: string[];
  /** Validation artifacts property. */
  validationArtifacts: string[];
  /** Exit criteria property. */
  exitCriteria: string[];
  /** Expected gate shift property. */
  expectedGateShift?: string;
}

/** Pulse convergence plan summary shape. */
export interface PulseConvergencePlanSummary {
  /** Total units property. */
  totalUnits: number;
  /** Scenario units property. */
  scenarioUnits: number;
  /** Security units property. */
  securityUnits: number;
  /** Static units property. */
  staticUnits: number;
  /** Runtime units property. */
  runtimeUnits: number;
  /** Change units property. */
  changeUnits: number;
  /** Dependency units property. */
  dependencyUnits: number;
  /** Scope units property. */
  scopeUnits: number;
  /** Gate units property. */
  gateUnits: number;
  /** Human required units property. */
  humanRequiredUnits: number;
  /** Observation only units property. */
  observationOnlyUnits: number;
  /** Priorities property. */
  priorities: Record<PulseConvergenceUnitPriority, number>;
  /** Failing gates property. */
  failingGates: PulseGateName[];
  /** Pending async expectations property. */
  pendingAsyncExpectations: string[];
}

/** Pulse convergence plan shape. */
export interface PulseConvergencePlan {
  /** Generated at property. */
  generatedAt: string;
  /** Commit sha property. */
  commitSha: string;
  /** Status property. */
  status: 'CERTIFIED' | 'PARTIAL' | 'NOT_CERTIFIED';
  /** Human replacement status property. */
  humanReplacementStatus: 'READY' | 'NOT_READY';
  /** Blocking tier property. */
  blockingTier: number | null;
  /** Summary property. */
  summary: PulseConvergencePlanSummary;
  /** Queue property. */
  queue: PulseConvergenceUnit[];
}

/** Pulse evidence record shape. */
export interface PulseEvidenceRecord {
  /** Kind property. */
  kind:
    | 'runtime'
    | 'browser'
    | 'flow'
    | 'invariant'
    | 'artifact'
    | 'truth'
    | 'actor'
    | 'coverage'
    | 'external';
  /** Executed property. */
  executed: boolean;
  /** Summary property. */
  summary: string;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Metrics property. */
  metrics?: Record<string, string | number | boolean>;
}

/** Pulse runtime probe status type. */
export type PulseRuntimeProbeStatus = 'passed' | 'failed' | 'missing_evidence' | 'skipped';

/** Pulse runtime probe shape. */
export interface PulseRuntimeProbe {
  /** Probe id property. */
  probeId: string;
  /** Target property. */
  target: string;
  /** Required property. */
  required: boolean;
  /** Executed property. */
  executed: boolean;
  /** Status property. */
  status: PulseRuntimeProbeStatus;
  /** Failure class property. */
  failureClass?: PulseGateFailureClass;
  /** Summary property. */
  summary: string;
  /** Latency ms property. */
  latencyMs?: number;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Metrics property. */
  metrics?: Record<string, string | number | boolean>;
}

/** Pulse runtime evidence shape. */
export interface PulseRuntimeEvidence {
  /** Executed property. */
  executed: boolean;
  /** Executed checks property. */
  executedChecks: string[];
  /** Blocking finding events property. */
  blockingBreakTypes: string[];
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Summary property. */
  summary: string;
  /** Backend url property. */
  backendUrl?: string;
  /** Frontend url property. */
  frontendUrl?: string;
  /** Resolution source property. */
  resolutionSource?: string;
  /** Probes property. */
  probes: PulseRuntimeProbe[];
}

// PulseObservabilityEvidence and PulseRecoveryEvidence are in types.scenario-result.ts
export type { PulseObservabilityEvidence, PulseRecoveryEvidence } from './types.scenario-result';

/** Pulse browser failure code type. */
export type PulseBrowserFailureCode =
  | 'ok'
  | 'playwright_missing'
  | 'chromium_launch_blocked'
  | 'frontend_unreachable'
  | 'backend_auth_unreachable';

/** Pulse browser preflight shape. */
export interface PulseBrowserPreflight {
  /** Status property. */
  status: PulseBrowserFailureCode;
  /** Detail property. */
  detail: string;
  /** Checked at property. */
  checkedAt: string;
}

/** Pulse flow result shape. */
export interface PulseFlowResult {
  /** Flow id property. */
  flowId: string;
  /** Status property. */
  status: 'passed' | 'failed' | 'accepted' | 'missing_evidence' | 'skipped';
  /** Executed property. */
  executed: boolean;
  /** Accepted property. */
  accepted: boolean;
  /** Provider mode used property. */
  providerModeUsed?: PulseProviderMode;
  /** Smoke executed property. */
  smokeExecuted?: boolean;
  /** Replay executed property. */
  replayExecuted?: boolean;
  /** Failure class property. */
  failureClass?: PulseGateFailureClass;
  /** Summary property. */
  summary: string;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Metrics property. */
  metrics?: Record<string, string | number | boolean>;
}

/** Pulse invariant result shape. */
export interface PulseInvariantResult {
  /** Invariant id property. */
  invariantId: string;
  /** Status property. */
  status: 'passed' | 'failed' | 'accepted' | 'missing_evidence' | 'skipped';
  /** Evaluated property. */
  evaluated: boolean;
  /** Accepted property. */
  accepted: boolean;
  /** Failure class property. */
  failureClass?: PulseGateFailureClass;
  /** Summary property. */
  summary: string;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Metrics property. */
  metrics?: Record<string, string | number | boolean>;
}

/** Pulse browser evidence shape. */
export interface PulseBrowserEvidence {
  /** Attempted property. */
  attempted: boolean;
  /** Executed property. */
  executed: boolean;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Summary property. */
  summary: string;
  /** Failure code property. */
  failureCode?: PulseBrowserFailureCode;
  /** Preflight property. */
  preflight?: PulseBrowserPreflight;
  /** Total pages property. */
  totalPages?: number;
  /** Total tested property. */
  totalTested?: number;
  /** Pass rate property. */
  passRate?: number;
  /** Blocking interactions property. */
  blockingInteractions?: number;
}

/** Pulse flow evidence shape. */
export interface PulseFlowEvidence {
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
  /** Accepted property. */
  accepted: string[];
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Summary property. */
  summary: string;
  /** Results property. */
  results: PulseFlowResult[];
}

/** Pulse invariant evidence shape. */
export interface PulseInvariantEvidence {
  /** Declared property. */
  declared: string[];
  /** Evaluated property. */
  evaluated: string[];
  /** Missing property. */
  missing: string[];
  /** Passed property. */
  passed: string[];
  /** Failed property. */
  failed: string[];
  /** Accepted property. */
  accepted: string[];
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Summary property. */
  summary: string;
  /** Results property. */
  results: PulseInvariantResult[];
}

// PulseScenarioResult is defined in types.scenario-result.ts to keep this file under 400 lines
export type { PulseScenarioResult } from './types.scenario-result';
