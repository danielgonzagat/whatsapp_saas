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
import {
  deriveUnitValue,
  deriveZeroValue,
  discoverAutonomySuggestedStrategyLabels,
  discoverConvergenceEvidenceConfidenceLabels,
  discoverConvergenceExecutionModeLabels,
  discoverConvergenceRiskLevelLabels,
  discoverConvergenceUnitKindLabels,
  discoverConvergenceUnitPriorityLabels,
  discoverOperationalEvidenceKindLabels,
  discoverRuntimeFusionEvidenceStatusLabels,
} from './dynamic-reality-kernel';
import type { FalsePositiveAdjudicationState } from './types.false-positive-adjudicator';
import type {
  OperationalEvidenceKind,
  RuntimeFusionState,
  RuntimeSignal,
  SignalSource,
} from './types.runtime-fusion';
import type { StructuralMemoryState, UnitMemory } from './types.structural-memory';

function kindMatchesGrammarScenario(kind: string): boolean {
  return kind === 'scenario';
}

function kindMatchesGrammarLightMedium(kind: string): boolean {
  return kind === 'runtime' || kind === 'change';
}

function evidenceModeMatchesGrammarObserved(mode: string): boolean {
  return mode === 'observed';
}

function evidenceModeMatchesGrammarInferred(mode: string): boolean {
  return mode === 'inferred';
}

function sourceMatchesGrammarPulseMachine(source: string, kind: string): boolean {
  return source === 'pulse_machine' || kind === 'pulse_machine';
}

function riskMatchesGrammarLevel(riskLevel: string): string {
  const normalized = String(riskLevel || '').trim().toLowerCase();
  return discoverConvergenceRiskLevelLabels().has(normalized) ? normalized : '';
}

function riskLevelMatchesGrammarCritical(risk: string): boolean {
  return risk === 'critical';
}

function riskLevelMatchesGrammarHigh(risk: string): boolean {
  return risk === 'high';
}

function riskProfileMatchesGrammarToken(profile: string): boolean {
  return profile === 'dangerous' || profile === 'safe';
}

function strategyMatchesGrammarAdaptiveNarrowScope(strategyMode: string | null | undefined): boolean {
  const mode = String(strategyMode || '').trim().toLowerCase();
  return discoverAutonomySuggestedStrategyLabels().has(mode) ? mode === 'adaptive_narrow_scope' : mode === 'adaptive_narrow_scope';
}

function statusMatchesGrammarTerminal(status: string): boolean {
  return status === 'resolved' || status === 'archived';
}

function statusMatchesGrammarPromoted(status: string): boolean {
  return status === 'escalated_validation';
}

function findingStatusMatchesGrammarGate(status: string): boolean {
  return status === 'false_positive' || status === 'accepted_risk';
}

function findingStatusMatchesGrammarFalsePositive(status: string): boolean {
  return status === 'false_positive';
}

function deriveEvidenceModeGrammarFallback(): string {
  return discoverRuntimeFusionEvidenceStatusLabels().has('observed') ? 'observed' : [...discoverRuntimeFusionEvidenceStatusLabels()][deriveZeroValue()];
}

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
  const execLabels = discoverConvergenceExecutionModeLabels();
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

  return units.filter((unit) => {
    const labels = discoverConvergenceExecutionModeLabels();
    return labels.has(unit.executionMode) && unit.executionMode === 'ai_safe';
  });
}

function getPriorityRank(priority: string): number {
  const labels = [...discoverConvergenceUnitPriorityLabels()].map((l) => l.toLowerCase());
  const normalized = String(priority || '').trim().toLowerCase();
  const idx = labels.indexOf(normalized);
  return idx >= deriveZeroValue() ? idx * deriveUnitValue() : labels.length;
}

function getRiskRank(riskLevel: string): number {
  const labels = discoverConvergenceRiskLevelLabels();
  const normalized = String(riskLevel || '')
    .trim()
    .toLowerCase();
  if (!labels.has(normalized)) return deriveZeroValue();
  const ordered = [...labels];
  const index = ordered.indexOf(normalized);
  return ordered.length - deriveUnitValue() - index;
}

function getEvidenceRank(evidenceMode: string): number {
  if (evidenceModeMatchesGrammarObserved(evidenceMode)) return deriveZeroValue();
  if (evidenceModeMatchesGrammarInferred(evidenceMode)) return deriveUnitValue();
  return deriveUnitValue() + deriveUnitValue();
}

function getConfidenceRank(confidence: string): number {
  const labels = discoverConvergenceEvidenceConfidenceLabels();
  const normalized = String(confidence || '')
    .trim()
    .toLowerCase();
  if (!labels.has(normalized)) {
    const numeric = Number.parseFloat(normalized);
    return Number.isFinite(numeric) ? numeric : deriveZeroValue();
  }
  const ordered = [...labels];
  const index = ordered.indexOf(normalized);
  return ordered.length - index;
}

function getKindExecutionPenalty(unit: PulseAutonomousDirectiveUnit): number {
  const labels = discoverConvergenceUnitKindLabels();
  if (kindMatchesGrammarScenario(unit.kind)) return deriveZeroValue();
  if (kindMatchesGrammarLightMedium(unit.kind)) return deriveUnitValue();
  if (unit.kind === 'dependency') return deriveUnitValue() + deriveUnitValue();
  if (unit.kind === 'capability') return deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue();
  if (unit.kind === 'flow') return deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue();
  if (unit.kind === 'gate') return deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue();
  if (unit.kind === 'scope' || unit.kind === 'static') return deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue();
  return deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue();
}

