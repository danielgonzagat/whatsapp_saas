import type { Break, PulseGateName } from '../types.manifest';
import type { PulseParityGapsArtifact } from '../types.capabilities.parity';
import type { PulseConvergenceOwnerLane, PulseGateFailureClass } from '../types.gate-failure';
import type {
  PulseConvergenceUnit,
  PulseConvergenceUnitPriority,
  PulseConvergenceUnitStatus,
} from '../types.convergence';
import { OBSERVED_GATES, PARITY_GAP_KINDS } from './kernel';
import {
  deriveObservedConvergenceEvidenceLabel,
  observedOpenStatus,
  observedWatchStatus,
  observedMissingEvidenceFailureClass,
  observedTransformationalImpact,
  observedMaterialImpact,
  observedEnablingImpact,
  observedDiagnosticImpact,
  observedHighConfidence,
  observedMediumConfidence,
  observedLowConfidence,
  observedPlatformLane,
  observedReliabilityLane,
  observedSecurityLane,
  observedTruthObservedMode,
  observedTruthInferredMode,
} from './builder-labels';
import type { ScenarioPriorityContext } from './kernel';
import { CHECKER_GAP_TYPES } from '../cert-constants';
import {
  discoverGateLaneFromObservedStructure,
  derivePriorityFromObservedContext,
  deriveProductImpactFromObservedScope,
} from '../dynamic-reality-kernel/token-evidence';
import { deriveUnitValue } from '../dynamic-reality-kernel/catalog-arithmetic';
import {
  isSameState,
  observedThreshold,
  splitWords,
  uniqueStrings,
} from './__parts__/utils-core';
export {
  buildScenarioVisionDelta,
  buildScopeVisionDelta,
  buildParityVisionDelta,
  buildCapabilityVisionDelta,
  buildFlowVisionDelta,
  buildGateVisionDelta,
  buildCodacyVisionDelta,
  determineExternalKind,
  determineExternalPriority,
  determineExternalProductImpact,
  determineExternalRiskLevel,
  buildExternalVisionDelta,
  summarizeScenario,
  gateEvidenceEntries,
  gateEntries,
  gateNamesForResult,
  relatedFailedGateNames,
  failedGateNamesForCapability,
  failedGateNamesForFlow,
  evidenceMetricMatches,
  deriveScenarioGateNamesFromEvidence,
  deriveValidationArtifactsFromGateEvidence,
  buildValidationArtifacts,
} from './__parts__/utils-extract';
export * from './__parts__/utils-core';
export function normalizeSearchToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}
export function buildSearchTerms(
  scenarioId: string,
  moduleKeys: string[],
  routePatterns: string[],
  flowIds: string[],
): string[] {
  let routeTerms = routePatterns.flatMap((route) => route.split('/').filter(Boolean));
  let flowTerms = flowIds.flatMap((flowId) => splitWords(flowId));
  let scenarioTerms = splitWords(scenarioId);
  let minTermLength = deriveUnitValue() + deriveUnitValue() + deriveUnitValue();
  return uniqueStrings([...moduleKeys, ...routeTerms, ...flowTerms, ...scenarioTerms]).filter(
    (term) => normalizeSearchToken(term).length >= minTermLength,
  );
}
export function findRelatedBreaks(
  breaks: Break[],
  scenarioId: string,
  moduleKeys: string[],
  routePatterns: string[],
  flowIds: string[],
): Break[] {
  let terms = buildSearchTerms(scenarioId, moduleKeys, routePatterns, flowIds);
  if (terms.length === 0) {
    return [];
  }
  return breaks.filter((item) => {
    let haystack = normalizeSearchToken(
      [item.file, item.description, item.detail, item.source || '', item.surface || ''].join(' '),
    );
    return terms.some((term) => haystack.includes(normalizeSearchToken(term)));
  });
}
export function determineFailureClass(
  classes: Array<PulseGateFailureClass | undefined>,
  hasPendingAsync: boolean,
): PulseConvergenceUnit['failureClass'] {
  let uniqueClasses = uniqueStrings(classes);
  if (uniqueClasses.length === 1) {
    return uniqueClasses[0] as PulseGateFailureClass;
  }
  if (uniqueClasses.length > 1) {
    return 'mixed';
  }
  if (hasPendingAsync) {
    return 'product_failure';
  }
  return 'unknown';
}
export function deriveWatchFailureClasses(): Set<string> {
  return new Set([
    ...CHECKER_GAP_TYPES,
    observedMissingEvidenceFailureClass,
  ]);
}
export function determineUnitStatus(
  failureClass: PulseConvergenceUnit['failureClass'],
): PulseConvergenceUnitStatus {
  return deriveWatchFailureClasses().has(failureClass)
    ? observedWatchStatus
    : observedOpenStatus;
}
export function normalizeFailureClass(
  failureClass: PulseGateFailureClass | null | undefined,
): PulseConvergenceUnit['failureClass'] {
  return failureClass ?? 'unknown';
}
export function normalizeOptionalState<T extends string>(
  value: T | null | undefined,
  fallback: T,
): T {
  return value ?? fallback;
}
export function countUnitState<T extends string>(
  units: PulseConvergenceUnit[],
  select: (unit: PulseConvergenceUnit) => T,
  expected: T,
): number {
  return units.filter((unit) => isSameState(select(unit), expected)).length;
}
export function normalizeConvergenceExecutionMode(
  mode: PulseConvergenceUnit['executionMode'],
): PulseConvergenceUnit['executionMode'] {
  if (mode === 'human_required' || mode === 'observation_only') {
    return 'observation_only';
  }
  return 'ai_safe';
}
export function normalizeConvergenceUnit(unit: PulseConvergenceUnit): PulseConvergenceUnit {
  let executionMode = normalizeConvergenceExecutionMode(unit.executionMode);
  if (executionMode === unit.executionMode) {
    return unit;
  }
  return {
    ...unit,
    status: 'watch',
    executionMode,
    failureClass: unit.failureClass === 'product_failure' ? 'missing_evidence' : unit.failureClass,
    exitCriteria: uniqueStrings([
      ...unit.exitCriteria,
      'PULSE captures validation evidence before converting this surface into governed autonomous execution.',
      'Rollback expectation is captured before mutation moves beyond observation.',
    ]),
  };
}
export function determineScenarioPriority(
  context: ScenarioPriorityContext,
): PulseConvergenceUnitPriority {
  let isBlocker =
    context.critical &&
    (context.hasObservedFailure ||
      context.hasPendingAsync ||
      context.requiresBrowser ||
      context.requiresPersistence);
  if (isBlocker) {
    return derivePriorityFromObservedContext('critical', true, context.critical);
  }
  if (context.critical || context.failingGateCount > Number(Boolean(context.critical))) {
    return derivePriorityFromObservedContext('high', false, context.critical);
  }
  if (!Boolean(context.executedEvidenceCount)) {
    return derivePriorityFromObservedContext('medium', false, false);
  }
  return derivePriorityFromObservedContext('low', false, false);
}
export function determineScenarioLane(
  context: ScenarioPriorityContext,
  gateNames: PulseGateName[],
  affectedCapabilityLanes: PulseConvergenceOwnerLane[],
): PulseConvergenceOwnerLane {
  let mappedLane = selectDominantOwnerLane(affectedCapabilityLanes);
  if (mappedLane !== 'platform') {
    return mappedLane;
  }
  for (let gateName of gateNames) {
    let derivedLane = discoverGateLaneFromObservedStructure(gateName);
    if (derivedLane !== 'platform') {
      return derivedLane;
    }
  }
  if (context.hasPendingAsync || context.requiresBrowser) {
    return 'reliability';
  }
  return 'platform';
}
export function selectDominantOwnerLane(
  lanes: Array<PulseConvergenceOwnerLane | null | undefined>,
): PulseConvergenceOwnerLane {
  let available = lanes.filter((lane): lane is PulseConvergenceOwnerLane => Boolean(lane));
  let platformLane = observedPlatformLane;
  for (let preferred of available) {
    if (preferred !== platformLane) return preferred;
  }
  return platformLane;
}
export function confidenceFromNumeric(score: number): 'high' | 'medium' | 'low' {
  let pivot = observedThreshold([score, Number(Boolean(score))]);
  if (score > pivot) return observedHighConfidence;
  if (Boolean(score)) return observedMediumConfidence;
  return observedLowConfidence;
}
export function confidenceFromTruthMode(
  truthMode: 'observed' | 'inferred' | 'aspirational',
): 'high' | 'medium' | 'low' {
  if (isSameState(truthMode, observedTruthObservedMode)) return observedHighConfidence;
  if (isSameState(truthMode, observedTruthInferredMode)) return observedMediumConfidence;
  return observedLowConfidence;
}
export function determineScenarioProductImpact(
  context: ScenarioPriorityContext,
): PulseConvergenceUnit['productImpact'] {
  if (context.critical && (context.hasObservedFailure || context.hasPendingAsync)) {
    return deriveProductImpactFromObservedScope('critical', true);
  }
  if (context.critical || context.requiresPersistence || context.requiresBrowser) {
    return deriveProductImpactFromObservedScope('high', true);
  }
  return deriveProductImpactFromObservedScope('partial', false);
}
export function determineScopeProductImpact(context: {
  missingCodacyFiles: number;
  userFacingCandidates: number;
}): PulseConvergenceUnit['productImpact'] {
  if (Boolean(context.missingCodacyFiles)) return observedMaterialImpact;
  return observedEnablingImpact;
}
export function determineParityProductImpact(
  gapKind: PulseParityGapsArtifact['gaps'][number]['kind'],
): PulseConvergenceUnit['productImpact'] {
  let frontWithoutBack = deriveObservedConvergenceEvidenceLabel<string>(PARITY_GAP_KINDS, 'front_without_back');
  let uiWithoutPersistence = deriveObservedConvergenceEvidenceLabel<string>(PARITY_GAP_KINDS, 'ui_without_persistence');
  let featureDeclared = deriveObservedConvergenceEvidenceLabel<string>(PARITY_GAP_KINDS, 'feature_declared_without_runtime');
  let backWithoutFront = deriveObservedConvergenceEvidenceLabel<string>(PARITY_GAP_KINDS, 'back_without_front');
  let flowWithoutValidation = deriveObservedConvergenceEvidenceLabel<string>(PARITY_GAP_KINDS, 'flow_without_validation');
  if (
    isSameState(gapKind, frontWithoutBack) ||
    isSameState(gapKind, uiWithoutPersistence) ||
    isSameState(gapKind, featureDeclared)
  ) {
    return observedTransformationalImpact;
  }
  if (isSameState(gapKind, backWithoutFront) || isSameState(gapKind, flowWithoutValidation)) {
    return observedMaterialImpact;
  }
  return observedEnablingImpact;
}
export function determineGateProductImpact(
  gateName: PulseGateName,
): PulseConvergenceUnit['productImpact'] {
  let structuralLane = discoverGateLaneFromObservedStructure(gateName);
  if (structuralLane === observedReliabilityLane) return observedEnablingImpact;
  if (structuralLane === observedSecurityLane) return observedEnablingImpact;
  if (
    gateName === OBSERVED_GATES.find((g) => g.includes('runtime')) ||
    gateName === OBSERVED_GATES.find((g) => g.includes('flow')) ||
    gateName === OBSERVED_GATES.find((g) => g.includes('change')) ||
    gateName === OBSERVED_GATES.find((g) => g.includes('production'))
  ) {
    return observedMaterialImpact;
  }
  return observedDiagnosticImpact;
}
