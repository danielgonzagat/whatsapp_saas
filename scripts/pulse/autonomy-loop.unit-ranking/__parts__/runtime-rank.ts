/**
 * Runtime reality integration and unit ranking: signals, queue scores, automation cost.
 */
import type {
  PulseAutonomousDirective,
  PulseAutonomousDirectiveUnit,
} from '../../autonomy-loop.types';
import { unique } from '../../autonomy-loop.utils';
import {
  deriveUnitValue,
  deriveZeroValue,
  discoverOperationalEvidenceKindLabels,
  discoverRuntimeFusionEvidenceStatusLabels,
} from '../../dynamic-reality-kernel';
import type {
  OperationalEvidenceKind,
  RuntimeFusionState,
  RuntimeSignal,
} from '../../types.runtime-fusion';
import type { StructuralQueueInfluence, RuntimeRealityUnitMetadata } from './structural-rank';
import {
  emptyStructuralQueueInfluence,
  getAiSafeUnits,
  getPriorityRank,
  getConfidenceRank,
  sourceMatchesGrammarPulseMachine,
  evidenceModeMatchesGrammarObserved,
  evidenceModeMatchesGrammarInferred,
  kindMatchesGrammarScenario,
  deriveEvidenceModeGrammarFallback,
  getRiskRank,
  getEvidenceRank,
  getKindExecutionPenalty,
} from './structural-rank';

// ── Runtime evidence helpers ──────────────────────────────────────────────────

export function normalizeRuntimeEvidenceMode(mode: string | null | undefined): string {
  return String(mode || '')
    .trim()
    .toLowerCase();
}

export function getOperationalEvidenceKindWeight(kind: OperationalEvidenceKind): number {
  if (kind === 'runtime') {
    const u = deriveUnitValue();
    return (u + u + u + u + u + u + u + u + u + u) * (u + u + u + u + u + u + u + u + u + u);
  }
  if (kind === 'change') {
    const u = deriveUnitValue();
    const five = u + u + u + u + u;
    return five * (u + u + u + u + u + u + u + u + u + u + u + u + u);
  }
  if (kind === 'dependency') {
    const u = deriveUnitValue();
    const five = u + u + u + u + u;
    return five * (u + u + u + u + u + u + u + u + u + u + u);
  }
  if (kind === 'external') {
    const u = deriveUnitValue();
    const five = u + u + u + u + u;
    return five * (u + u + u + u + u + u + u + u);
  }
  const u = deriveUnitValue();
  const five = u + u + u + u + u;
  return five + five;
}

export function getRuntimeEvidenceModeWeight(mode: string | null | undefined): number {
  const normalized = normalizeRuntimeEvidenceMode(mode);
  const u = deriveUnitValue();
  if (normalized === 'observed') return u + u + u;
  if (normalized === 'inferred') return (u + u + u) / (u + u);
  if (normalized === 'simulated') return u / (u + u);
  return u / (u + u + u + u);
}

export function getBoundedRuntimeScore(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value)
    ? Math.max(deriveZeroValue(), Math.min(deriveUnitValue(), Number(value)))
    : fallback;
}

// ── Signal matching ───────────────────────────────────────────────────────────

export function signalMatchesUnit(
  unit: PulseAutonomousDirectiveUnit,
  signal: RuntimeSignal,
): boolean {
  const unitCapabilities = new Set(unit.affectedCapabilities || []);
  const unitFlows = new Set(unit.affectedFlows || []);
  const unitFiles = new Set([
    ...(unit.relatedFiles || []),
    ...(unit.ownedFiles || []),
    ...(unit.validationTargets || []),
    ...(unit.validationArtifacts || []),
  ]);
  const signalCapabilities = unique([
    ...signal.affectedCapabilityIds,
    ...(signal.affectedCapabilities || []),
  ]);
  const signalFlows = unique([...signal.affectedFlowIds, ...(signal.affectedFlows || [])]);

  return (
    signalCapabilities.some((capabilityId) => unitCapabilities.has(capabilityId)) ||
    signalFlows.some((flowId) => unitFlows.has(flowId)) ||
    signal.affectedFilePaths.some((filePath) => unitFiles.has(filePath)) ||
    unit.kind === signal.evidenceKind
  );
}

