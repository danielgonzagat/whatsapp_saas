import type { Break, PulseGateName, PulseManifestScenarioSpec } from '../types.manifest';
import type { PulseCapabilityState } from '../types.capabilities/03-capability';
import type { PulseExternalSignalState } from '../types.capabilities/05-external-signals';
import type { PulseParityGapsArtifact } from '../types.capabilities.parity';
import type { PulseFlowProjection } from '../types.capabilities/04-flow-projection';
import type { PulseCertification, PulseWorldState } from '../types.evidence';
import type {
  PulseConvergenceUnitPriority,
} from '../types.convergence';
import type { PulseExecutionMatrix } from '../types.execution-matrix';
import type { PulseResolvedManifest } from '../types.resolved-manifest';
import type { PulseScenarioResult } from '../types.scenario-result';
import type { PulseScopeState } from '../types.truth.scope';
import type { PulseGateResult, PulseGatesArtifact } from '../types.gate-result';
import {
  discoverAllObservedArtifactFilenames,
  discoverAllObservedGateNames,
} from '../dynamic-reality-kernel/token-evidence';
import { discoverConvergenceUnitKindLabels } from '../__kernel_additions__/discoverConvergenceUnitKindLabels';
import { discoverConvergenceUnitStatusLabels } from '../__kernel_additions__/discoverConvergenceUnitStatusLabels';
import { discoverConvergenceUnitPriorityLabels } from '../__kernel_additions__/discoverConvergenceUnitPriorityLabels';
import { discoverConvergenceExecutionModeLabels } from '../__kernel_additions__/discoverConvergenceExecutionModeLabels';
import { discoverConvergenceRiskLevelLabels } from '../__kernel_additions__/discoverConvergenceRiskLevelLabels';
import { discoverConvergenceProductImpactLabels } from '../__kernel_additions__/discoverConvergenceProductImpactLabels';
import { discoverConvergenceEvidenceConfidenceLabels } from '../__kernel_additions__/discoverConvergenceEvidenceConfidenceLabels';
import { discoverConvergenceSourceLabels } from '../__kernel_additions__/discoverConvergenceSourceLabels';
import {
  discoverConvergenceOwnerLaneLabels,
  discoverGateFailureClassLabels,
  discoverParityGapKindLabels,
  discoverParityGapSeverityLabels,
} from '../dynamic-reality-kernel/type-contract-labels';
import {
  discoverTruthModeLabels,
  discoverScenarioStatusLabels,
} from '../dynamic-reality-kernel/type-contract-engines';
import { discoverCapabilityStatusLabels } from '../__kernel_additions__/discoverCapabilityStatusLabels';
import { discoverFlowProjectionStatusLabels } from '../__kernel_additions__/discoverFlowProjectionStatusLabels';
import { discoverExternalSignalSourceLabels } from '../__kernel_additions__/discoverExternalSignalSourceLabels';
import { CHECKER_GAP_TYPES, SECURITY_FINDING_EVENT_KERNEL_GRAMMAR } from '../cert-constants';

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
let OBSERVED_EXTERNAL_SIGNAL_SOURCE_LABELS = discoverExternalSignalSourceLabels();

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
  OBSERVED_EXTERNAL_SIGNAL_SOURCE_LABELS,
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

import type { PulseNoHardcodedRealityState } from '../no-hardcoded-reality-state';

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
