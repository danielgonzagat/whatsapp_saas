/**
 * Unit ranking and selection logic for the autonomy loop.
 * Determines which convergence units are safe and preferable for automation.
 */
import type {
  PulseAutonomyIterationRecord,
  PulseAutonomyState,
  PulseAutonomyUnitSnapshot,
} from './types';
import type { PulseAutonomousDirective, PulseAutonomousDirectiveUnit } from './autonomy-loop.types';
import { unique } from './autonomy-loop.utils';
import type { FalsePositiveAdjudicationState } from './types.false-positive-adjudicator';
import type {
  OperationalEvidenceKind,
  RuntimeFusionState,
  RuntimeSignal,
  SignalSource,
} from './types.runtime-fusion';
import type { StructuralMemoryState, UnitMemory } from './types.structural-memory';

export interface StructuralQueueInfluence {
  promotedUnitIds: Set<string>;
  suppressedUnitIds: Set<string>;
  deprioritizedUnitIds: Set<string>;
  strategyByUnitId: Map<string, string>;
  runtimeRealityByUnitId: Map<string, RuntimeRealityUnitMetadata>;
}

export interface RuntimeRealityUnitMetadata {
  unitId: string;
  rankScore: number;
  primarySignalId: string;
  primaryEvidenceKind: OperationalEvidenceKind;
  primarySource: SignalSource;
  evidenceMode: string;
  impactScore: number;
  confidence: number;
  affectedCapabilities: string[];
  affectedFlows: string[];
  reason: string;
}

function emptyStructuralQueueInfluence(): StructuralQueueInfluence {
  return {
    promotedUnitIds: new Set<string>(),
    suppressedUnitIds: new Set<string>(),
    deprioritizedUnitIds: new Set<string>(),
    strategyByUnitId: new Map<string, string>(),
    runtimeRealityByUnitId: new Map<string, RuntimeRealityUnitMetadata>(),
  };
}

export function toUnitSnapshot(
  unit: PulseAutonomousDirectiveUnit | null,
): PulseAutonomyUnitSnapshot | null {
  if (!unit) {
    return null;
  }

  return {
    id: unit.id,
    kind: unit.kind,
    priority: unit.priority,
    executionMode: unit.executionMode,
    title: unit.title,
    summary: unit.summary,
    affectedCapabilities: unit.affectedCapabilities || [],
    affectedFlows: unit.affectedFlows || [],
    validationTargets: unique([
      ...(unit.validationTargets || []),
      ...(unit.validationArtifacts || []),
      ...(unit.exitCriteria || []),
    ]),
  };
}

export function getAiSafeUnits(
  directive: PulseAutonomousDirective,
): PulseAutonomousDirectiveUnit[] {
  const seen = new Set<string>();
  const units = [
    ...(directive.pulseMachineNextWork || []),
    ...(directive.nextAutonomousUnits || []),
    ...(directive.nextExecutableUnits || []),
  ].filter((unit) => {
    if (seen.has(unit.id)) {
      return false;
    }
    seen.add(unit.id);
    return true;
  });

  return units.filter((unit) => unit.executionMode === 'ai_safe');
}

function getPriorityRank(priority: string): number {
  if (priority === 'P0') return 0;
  if (priority === 'P1') return 1;
  if (priority === 'P2') return 2;
  return 3;
}

function getRiskRank(riskLevel: string): number {
  const normalized = String(riskLevel || '')
    .trim()
    .toLowerCase();
  if (normalized === 'critical') return 3;
  if (normalized === 'high') return 2;
  if (normalized === 'medium') return 1;
  return 0;
}

function getEvidenceRank(evidenceMode: string): number {
  if (evidenceMode === 'observed') return 0;
  if (evidenceMode === 'inferred') return 1;
  return 2;
}

