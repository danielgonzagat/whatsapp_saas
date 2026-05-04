import type { PulseAutonomyUnitSnapshot } from '../../types';
import type {
  PulseAutonomousDirective,
  PulseAutonomousDirectiveUnit,
} from '../../autonomy-loop.types';
import { unique } from '../../autonomy-loop.utils';
import type { StructuralQueueInfluence } from './types';

export function toUnitSnapshot(
  unit: PulseAutonomousDirectiveUnit | null,
): PulseAutonomyUnitSnapshot | null {
  if (!unit) return null;
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
    if (seen.has(unit.id)) return false;
    seen.add(unit.id);
    return true;
  });
  return units.filter((unit) => unit.executionMode === 'ai_safe');
}

export function getPriorityRank(priority: string): number {
  if (priority === 'P0') return 0;
  if (priority === 'P1') return 1;
  if (priority === 'P2') return 2;
  return 3;
}
export function getRiskRank(riskLevel: string): number {
  const normalized = String(riskLevel || '')
    .trim()
    .toLowerCase();
  if (normalized === 'critical') return 3;
  if (normalized === 'high') return 2;
  if (normalized === 'medium') return 1;
  return 0;
}
export function getEvidenceRank(evidenceMode: string): number {
  if (evidenceMode === 'observed') return 0;
  if (evidenceMode === 'inferred') return 1;
  return 2;
}
export function getConfidenceRank(confidence: string): number {
  const normalized = String(confidence || '')
    .trim()
    .toLowerCase();
  if (normalized === 'high') return 3;
  if (normalized === 'medium') return 2;
  if (normalized === 'low') return 1;
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function getKindExecutionPenalty(unit: PulseAutonomousDirectiveUnit): number {
  if (unit.kind === 'scenario') return 0;
  if (unit.kind === 'runtime' || unit.kind === 'change') return 1;
  if (unit.kind === 'dependency') return 2;
  if (unit.kind === 'capability') return 4;
  if (unit.kind === 'flow') return 5;
  if (unit.kind === 'gate') return 6;
  if (unit.kind === 'scope' || unit.kind === 'static') return 8;
  return 6;
}

export function getPulseMachineQueueRank(unit: PulseAutonomousDirectiveUnit): number {
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

export function isSuppressedByMemory(
  unit: PulseAutonomousDirectiveUnit,
  influence?: StructuralQueueInfluence | null,
): boolean {
  if (!influence) return false;
  return unitMatchesMemoryMarker(unit, influence.suppressedUnitIds);
}

export function getMemoryQueueRank(
  unit: PulseAutonomousDirectiveUnit,
  influence?: StructuralQueueInfluence | null,
): number {
  if (!influence) return 0;
  if (unitMatchesMemoryMarker(unit, influence.promotedUnitIds)) return -20;
  if (unitMatchesMemoryMarker(unit, influence.deprioritizedUnitIds)) return 20;
  return 0;
}

export function getRuntimeRealityQueueRank(
  unit: PulseAutonomousDirectiveUnit,
  influence?: StructuralQueueInfluence | null,
): number {
  const metadata = influence?.runtimeRealityByUnitId.get(unit.id);
  return metadata ? -metadata.rankScore : 0;
}

export function compareAutomationUnits(
  left: PulseAutonomousDirectiveUnit,
  right: PulseAutonomousDirectiveUnit,
  influence?: StructuralQueueInfluence | null,
): number {
  const pulseMachineDelta = getPulseMachineQueueRank(left) - getPulseMachineQueueRank(right);
  if (pulseMachineDelta !== 0) return pulseMachineDelta;
  const memoryDelta = getMemoryQueueRank(left, influence) - getMemoryQueueRank(right, influence);
  if (memoryDelta !== 0) return memoryDelta;
  const runtimeRealityDelta =
    getRuntimeRealityQueueRank(left, influence) - getRuntimeRealityQueueRank(right, influence);
  if (runtimeRealityDelta !== 0) return runtimeRealityDelta;
  const costDelta = getAutomationExecutionCost(left) - getAutomationExecutionCost(right);
  if (costDelta !== 0) return costDelta;
  const priorityDelta = getPriorityRank(left.priority) - getPriorityRank(right.priority);
  if (priorityDelta !== 0) return priorityDelta;
  const confidenceDelta = getConfidenceRank(right.confidence) - getConfidenceRank(left.confidence);
  if (confidenceDelta !== 0) return confidenceDelta;
  return left.title.localeCompare(right.title);
}