export function getRuntimeSignalRankScore(signal: RuntimeSignal): number {
  const impactScore = getBoundedRuntimeScore(signal.impactScore, deriveZeroValue());
  const u = deriveUnitValue();
  const half = u / (u + u);
  const confidence = getBoundedRuntimeScore(signal.confidence, half);
  return (
    getOperationalEvidenceKindWeight(signal.evidenceKind) *
    getRuntimeEvidenceModeWeight(signal.evidenceMode) *
    (half + u / (u + u + u + u + u + u + u + u + u + u) + impactScore) *
    (half + confidence)
  );
}

function buildRuntimeRealityReason(signal: RuntimeSignal): string {
  const evidenceMode = signal.evidenceMode || deriveEvidenceModeGrammarFallback();
  const u = deriveUnitValue();
  const two = u + u;
  return `${signal.evidenceKind}/${evidenceMode} ${signal.source} signal ${signal.id} impact=${signal.impactScore.toFixed(two)} confidence=${signal.confidence.toFixed(two)}`;
}

// ── Runtime reality API ───────────────────────────────────────────────────────

export function buildRuntimeRealityUnitMetadata(
  units: PulseAutonomousDirectiveUnit[],
  signals: RuntimeSignal[],
): RuntimeRealityUnitMetadata[] {
  const metadata: RuntimeRealityUnitMetadata[] = [];

  for (const unit of units) {
    const rankedSignals = signals
      .filter((signal) => signalMatchesUnit(unit, signal))
      .sort((left, right) => getRuntimeSignalRankScore(right) - getRuntimeSignalRankScore(left));
    const primarySignal = rankedSignals[0];
    if (!primarySignal) {
      continue;
    }

    metadata.push({
      unitId: unit.id,
      rankScore: getRuntimeSignalRankScore(primarySignal),
      primarySignalId: primarySignal.id,
      primaryEvidenceKind: primarySignal.evidenceKind,
      primarySource: primarySignal.source,
      evidenceMode: primarySignal.evidenceMode || deriveEvidenceModeGrammarFallback(),
      impactScore: getBoundedRuntimeScore(primarySignal.impactScore, deriveZeroValue()),
      confidence: getBoundedRuntimeScore(
        primarySignal.confidence,
        deriveUnitValue() / (deriveUnitValue() + deriveUnitValue()),
      ),
      affectedCapabilities: unique([
        ...primarySignal.affectedCapabilityIds,
        ...(primarySignal.affectedCapabilities || []),
      ]),
      affectedFlows: unique([
        ...primarySignal.affectedFlowIds,
        ...(primarySignal.affectedFlows || []),
      ]),
      reason: buildRuntimeRealityReason(primarySignal),
    });
  }

  return metadata;
}

export function buildRuntimeRealityQueueInfluence(
  directive: PulseAutonomousDirective,
  runtimeFusion?: RuntimeFusionState | null,
): StructuralQueueInfluence {
  const influence = emptyStructuralQueueInfluence();
  const signals = runtimeFusion?.signals || [];
  for (const metadata of buildRuntimeRealityUnitMetadata(getAiSafeUnits(directive), signals)) {
    influence.runtimeRealityByUnitId.set(metadata.unitId, metadata);
  }
  return influence;
}

// ── Queue ranking ─────────────────────────────────────────────────────────────

export function isSuppressedByMemory(
  unit: PulseAutonomousDirectiveUnit,
  influence?: StructuralQueueInfluence | null,
): boolean {
  if (!influence) return false;
  return unitMatchesMemoryMarker(unit, influence.suppressedUnitIds);
}

export function unitMatchesMemoryMarker(
  unit: PulseAutonomousDirectiveUnit,
  markers: Set<string>,
): boolean {
  if (markers.has(unit.id)) return true;
  return [...markers].some(
    (marker) =>
      (unit.affectedCapabilities || []).includes(marker) ||
      (unit.affectedFlows || []).includes(marker) ||
      (unit.relatedFiles || []).includes(marker) ||
      (unit.ownedFiles || []).includes(marker) ||
      (unit.validationTargets || []).includes(marker) ||
      (unit.validationArtifacts || []).includes(marker),
  );
}

