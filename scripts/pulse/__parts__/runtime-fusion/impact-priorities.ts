import type { RuntimeSignal, RuntimeFusionState, SignalSeverity } from '../../types.runtime-fusion';
import {
  bound01,
  average,
  observedMeanOrSelf,
  observedSpread,
  positiveSignal,
} from './math-helpers';

export let ORDER_INDEX: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function rankByRuntimeReality(signals: RuntimeSignal[], staticOrder: string): string {
  return deriveOrder(signals, staticOrder);
}

function deriveOrder(signals: RuntimeSignal[], staticOrder: string): string {
  if (signals.length === 0) return staticOrder;

  let activeSignals = signals.filter(
    (s) => (!s.pinned || s.severity !== 'info') && isDecisiveRuntimeRealitySignal(s),
  );
  if (activeSignals.length === 0) return staticOrder;

  let impactValues = activeSignals.map((signal) =>
    Math.max(bound01(signal.impactScore), computeImpactScore(signal), runtimeRealityFactor(signal)),
  );
  let strongestImpact = Math.max(...impactValues);
  let dynamicFloor = observedMeanOrSelf(impactValues, strongestImpact);
  let dynamicSpread = observedSpread(impactValues);
  let deployBlockingMass = activeSignals
    .filter((signal) => signal.action === 'block_deploy')
    .map((signal) => signal.impactScore);
  let mergeBlockingMass = activeSignals
    .filter((signal) => signal.action === 'block_merge')
    .map((signal) => signal.impactScore);

  let runtimeOrder = staticOrder;
  if (
    strongestImpact >= dynamicFloor + dynamicSpread ||
    average(deployBlockingMass) >= dynamicFloor
  ) {
    runtimeOrder = 'P0';
  } else if (strongestImpact >= dynamicFloor || average(mergeBlockingMass) >= dynamicFloor) {
    runtimeOrder = 'P1';
  } else if (strongestImpact > 0) {
    runtimeOrder = 'P2';
  }

  let runtimeOrdinal = ORDER_INDEX[runtimeOrder] ?? 2;
  let staticOrdinal = ORDER_INDEX[staticOrder] ?? 2;

  return runtimeOrdinal <= staticOrdinal ? runtimeOrder : staticOrder;
}

export function computeImpactScore(signal: RuntimeSignal): number {
  return deriveMagnitude(signal);
}

function deriveMagnitude(signal: RuntimeSignal): number {
  let levels: SignalSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
  let ordinal = levels.indexOf(signal.severity);
  let ordinalForce = ordinal >= 0 ? (ordinal + 1) / levels.length : signal.impactScore;
  let freqLog = Math.log10(Math.max(signal.frequency, 1) + 1);
  let userLog = Math.log10(Math.max(signal.affectedUsers, 1) + 1);
  let trendForce = signal.trend === 'worsening' ? 0.2 : signal.trend === 'improving' ? -0.1 : 0;
  let actionForce =
    signal.action === 'block_deploy' ? 0.25 : signal.action === 'block_merge' ? 0.15 : 0;

  let observedMagnitude = (freqLog + userLog) / Math.max(freqLog + userLog, 12);
  let raw = observedMagnitude + ordinalForce * 0.2 + trendForce + actionForce;

  return bound01(raw);
}

function runtimeRealityFactor(signal: RuntimeSignal): number {
  let provenanceSignals = [
    signal.evidenceMode === 'observed' ? signal.confidence : 0,
    signal.observedAt ? signal.confidence : 0,
    signal.sourceArtifact ? signal.confidence : 0,
    positiveSignal(signal.affectedFilePaths.length),
    positiveSignal(signal.affectedCapabilityIds.length + signal.affectedFlowIds.length),
    positiveSignal(signal.frequency),
    positiveSignal(signal.affectedUsers),
  ];
  let inferredSignals = [
    signal.evidenceMode === 'inferred' ? signal.confidence : 0,
    signal.evidenceMode === 'simulated' || signal.evidenceMode === 'skipped'
      ? signal.confidence / Math.max(1, signal.confidence + positiveSignal(signal.count))
      : 0,
  ];
  let observedMass = average(provenanceSignals.filter((value) => value > 0));
  let inferredMass = average(inferredSignals.filter((value) => value > 0));
  return bound01(
    Math.max(observedMass, inferredMass, signal.confidence / Math.max(1, signal.count)),
  );
}