function getConfidenceRank(confidence: string): number {
  const normalized = String(confidence || '')
    .trim()
    .toLowerCase();
  if (normalized === 'high') return 3;
  if (normalized === 'medium') return 2;
  if (normalized === 'low') return 1;
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getKindExecutionPenalty(unit: PulseAutonomousDirectiveUnit): number {
  if (unit.kind === 'scenario') return 0;
  if (unit.kind === 'runtime' || unit.kind === 'change') return 1;
  if (unit.kind === 'dependency') return 2;
  if (unit.kind === 'capability') return 4;
  if (unit.kind === 'flow') return 5;
  if (unit.kind === 'gate') return 6;
  if (unit.kind === 'scope' || unit.kind === 'static') return 8;
  return 6;
}

function applyUnitMemoryInfluence(influence: StructuralQueueInfluence, unit: UnitMemory): void {
  if (unit.falsePositive || unit.status === 'resolved' || unit.status === 'archived') {
    influence.suppressedUnitIds.add(unit.unitId);
    return;
  }

  if (unit.status === 'escalated_validation') {
    influence.promotedUnitIds.add(unit.unitId);
  }

  if (unit.repeatedFailures > 0 && unit.status !== 'escalated_validation') {
    influence.deprioritizedUnitIds.add(unit.unitId);
  }

  if (unit.recommendedStrategy) {
    influence.strategyByUnitId.set(unit.unitId, unit.recommendedStrategy);
  }
}

export function buildStructuralQueueInfluence(
  memory?: StructuralMemoryState | null,
  adjudication?: FalsePositiveAdjudicationState | null,
): StructuralQueueInfluence {
  const influence = emptyStructuralQueueInfluence();

  for (const unit of memory?.units || []) {
    applyUnitMemoryInfluence(influence, unit);
  }

  for (const finding of adjudication?.findings || []) {
    if (finding.status !== 'false_positive' && finding.status !== 'accepted_risk') {
      continue;
    }

    const marker = finding.capabilityId || finding.filePath;
    if (!marker) {
      continue;
    }

    if (finding.status === 'false_positive') {
      influence.suppressedUnitIds.add(marker);
    } else {
      influence.deprioritizedUnitIds.add(marker);
    }
  }

  return influence;
}

function normalizeRuntimeEvidenceMode(mode: string | null | undefined): string {
  return String(mode || '')
    .trim()
    .toLowerCase();
}

function getOperationalEvidenceKindWeight(kind: OperationalEvidenceKind): number {
  if (kind === 'runtime') return 100;
  if (kind === 'change') return 65;
  if (kind === 'dependency') return 55;
  if (kind === 'external') return 40;
  return 10;
}

function getRuntimeEvidenceModeWeight(mode: string | null | undefined): number {
  const normalized = normalizeRuntimeEvidenceMode(mode);
  if (normalized === 'observed') return 3;
  if (normalized === 'inferred') return 1.5;
  if (normalized === 'simulated') return 0.5;
  return 0.25;
}

function getBoundedRuntimeScore(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, Number(value))) : fallback;
}

function signalMatchesUnit(unit: PulseAutonomousDirectiveUnit, signal: RuntimeSignal): boolean {
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

function getRuntimeSignalRankScore(signal: RuntimeSignal): number {
  const impactScore = getBoundedRuntimeScore(signal.impactScore, 0);
  const confidence = getBoundedRuntimeScore(signal.confidence, 0.5);
  return (
    getOperationalEvidenceKindWeight(signal.evidenceKind) *
    getRuntimeEvidenceModeWeight(signal.evidenceMode) *
    (0.6 + impactScore) *
    (0.5 + confidence)
  );
}

function buildRuntimeRealityReason(signal: RuntimeSignal): string {
  const evidenceMode = signal.evidenceMode || 'unknown';
  return `${signal.evidenceKind}/${evidenceMode} ${signal.source} signal ${signal.id} impact=${signal.impactScore.toFixed(2)} confidence=${signal.confidence.toFixed(2)}`;
}

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
      evidenceMode: primarySignal.evidenceMode || 'unknown',
      impactScore: getBoundedRuntimeScore(primarySignal.impactScore, 0),
      confidence: getBoundedRuntimeScore(primarySignal.confidence, 0.5),
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

function isSuppressedByMemory(
  unit: PulseAutonomousDirectiveUnit,
  influence?: StructuralQueueInfluence | null,
): boolean {
  if (!influence) return false;
  return unitMatchesMemoryMarker(unit, influence.suppressedUnitIds);
}

function unitMatchesMemoryMarker(
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

function getMemoryQueueRank(
  unit: PulseAutonomousDirectiveUnit,
  influence?: StructuralQueueInfluence | null,
): number {
  if (!influence) return 0;
  if (unitMatchesMemoryMarker(unit, influence.promotedUnitIds)) return -20;
  if (unitMatchesMemoryMarker(unit, influence.deprioritizedUnitIds)) return 20;
  return 0;
}

function getRuntimeRealityQueueRank(
  unit: PulseAutonomousDirectiveUnit,
  influence?: StructuralQueueInfluence | null,
): number {
  const metadata = influence?.runtimeRealityByUnitId.get(unit.id);
  return metadata ? -metadata.rankScore : 0;
}

function getPulseMachineQueueRank(unit: PulseAutonomousDirectiveUnit): number {
  return unit.source === 'pulse_machine' || unit.kind === 'pulse_machine' ? -100 : 0;
}

export function getAutomationExecutionCost(unit: PulseAutonomousDirectiveUnit): number {
  const capabilityCount = (unit.affectedCapabilities || []).length;
  const flowCount = (unit.affectedFlows || []).length;
  const validationCount = unique([
    ...(unit.validationTargets || []),
    ...(unit.validationArtifacts || []),
    ...(unit.exitCriteria || []),
  ]).length;
  const routePenalty = unit.kind === 'scenario' ? Math.max(0, capabilityCount - 2) * 3 : 0;

  return (
    getKindExecutionPenalty(unit) +
    capabilityCount * 3 +
    flowCount * 4 +
    validationCount +
    routePenalty +
    getRiskRank(unit.riskLevel) * 2 +
    getEvidenceRank(unit.evidenceMode)
  );
}
import "./__companions__/autonomy-loop.unit-ranking.companion";