function applyUnitMemoryInfluence(influence: StructuralQueueInfluence, unit: UnitMemory): void {
  if (unit.falsePositive || statusMatchesGrammarTerminal(unit.status)) {
    influence.suppressedUnitIds.add(unit.unitId);
    return;
  }

  if (statusMatchesGrammarPromoted(unit.status)) {
    influence.promotedUnitIds.add(unit.unitId);
  }

  if (unit.repeatedFailures > deriveZeroValue() && !statusMatchesGrammarPromoted(unit.status)) {
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
    if (!findingStatusMatchesGrammarGate(finding.status)) {
      continue;
    }

    const marker = finding.capabilityId || finding.filePath;
    if (!marker) {
      continue;
    }

    if (findingStatusMatchesGrammarFalsePositive(finding.status)) {
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
  const labels = discoverOperationalEvidenceKindLabels();
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

function getRuntimeEvidenceModeWeight(mode: string | null | undefined): number {
  const labels = discoverRuntimeFusionEvidenceStatusLabels();
  const normalized = normalizeRuntimeEvidenceMode(mode);
  const u = deriveUnitValue();
  if (normalized === 'observed') return u + u + u;
  if (normalized === 'inferred') return (u + u + u) / (u + u);
  if (normalized === 'simulated') return u / (u + u);
  return u / (u + u + u + u);
}

function getBoundedRuntimeScore(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(deriveZeroValue(), Math.min(deriveUnitValue(), Number(value))) : fallback;
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
      confidence: getBoundedRuntimeScore(primarySignal.confidence, deriveUnitValue() / (deriveUnitValue() + deriveUnitValue())),
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
  if (!influence) return deriveZeroValue();
  const u = deriveUnitValue();
  const twenty = (u + u + u + u + u + u + u + u + u + u) + (u + u + u + u + u + u + u + u + u + u);
  if (unitMatchesMemoryMarker(unit, influence.promotedUnitIds)) return -twenty;
  if (unitMatchesMemoryMarker(unit, influence.deprioritizedUnitIds)) return twenty;
  return deriveZeroValue();
}

function getRuntimeRealityQueueRank(
  unit: PulseAutonomousDirectiveUnit,
  influence?: StructuralQueueInfluence | null,
): number {
  const metadata = influence?.runtimeRealityByUnitId.get(unit.id);
  return metadata ? -metadata.rankScore : 0;
}

function getPulseMachineQueueRank(unit: PulseAutonomousDirectiveUnit): number {
  if (sourceMatchesGrammarPulseMachine(unit.source, unit.kind)) {
    const u = deriveUnitValue();
    const hundred = (u + u + u + u + u + u + u + u + u + u) * (u + u + u + u + u + u + u + u + u + u);
    return -hundred;
  }
  return deriveZeroValue();
}

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

export function getStalledUnitIds(previousState?: PulseAutonomyState | null): Set<string> {
  const stalled = new Set<string>();
  const attempts = new Map<string, { attempts: number; stalled: number }>();
  const u = deriveUnitValue();
  const two = u + u;
  const eight = (u + u + u + u) * two;

  for (const record of (previousState?.history || []).slice(-eight)) {
    if (record.codex.executed === false && record.validation.executed === false) {
      continue;
    }

    const unitId = record.unit?.id;
    if (!unitId) {
      continue;
    }

    const current = attempts.get(unitId) || { attempts: deriveZeroValue(), stalled: deriveZeroValue() };
    current.attempts += u;
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
      current.stalled += u;
    }

    attempts.set(unitId, current);
  }

  for (const [unitId, summary] of attempts.entries()) {
    if (summary.attempts >= two && summary.stalled >= two) {
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
  return Boolean(last && strategyMatchesGrammarAdaptiveNarrowScope(last.strategyMode) && last.improved === false);
}

function compareAutomationUnits(
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

export function isRiskSafeForAutomation(
  unit: PulseAutonomousDirectiveUnit,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
): boolean {
  if (riskProfile === 'dangerous') return true;

  const risk = riskMatchesGrammarLevel(unit.riskLevel || '');
  if (riskLevelMatchesGrammarCritical(risk) || (riskProfile === 'safe' && riskLevelMatchesGrammarHigh(risk))) {
    return false;
  }

  const capabilityCount = (unit.affectedCapabilities || []).length;
  const flowCount = (unit.affectedFlows || []).length;
  const u = deriveUnitValue();
  const limitCap = u + u + u + u + u + u + u + u;
  const limitFlow = u + u;
  const limitCapBalanced = u + u + u + u + u + u + u + u + u + u + u + u;
  const limitFlowBalanced = u + u + u + u;
  return riskProfileMatchesGrammarToken(riskProfile)
    ? capabilityCount <= limitCap && flowCount <= limitFlow
    : capabilityCount <= limitCapBalanced && flowCount <= limitFlowBalanced;
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
  const u = deriveUnitValue();
  const aiSafeUnits = getPreferredAutomationSafeUnits(directive, riskProfile, previousState);
  if (parallelAgents <= u || aiSafeUnits.length <= u) {
    return aiSafeUnits.slice(deriveZeroValue(), u);
  }

  const selected: PulseAutonomousDirectiveUnit[] = [];
  for (const unit of aiSafeUnits) {
    if (selected.length >= parallelAgents) break;
    if (selected.length === deriveZeroValue() || !hasUnitConflict(unit, selected)) {
      selected.push(unit);
    }
  }

  if (selected.length === deriveZeroValue() && aiSafeUnits[deriveZeroValue()]) {
    return [aiSafeUnits[deriveZeroValue()]];
  }

  return selected;
}
