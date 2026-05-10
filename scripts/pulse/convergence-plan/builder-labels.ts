import type { PulseConvergenceOwnerLane, PulseGateFailureClass } from '../types.gate-failure';
import type {
  PulseConvergenceUnit,
  PulseConvergenceUnitPriority,
  PulseConvergenceUnitStatus,
} from '../types.convergence';
import {
  FAILURE_CLASSES,
  UNIT_CONFIDENCES,
  UNIT_EXECUTION_MODES,
  UNIT_KINDS,
  UNIT_OWNER_LANES,
  UNIT_PRIORITIES,
  UNIT_PRODUCT_IMPACTS,
  UNIT_RISK_LEVELS,
  UNIT_SOURCES,
  UNIT_STATUSES,
} from './kernel';

export function deriveObservedConvergenceEvidenceLabel<T extends string>(
  labels: Set<string>,
  token: string,
): T {
  const observed = [...labels].find((label) => label === token);
  if (!observed) {
    throw new Error(`Missing observed convergence label: ${token}`);
  }
  return observed as T;
}

const dynamicSourceEvidence = UNIT_SOURCES;
const dynamicStatusEvidence = UNIT_STATUSES;
const dynamicKindEvidence = UNIT_KINDS;
const dynamicPriorityEvidence = UNIT_PRIORITIES;

export const observedPulseSource =
  deriveObservedConvergenceEvidenceLabel<PulseConvergenceUnit['source']>(
    dynamicSourceEvidence,
    'pulse',
  );
export const observedAiSafeExecutionMode = deriveObservedConvergenceEvidenceLabel<
  PulseConvergenceUnit['executionMode']
>(UNIT_EXECUTION_MODES, 'ai_safe');
export const observedScenarioKind = deriveObservedConvergenceEvidenceLabel<PulseConvergenceUnit['kind']>(
  dynamicKindEvidence,
  'scenario',
);
export const observedSecurityKind = deriveObservedConvergenceEvidenceLabel<PulseConvergenceUnit['kind']>(
  dynamicKindEvidence,
  'security',
);
export const observedStaticKind = deriveObservedConvergenceEvidenceLabel<PulseConvergenceUnit['kind']>(
  dynamicKindEvidence,
  'static',
);
export const observedGateKind = deriveObservedConvergenceEvidenceLabel<PulseConvergenceUnit['kind']>(
  dynamicKindEvidence,
  'gate',
);
export const observedOpenStatus = deriveObservedConvergenceEvidenceLabel<PulseConvergenceUnitStatus>(
  dynamicStatusEvidence,
  'open',
);
export const observedWatchStatus = deriveObservedConvergenceEvidenceLabel<PulseConvergenceUnitStatus>(
  dynamicStatusEvidence,
  'watch',
);
export const observedP0Priority = deriveObservedConvergenceEvidenceLabel<PulseConvergenceUnitPriority>(
  dynamicPriorityEvidence,
  'P0',
);
export const observedP1Priority = deriveObservedConvergenceEvidenceLabel<PulseConvergenceUnitPriority>(
  dynamicPriorityEvidence,
  'P1',
);
export const observedP2Priority = deriveObservedConvergenceEvidenceLabel<PulseConvergenceUnitPriority>(
  dynamicPriorityEvidence,
  'P2',
);
export const observedP3Priority = deriveObservedConvergenceEvidenceLabel<PulseConvergenceUnitPriority>(
  dynamicPriorityEvidence,
  'P3',
);
export const observedCriticalRisk = deriveObservedConvergenceEvidenceLabel<
  PulseConvergenceUnit['riskLevel']
>(UNIT_RISK_LEVELS, 'critical');
export const observedHighRisk = deriveObservedConvergenceEvidenceLabel<PulseConvergenceUnit['riskLevel']>(
  UNIT_RISK_LEVELS,
  'high',
);
export const observedMediumRisk = deriveObservedConvergenceEvidenceLabel<
  PulseConvergenceUnit['riskLevel']
>(UNIT_RISK_LEVELS, 'medium');
export const observedPlatformLane = deriveObservedConvergenceEvidenceLabel<PulseConvergenceOwnerLane>(
  UNIT_OWNER_LANES,
  'platform',
);
export const observedSecurityLane = deriveObservedConvergenceEvidenceLabel<PulseConvergenceOwnerLane>(
  UNIT_OWNER_LANES,
  'security',
);
export const observedHighConfidence = deriveObservedConvergenceEvidenceLabel<
  PulseConvergenceUnit['confidence']
>(UNIT_CONFIDENCES, 'high');
export const observedMediumConfidence = deriveObservedConvergenceEvidenceLabel<
  PulseConvergenceUnit['confidence']
>(UNIT_CONFIDENCES, 'medium');
export const observedLowConfidence = deriveObservedConvergenceEvidenceLabel<
  PulseConvergenceUnit['confidence']
>(UNIT_CONFIDENCES, 'low');
export const observedDiagnosticImpact = deriveObservedConvergenceEvidenceLabel<
  PulseConvergenceUnit['productImpact']
>(UNIT_PRODUCT_IMPACTS, 'diagnostic');
export const observedEnablingImpact = deriveObservedConvergenceEvidenceLabel<
  PulseConvergenceUnit['productImpact']
>(UNIT_PRODUCT_IMPACTS, 'enabling');
export const observedProductFailureClass = deriveObservedConvergenceEvidenceLabel<PulseGateFailureClass>(
  FAILURE_CLASSES,
  'product_failure',
);
export const observedCheckerGapFailureClass =
  deriveObservedConvergenceEvidenceLabel<PulseGateFailureClass>(FAILURE_CLASSES, 'checker_gap');
