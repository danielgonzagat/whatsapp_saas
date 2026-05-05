import type { Break, PulseGateName, PulseManifestScenarioSpec } from '../../types.manifest';
import type {
  PulseCapabilityState,
  PulseExternalSignalState,
  PulseParityGapsArtifact,
  PulseFlowProjection,
} from '../../types.capabilities';
import type { PulseCertification, PulseWorldState } from '../../types.evidence';
import type { PulseConvergenceOwnerLane, PulseGateFailureClass } from '../../types.gate-failure';
import type {
  PulseConvergencePlan,
  PulseConvergenceUnit,
  PulseConvergenceUnitPriority,
  PulseConvergenceUnitStatus,
  PulseEvidenceRecord,
} from '../../types.convergence';
import type { PulseExecutionMatrix } from '../../types.execution-matrix';
import type { PulseResolvedManifest } from '../../types.resolved-manifest';
import type { PulseScenarioResult } from '../../types.scenario-result';
import type { PulseScopeFile, PulseScopeState } from '../../types.truth.scope';

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
  noHardcodedRealityState?: import('../../no-hardcoded-reality-state').PulseNoHardcodedRealityState;
}

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
