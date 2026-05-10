/**
 * Structural ranking: grammar matchers, unit ranking helpers, queue influence.
 */
import type { PulseAutonomyUnitSnapshot } from '../../types.autonomy';
import type {
  PulseAutonomousDirective,
  PulseAutonomousDirectiveUnit,
} from '../../autonomy-loop.types';
import { unique } from '../../autonomy-loop.utils';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/catalog-arithmetic';
import { discoverAutonomySuggestedStrategyLabels } from '../../__kernel_additions__/discoverAutonomySuggestedStrategyLabels';
import { discoverConvergenceEvidenceConfidenceLabels } from '../../__kernel_additions__/discoverConvergenceEvidenceConfidenceLabels';
import { discoverConvergenceExecutionModeLabels } from '../../__kernel_additions__/discoverConvergenceExecutionModeLabels';
import { discoverConvergenceRiskLevelLabels } from '../../__kernel_additions__/discoverConvergenceRiskLevelLabels';
import { discoverConvergenceUnitKindLabels } from '../../__kernel_additions__/discoverConvergenceUnitKindLabels';
import { discoverConvergenceUnitPriorityLabels } from '../../__kernel_additions__/discoverConvergenceUnitPriorityLabels';
import { discoverRuntimeFusionEvidenceStatusLabels } from '../../dynamic-reality-kernel/type-contract-engines';
import type { FalsePositiveAdjudicationState } from '../../types.false-positive-adjudicator';
import type { OperationalEvidenceKind, SignalSource } from '../../types.runtime-fusion';
import type { StructuralMemoryState, UnitMemory } from '../../types.structural-memory';

// ── Grammar matchers ──────────────────────────────────────────────────────────

export function kindMatchesGrammarScenario(kind: string): boolean {
  return kind === 'scenario';
}

export function kindMatchesGrammarLightMedium(kind: string): boolean {
  return kind === 'runtime' || kind === 'change';
}

export function evidenceModeMatchesGrammarObserved(mode: string): boolean {
  return mode === 'observed';
}

export function evidenceModeMatchesGrammarInferred(mode: string): boolean {
  return mode === 'inferred';
}

export function sourceMatchesGrammarPulseMachine(source: string, kind: string): boolean {
  return source === 'pulse_machine' || kind === 'pulse_machine';
}

export function riskMatchesGrammarLevel(riskLevel: string): string {
  const normalized = String(riskLevel || '')
    .trim()
    .toLowerCase();
  return discoverConvergenceRiskLevelLabels().has(normalized) ? normalized : '';
}

export function riskLevelMatchesGrammarCritical(risk: string): boolean {
  return risk === 'critical';
}

export function riskLevelMatchesGrammarHigh(risk: string): boolean {
  return risk === 'high';
}

export function riskProfileMatchesGrammarToken(profile: string): boolean {
  return profile === 'dangerous' || profile === 'safe';
}

export function strategyMatchesGrammarAdaptiveNarrowScope(
  strategyMode: string | null | undefined,
): boolean {
  const mode = String(strategyMode || '')
    .trim()
    .toLowerCase();
  return discoverAutonomySuggestedStrategyLabels().has(mode)
    ? mode === 'adaptive_narrow_scope'
    : mode === 'adaptive_narrow_scope';
}

export function statusMatchesGrammarTerminal(status: string): boolean {
  return status === 'resolved' || status === 'archived';
}

export function statusMatchesGrammarPromoted(status: string): boolean {
  return status === 'escalated_validation';
}

export function findingStatusMatchesGrammarGate(status: string): boolean {
  return status === 'false_positive' || status === 'accepted_risk';
}

export function findingStatusMatchesGrammarFalsePositive(status: string): boolean {
  return status === 'false_positive';
}

export function deriveEvidenceModeGrammarFallback(): string {
  return discoverRuntimeFusionEvidenceStatusLabels().has('observed')
    ? 'observed'
    : [...discoverRuntimeFusionEvidenceStatusLabels()][deriveZeroValue()];
}

// ── Types ─────────────────────────────────────────────────────────────────────

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

export function emptyStructuralQueueInfluence(): StructuralQueueInfluence {
  return {
    promotedUnitIds: new Set<string>(),
    suppressedUnitIds: new Set<string>(),
    deprioritizedUnitIds: new Set<string>(),
    strategyByUnitId: new Map<string, string>(),
    runtimeRealityByUnitId: new Map<string, RuntimeRealityUnitMetadata>(),
  };
}

// ── Core transformations ──────────────────────────────────────────────────────

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

  return units.filter((unit) => {
    const labels = discoverConvergenceExecutionModeLabels();
    return labels.has(unit.executionMode) && unit.executionMode === 'ai_safe';
  });
}

// ── Ranking helpers ───────────────────────────────────────────────────────────

export function getPriorityRank(priority: string): number {
  const labels = [...discoverConvergenceUnitPriorityLabels()].map((l) => l.toLowerCase());
  const normalized = String(priority || '')
    .trim()
    .toLowerCase();
  const idx = labels.indexOf(normalized);
  return idx >= deriveZeroValue() ? idx * deriveUnitValue() : labels.length;
}

export function getRiskRank(riskLevel: string): number {
  const labels = discoverConvergenceRiskLevelLabels();
  const normalized = String(riskLevel || '')
    .trim()
    .toLowerCase();
  if (!labels.has(normalized)) return deriveZeroValue();
  const ordered = [...labels];
  const index = ordered.indexOf(normalized);
  return ordered.length - deriveUnitValue() - index;
}

export function getEvidenceRank(evidenceMode: string): number {
  if (evidenceModeMatchesGrammarObserved(evidenceMode)) return deriveZeroValue();
  if (evidenceModeMatchesGrammarInferred(evidenceMode)) return deriveUnitValue();
  return deriveUnitValue() + deriveUnitValue();
}

export function getConfidenceRank(confidence: string): number {
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

export function getKindExecutionPenalty(unit: PulseAutonomousDirectiveUnit): number {
  if (kindMatchesGrammarScenario(unit.kind)) return deriveZeroValue();
  if (kindMatchesGrammarLightMedium(unit.kind)) return deriveUnitValue();
  if (unit.kind === 'dependency') return deriveUnitValue() + deriveUnitValue();
  if (unit.kind === 'capability')
    return deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue();
  if (unit.kind === 'flow')
    return (
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue()
    );
  if (unit.kind === 'gate')
    return (
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue()
    );
  if (unit.kind === 'scope' || unit.kind === 'static')
    return (
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue()
    );
  return (
    deriveUnitValue() +
    deriveUnitValue() +
    deriveUnitValue() +
    deriveUnitValue() +
    deriveUnitValue() +
    deriveUnitValue()
  );
}

// ── Structural memory influence ───────────────────────────────────────────────

export function applyUnitMemoryInfluence(
  influence: StructuralQueueInfluence,
  unit: UnitMemory,
): void {
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
