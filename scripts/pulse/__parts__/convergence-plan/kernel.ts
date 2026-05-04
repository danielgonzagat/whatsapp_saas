import type {
  Break,
  PulseCapabilityState,
  PulseCertification,
  PulseConvergenceOwnerLane,
  PulseConvergencePlan,
  PulseConvergenceUnit,
  PulseConvergenceUnitPriority,
  PulseConvergenceUnitStatus,
  PulseEvidenceRecord,
  PulseExecutionMatrix,
  PulseExternalSignalState,
  PulseGateFailureClass,
  PulseGateName,
  PulseManifestScenarioSpec,
  PulseParityGapsArtifact,
  PulseResolvedManifest,
  PulseScenarioResult,
  PulseScopeFile,
  PulseScopeState,
  PulseFlowProjection,
  PulseWorldState,
} from '../../types';
import {
  discoverAllObservedArtifactFilenames,
  discoverAllObservedGateNames,
  discoverGateLaneFromObservedStructure,
  derivePriorityFromObservedContext,
  discoverSourceLabelFromObservedContext,
  deriveUnitIdFromObservedKind,
  deriveProductImpactFromObservedScope,
  deriveUnitValue,
  discoverConvergenceUnitKindLabels,
  discoverConvergenceUnitStatusLabels,
  discoverConvergenceUnitPriorityLabels,
  discoverConvergenceExecutionModeLabels,
  discoverConvergenceRiskLevelLabels,
  discoverConvergenceProductImpactLabels,
  discoverConvergenceEvidenceConfidenceLabels,
  discoverConvergenceSourceLabels,
  discoverConvergenceOwnerLaneLabels,
  discoverGateFailureClassLabels,
  discoverTruthModeLabels,
  discoverParityGapKindLabels,
  discoverParityGapSeverityLabels,
  discoverCapabilityStatusLabels,
  discoverFlowProjectionStatusLabels,
  discoverScenarioStatusLabels,
  discoverExternalSignalSourceLabels,
} from '../../dynamic-reality-kernel';
import { CHECKER_GAP_TYPES, SECURITY_BREAK_TYPE_KERNEL_GRAMMAR } from '../../cert-constants';

let OBSERVED_ARTIFACTS = discoverAllObservedArtifactFilenames();
let OBSERVED_GATES = discoverAllObservedGateNames();
let UNIT_KINDS = discoverConvergenceUnitKindLabels();
let UNIT_STATUSES = discoverConvergenceUnitStatusLabels();
let UNIT_PRIORITIES = discoverConvergenceUnitPriorityLabels();
let UNIT_EXECUTION_MODES = discoverConvergenceExecutionModeLabels();
let UNIT_RISK_LEVELS = discoverConvergenceRiskLevelLabels();
let UNIT_PRODUCT_IMPACTS = discoverConvergenceProductImpactLabels();
let UNIT_CONFIDENCES = discoverConvergenceEvidenceConfidenceLabels();
let UNIT_SOURCES = discoverConvergenceSourceLabels();
let UNIT_OWNER_LANES = discoverConvergenceOwnerLaneLabels();
let FAILURE_CLASSES = discoverGateFailureClassLabels();
let TRUTH_MODES = discoverTruthModeLabels();
let PARITY_GAP_KINDS = discoverParityGapKindLabels();
let PARITY_GAP_SEVERITIES = discoverParityGapSeverityLabels();
let CAPABILITY_STATUSES = discoverCapabilityStatusLabels();
let FLOW_STATUSES = discoverFlowProjectionStatusLabels();
let SCENARIO_STATUSES = discoverScenarioStatusLabels();
let EXTERNAL_SIGNAL_SOURCES = discoverExternalSignalSourceLabels();

export {
  OBSERVED_ARTIFACTS,
  OBSERVED_GATES,
  UNIT_KINDS,
  UNIT_STATUSES,
  UNIT_PRIORITIES,
  UNIT_EXECUTION_MODES,
  UNIT_RISK_LEVELS,
  UNIT_PRODUCT_IMPACTS,
  UNIT_CONFIDENCES,
  UNIT_SOURCES,
  UNIT_OWNER_LANES,
  FAILURE_CLASSES,
  TRUTH_MODES,
  PARITY_GAP_KINDS,
  PARITY_GAP_SEVERITIES,
  CAPABILITY_STATUSES,
  FLOW_STATUSES,
  SCENARIO_STATUSES,
  EXTERNAL_SIGNAL_SOURCES,
};

export interface BuildPulseConvergencePlanInput {
  health: { breaks: Break[] };
  resolvedManifest: PulseResolvedManifest;
  scopeState: PulseScopeState;
  certification: PulseCertification;
  capabilityState: PulseCapabilityState;
  flowProjection: PulseFlowProjection;
  parityGaps: PulseParityGapsArtifact;
  externalSignalState?: PulseExternalSignalState;
  executionMatrix?: PulseExecutionMatrix;
  noHardcodedRealityState?: PulseNoHardcodedRealityState;
}

import type { PulseNoHardcodedRealityState } from '../../no-hardcoded-reality-state';

export interface ScenarioAccumulator {
  scenarioId: string;
  spec: PulseManifestScenarioSpec | null;
  actorKinds: Set<string>;
  gateNames: Set<PulseGateName>;
  results: PulseScenarioResult[];
  asyncEntries: PulseWorldState['asyncExpectationsStatus'];
}

export interface ScenarioPriorityContext {
  critical: boolean;
  hasObservedFailure: boolean;
  hasPendingAsync: boolean;
  requiresBrowser: boolean;
  requiresPersistence: boolean;
  executedEvidenceCount: number;
  failingGateCount: number;
}