function normalizeImpactByRuntimeReality(
  signal: RuntimeSignal,
  impactScore: number,
  cohort: RuntimeSignal[],
): number {
  let weighted = bound01(impactScore) * runtimeRealityFactor(signal);
  let comparable = cohort.filter(
    (candidate) =>
      candidate !== signal &&
      candidate.evidenceMode === 'observed' &&
      candidate.evidenceKind !== signal.evidenceKind,
  );
  let comparableImpact = comparable.map((candidate) =>
    Math.max(bound01(candidate.impactScore), computeImpactScore(candidate)),
  );
  let observedPeerCeiling = Math.max(0, ...comparableImpact);
  if (signal.evidenceMode === 'observed' && signal.evidenceKind === 'runtime') {
    return bound01(Math.max(weighted, observedMeanOrSelf(comparableImpact, weighted)));
  }
  if (signal.evidenceKind === 'static' && observedPeerCeiling > 0) {
    let staticCeiling =
      observedPeerCeiling * bound01(signal.confidence / Math.max(1, signal.count));
    return Math.min(staticCeiling, weighted);
  }
  return bound01(weighted);
}

function isDecisiveRuntimeRealitySignal(signal: RuntimeSignal): boolean {
  return (
    signal.evidenceMode === 'observed' &&
    (signal.evidenceKind === 'runtime' ||
      signal.evidenceKind === 'change' ||
      signal.evidenceKind === 'dependency')
  );
}

export { normalizeImpactByRuntimeReality, isDecisiveRuntimeRealitySignal };

export function overridePriorities(
  fusionState: RuntimeFusionState,
  convergencePlan?: {
    priorities?: Record<string, string>;
    units?: Array<{ capabilityId?: string; priority: string; name?: string }>;
  },
): RuntimeFusionState {
  let overrides = fusionState.priorityOverrides.slice();

  for (let capId of Object.keys(fusionState.summary.signalsByCapability)) {
    let capabilitySignals = fusionState.signals.filter(
      (s) => s.affectedCapabilityIds.includes(capId) && isDecisiveRuntimeRealitySignal(s),
    );
    if (capabilitySignals.length === 0) continue;

    let originalPriority = 'P2';
    if (convergencePlan) {
      if (convergencePlan.priorities?.[capId]) {
        originalPriority = convergencePlan.priorities[capId];
      } else if (convergencePlan.units) {
        let unit = convergencePlan.units.find((u) => u.capabilityId === capId || u.name === capId);
        if (unit) originalPriority = unit.priority;
      }
    }

    if (originalPriority === 'P0') continue;
    let dynamicPriority = rankByRuntimeReality(capabilitySignals, originalPriority);
    if ((ORDER_INDEX[dynamicPriority] ?? 2) >= (ORDER_INDEX[originalPriority] ?? 2)) continue;

    let uniqueSources = [...new Set(capabilitySignals.map((s) => s.source))];
    let impactFloor = observedMeanOrSelf(
      capabilitySignals.map((signal) => signal.impactScore),
      0,
    );
    let reasons = capabilitySignals
      .filter((s) => s.impactScore >= impactFloor || s.action === 'block_deploy')
      .map((s) => `[${s.severity}] ${s.message.slice(0, 100)}`)
      .slice(0, 3);

    overrides.push({
      capabilityId: capId,
      originalPriority,
      newPriority: dynamicPriority,
      reason: `Dynamic signal semantics promoted runtime priority from observed operational impact from ${uniqueSources.join(', ')}: ${reasons.join('; ')}`,
    });
  }

  return { ...fusionState, priorityOverrides: overrides };
}
