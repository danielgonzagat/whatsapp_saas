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

export function getStalledUnitIds(previousState?: PulseAutonomyState | null): Set<string> {
  const stalled = new Set<string>();
  const attempts = new Map<string, { attempts: number; stalled: number }>();

  for (const record of (previousState?.history || []).slice(-8)) {
    if (record.codex.executed === false && record.validation.executed === false) {
      continue;
    }

    const unitId = record.unit?.id;
    if (!unitId) {
      continue;
    }

    const current = attempts.get(unitId) || { attempts: 0, stalled: 0 };
    current.attempts += 1;
    const didImprove =
      record.improved === true ||
      (record.directiveDigestBefore !== null &&
        record.directiveDigestAfter !== null &&
        record.directiveDigestBefore !== record.directiveDigestAfter) ||
      (typeof record.directiveBefore?.score === 'number' &&
        typeof record.directiveAfter?.score === 'number' &&
        record.directiveAfter.score > record.directiveBefore.score) ||
      (record.directiveBefore?.blockingTier !== null &&
        record.directiveAfter?.blockingTier !== null &&
        record.directiveAfter.blockingTier < record.directiveBefore.blockingTier);

    if (!didImprove) {
      current.stalled += 1;
    }

    attempts.set(unitId, current);
  }

  for (const [unitId, summary] of attempts.entries()) {
    if (summary.attempts >= 2 && summary.stalled >= 2) {
      stalled.add(unitId);
    }
  }

  return stalled;
}

export function getUnitHistory(
  previousState: PulseAutonomyState | null | undefined,
  unitId: string,
): PulseAutonomyIterationRecord[] {
  return (previousState?.history || []).filter((record) => record.unit?.id === unitId);
}

export function hasAdaptiveRetryBeenExhausted(
  previousState: PulseAutonomyState | null | undefined,
  unitId: string,
): boolean {
  const history = getUnitHistory(previousState, unitId);
  const last = history[history.length - 1];
  return Boolean(last && last.strategyMode === 'adaptive_narrow_scope' && last.improved === false);
}

function compareAutomationUnits(
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

export function isRiskSafeForAutomation(
  unit: PulseAutonomousDirectiveUnit,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
): boolean {
  if (riskProfile === 'dangerous') return true;

  const risk = String(unit.riskLevel || '')
    .trim()
    .toLowerCase();
  if (risk === 'critical' || (riskProfile === 'safe' && risk === 'high')) {
    return false;
  }

  const capabilityCount = (unit.affectedCapabilities || []).length;
  const flowCount = (unit.affectedFlows || []).length;
  return riskProfile === 'safe'
    ? capabilityCount <= 8 && flowCount <= 2
    : capabilityCount <= 12 && flowCount <= 4;
}

export function getAutomationSafeUnits(
  directive: PulseAutonomousDirective,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  influence?: StructuralQueueInfluence | null,
): PulseAutonomousDirectiveUnit[] {
  const units = getAiSafeUnits(directive).filter((unit) =>
    isRiskSafeForAutomation(unit, riskProfile),
  );

  return units
    .filter((unit) => !isSuppressedByMemory(unit, influence))
    .sort((left, right) => compareAutomationUnits(left, right, influence));
}

export function getFreshAutomationSafeUnits(
  directive: PulseAutonomousDirective,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
  influence?: StructuralQueueInfluence | null,
): PulseAutonomousDirectiveUnit[] {
  const ranked = getAutomationSafeUnits(directive, riskProfile, influence);
  const stalledUnitIds = getStalledUnitIds(previousState);
  return ranked.filter((unit) => !stalledUnitIds.has(unit.id));
}

export function getPreferredAutomationSafeUnits(
  directive: PulseAutonomousDirective,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
  influence?: StructuralQueueInfluence | null,
): PulseAutonomousDirectiveUnit[] {
  const fresh = getFreshAutomationSafeUnits(directive, riskProfile, previousState, influence);
  return fresh.length > 0 ? fresh : getAutomationSafeUnits(directive, riskProfile, influence);
}

export function hasUnitConflict(
  unit: PulseAutonomousDirectiveUnit,
  selectedUnits: PulseAutonomousDirectiveUnit[],
): boolean {
  const capabilitySet = new Set(unit.affectedCapabilities || []);
  const flowSet = new Set(unit.affectedFlows || []);
  const ownedFileSet = new Set(unit.ownedFiles || []);
  return selectedUnits.some((selected) => {
    const selectedCapabilities = selected.affectedCapabilities || [];
    const selectedFlows = selected.affectedFlows || [];
    const selectedOwnedFiles = selected.ownedFiles || [];
    const capabilityConflict = selectedCapabilities.some((value) => capabilitySet.has(value));
    const flowConflict = selectedFlows.some((value) => flowSet.has(value));
    const fileConflict = selectedOwnedFiles.some((value) => ownedFileSet.has(value));
    return capabilityConflict || flowConflict || fileConflict;
  });
}

export function selectParallelUnits(
  directive: PulseAutonomousDirective,
  parallelAgents: number,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): PulseAutonomousDirectiveUnit[] {
  const aiSafeUnits = getPreferredAutomationSafeUnits(directive, riskProfile, previousState);
  if (parallelAgents <= 1 || aiSafeUnits.length <= 1) {
    return aiSafeUnits.slice(0, 1);
  }

  const selected: PulseAutonomousDirectiveUnit[] = [];
  for (const unit of aiSafeUnits) {
    if (selected.length >= parallelAgents) break;
    if (selected.length === 0 || !hasUnitConflict(unit, selected)) {
      selected.push(unit);
    }
  }

  if (selected.length === 0 && aiSafeUnits[0]) {
    return [aiSafeUnits[0]];
  }

  return selected;
}