export function getMemoryQueueRank(
  unit: PulseAutonomousDirectiveUnit,
  influence?: StructuralQueueInfluence | null,
): number {
  if (!influence) return deriveZeroValue();
  const u = deriveUnitValue();
  const twenty = u + u + u + u + u + u + u + u + u + u + (u + u + u + u + u + u + u + u + u + u);
  if (unitMatchesMemoryMarker(unit, influence.promotedUnitIds)) return -twenty;
  if (unitMatchesMemoryMarker(unit, influence.deprioritizedUnitIds)) return twenty;
  return deriveZeroValue();
}

export function getRuntimeRealityQueueRank(
  unit: PulseAutonomousDirectiveUnit,
  influence?: StructuralQueueInfluence | null,
): number {
  const metadata = influence?.runtimeRealityByUnitId.get(unit.id);
  return metadata ? -metadata.rankScore : 0;
}

export function getPulseMachineQueueRank(unit: PulseAutonomousDirectiveUnit): number {
  if (sourceMatchesGrammarPulseMachine(unit.source, unit.kind)) {
    const u = deriveUnitValue();
    const hundred =
      (u + u + u + u + u + u + u + u + u + u) * (u + u + u + u + u + u + u + u + u + u);
    return -hundred;
  }
  return deriveZeroValue();
}

// ── Automation cost ───────────────────────────────────────────────────────────

export function getAutomationExecutionCost(unit: PulseAutonomousDirectiveUnit): number {
  const capabilityCount = (unit.affectedCapabilities || []).length;
  const flowCount = (unit.affectedFlows || []).length;
  const validationCount = unique([
    ...(unit.validationTargets || []),
    ...(unit.validationArtifacts || []),
    ...(unit.exitCriteria || []),
  ]).length;
  const u = deriveUnitValue();
  const two = u + u;
  const threeCap = u + u + u;
  const fourFlow = u + u + u + u;
  const routeCapThreshold = two;
  const routePenalty = kindMatchesGrammarScenario(unit.kind)
    ? Math.max(deriveZeroValue(), capabilityCount - routeCapThreshold) * threeCap
    : deriveZeroValue();

  return (
    getKindExecutionPenalty(unit) +
    capabilityCount * threeCap +
    flowCount * fourFlow +
    validationCount +
    routePenalty +
    getRiskRank(unit.riskLevel) * two +
    getEvidenceRank(unit.evidenceMode)
  );
}

// ── Compare ────────────────────────────────────────────────────────────────────

export function compareAutomationUnits(
  left: PulseAutonomousDirectiveUnit,
  right: PulseAutonomousDirectiveUnit,
  influence?: StructuralQueueInfluence | null,
): number {
  const pulseMachineDelta = getPulseMachineQueueRank(left) - getPulseMachineQueueRank(right);
  if (pulseMachineDelta !== deriveZeroValue()) return pulseMachineDelta;

  const memoryDelta = getMemoryQueueRank(left, influence) - getMemoryQueueRank(right, influence);
  if (memoryDelta !== deriveZeroValue()) return memoryDelta;

  const runtimeRealityDelta =
    getRuntimeRealityQueueRank(left, influence) - getRuntimeRealityQueueRank(right, influence);
  if (runtimeRealityDelta !== deriveZeroValue()) return runtimeRealityDelta;

  const costDelta = getAutomationExecutionCost(left) - getAutomationExecutionCost(right);
  if (costDelta !== deriveZeroValue()) return costDelta;

  const priorityDelta = getPriorityRank(left.priority) - getPriorityRank(right.priority);
  if (priorityDelta !== deriveZeroValue()) return priorityDelta;

  const confidenceDelta = getConfidenceRank(right.confidence) - getConfidenceRank(left.confidence);
  if (confidenceDelta !== deriveZeroValue()) return confidenceDelta;

  return left.title.localeCompare(right.title);
}
