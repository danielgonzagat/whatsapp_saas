import {
  bound01,
  average,
  positiveSignal,
  computeImpactScore,
  observedMeanOrSelf,
  TRUTH_OBSERVED,
  TRUTH_INFERRED,
  EVIDENCE_SIMULATED,
  EVIDENCE_SKIPPED,
  EVIDENCE_KIND_RUNTIME,
  EVIDENCE_KIND_CHANGE,
  EVIDENCE_KIND_DEPENDENCY,
  EVIDENCE_KIND_STATIC,
} from './fusion-shared';
import type { RuntimeSignal } from '../types.runtime-fusion';

export function runtimeRealityFactor(signal: RuntimeSignal): number {
  let provenanceSignals = [
    signal.evidenceMode === TRUTH_OBSERVED ? signal.confidence : 0,
    signal.observedAt ? signal.confidence : 0,
    signal.sourceArtifact ? signal.confidence : 0,
    positiveSignal(signal.affectedFilePaths.length),
    positiveSignal(signal.affectedCapabilityIds.length + signal.affectedFlowIds.length),
    positiveSignal(signal.frequency),
    positiveSignal(signal.affectedUsers),
  ];
  let inferredSignals = [
    signal.evidenceMode === TRUTH_INFERRED ? signal.confidence : 0,
    signal.evidenceMode === EVIDENCE_SIMULATED || signal.evidenceMode === EVIDENCE_SKIPPED
      ? signal.confidence / Math.max(1, signal.confidence + positiveSignal(signal.count))
      : 0,
  ];
  let observedMass = average(provenanceSignals.filter((value) => value > 0));
  let inferredMass = average(inferredSignals.filter((value) => value > 0));
  return bound01(
    Math.max(observedMass, inferredMass, signal.confidence / Math.max(1, signal.count)),
  );
}

export function normalizeImpactByRuntimeReality(
  signal: RuntimeSignal,
  impactScore: number,
  cohort: RuntimeSignal[],
): number {
  let weighted = bound01(impactScore) * runtimeRealityFactor(signal);
  let comparable = cohort.filter(
    (candidate) =>
      candidate !== signal &&
      candidate.evidenceMode === TRUTH_OBSERVED &&
      candidate.evidenceKind !== signal.evidenceKind,
  );
  let comparableImpact = comparable.map((candidate) =>
    Math.max(bound01(candidate.impactScore), computeImpactScore(candidate)),
  );
  let observedPeerCeiling = Math.max(0, ...comparableImpact);
  if (signal.evidenceMode === TRUTH_OBSERVED && signal.evidenceKind === EVIDENCE_KIND_RUNTIME) {
    return bound01(Math.max(weighted, observedMeanOrSelf(comparableImpact, weighted)));
  }
  if (signal.evidenceKind === EVIDENCE_KIND_STATIC && observedPeerCeiling > 0) {
    let staticCeiling =
      observedPeerCeiling * bound01(signal.confidence / Math.max(1, signal.count));
    return Math.min(staticCeiling, weighted);
  }
  return bound01(weighted);
}

export function isDecisiveRuntimeRealitySignal(signal: RuntimeSignal): boolean {
  return (
    signal.evidenceMode === TRUTH_OBSERVED &&
    (signal.evidenceKind === EVIDENCE_KIND_RUNTIME ||
      signal.evidenceKind === EVIDENCE_KIND_CHANGE ||
      signal.evidenceKind === EVIDENCE_KIND_DEPENDENCY)
  );
}

export {
  EXTERNAL_SIGNAL_STATE_FILE,
  RUNTIME_TRACES_FILE,
  FUSION_OUTPUT_FILE,
  bound01,
  normalizePathSeparators,
  deriveAction,
  mapSeverity,
  tokenizeEvidenceTerm,
  flattenPayloadTokens,
  evidenceTokens,
  tokenDensity,
  positiveSignal,
  trendSignal,
  observedInfluence,
  average,
  observedSpread,
  positiveObservedFloor,
  observedMeanOrSelf,
  neutralMagnitude,
  defaultCertainty,
  isCriticalSignal,
  isHighSignal,
  observedHttpDenominator,
  observedLatencyDenominator,
  observedOccurrence,
  evidenceMass,
  deriveOperationalEvidenceKind,
  deriveSignalType,
  ADAPTER_STALE,
  DYNAMIC_SIGNAL_SEMANTICS_NOTE,
  EVIDENCE_NOT_AVAILABLE,
  EVIDENCE_INVALID,
  EVIDENCE_SKIPPED,
  EVIDENCE_SIMULATED,
  TRUTH_OBSERVED,
  TRUTH_INFERRED,
  SEVERITY_CRITICAL,
  SEVERITY_HIGH,
  SEVERITY_MEDIUM,
  SEVERITY_LOW,
  SEVERITY_INFO,
  ACTION_BLOCK_DEPLOY,
  ACTION_BLOCK_MERGE,
  ACTION_PRIORITIZE,
  ACTION_CREATE_ISSUE,
  ACTION_LOG_ONLY,
  TYPE_DEPLOY_FAILURE,
  TYPE_TEST_FAILURE,
  TYPE_GRAPH_STALENESS,
  TYPE_ERROR,
  TYPE_LATENCY,
  EVIDENCE_KIND_RUNTIME,
  EVIDENCE_KIND_CHANGE,
  EVIDENCE_KIND_STATIC,
  EVIDENCE_KIND_DEPENDENCY,
  EVIDENCE_KIND_EXTERNAL,
  TREND_LABELS,
  UNKNOWN_TREND,
  TREND_WORSENING,
  TREND_IMPROVING,
} from './fusion-shared';
