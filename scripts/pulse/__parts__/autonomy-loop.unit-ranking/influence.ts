import type { StructuralMemoryState, UnitMemory } from '../../types.structural-memory';
import type { FalsePositiveAdjudicationState } from '../../types.false-positive-adjudicator';
import type {
  OperationalEvidenceKind,
  RuntimeFusionState,
  RuntimeSignal,
  SignalSource,
} from '../../types.runtime-fusion';
import type {
  PulseAutonomousDirective,
  PulseAutonomousDirectiveUnit,
} from '../../autonomy-loop.types';
import { unique } from '../../autonomy-loop.utils';
import {
  emptyStructuralQueueInfluence,
  type StructuralQueueInfluence,
  type RuntimeRealityUnitMetadata,
} from './types';
import { getAiSafeUnits } from './core';

function applyUnitMemoryInfluence(influence: StructuralQueueInfluence, unit: UnitMemory): void {
  if (unit.falsePositive || unit.status === 'resolved' || unit.status === 'archived') {
    influence.suppressedUnitIds.add(unit.unitId);
    return;
  }
  if (unit.status === 'escalated_validation') influence.promotedUnitIds.add(unit.unitId);
  if (unit.repeatedFailures > 0 && unit.status !== 'escalated_validation')
    influence.deprioritizedUnitIds.add(unit.unitId);
  if (unit.recommendedStrategy)
    influence.strategyByUnitId.set(unit.unitId, unit.recommendedStrategy);
}

export function buildStructuralQueueInfluence(
  memory?: StructuralMemoryState | null,
  adjudication?: FalsePositiveAdjudicationState | null,
): StructuralQueueInfluence {
  const influence = emptyStructuralQueueInfluence();
  for (const unit of memory?.units || []) applyUnitMemoryInfluence(influence, unit);
  for (const finding of adjudication?.findings || []) {
    if (finding.status !== 'false_positive' && finding.status !== 'accepted_risk') continue;
    const marker = finding.capabilityId || finding.filePath;
    if (!marker) continue;
    if (finding.status === 'false_positive') influence.suppressedUnitIds.add(marker);
    else influence.deprioritizedUnitIds.add(marker);
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
  return `${signal.evidenceKind}/${signal.evidenceMode || 'unknown'} ${signal.source} signal ${signal.id} impact=${signal.impactScore.toFixed(2)} confidence=${signal.confidence.toFixed(2)}`;
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
    if (!primarySignal) continue;
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
  for (const metadata of buildRuntimeRealityUnitMetadata(getAiSafeUnits(directive), signals))
    influence.runtimeRealityByUnitId.set(metadata.unitId, metadata);
  return influence;
}
