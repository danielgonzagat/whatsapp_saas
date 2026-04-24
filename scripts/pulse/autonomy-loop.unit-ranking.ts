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
  if (unit.kind === 'capability') return 0;
  if (unit.kind === 'flow') return 4;
  if (unit.kind === 'scope' || unit.kind === 'gate' || unit.kind === 'static') return 7;
  if (unit.kind === 'runtime' || unit.kind === 'change' || unit.kind === 'dependency') return 9;
  if (unit.kind === 'scenario') return 12;
  return 6;
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
): number {
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
): PulseAutonomousDirectiveUnit[] {
  const units = getAiSafeUnits(directive).filter((unit) =>
    isRiskSafeForAutomation(unit, riskProfile),
  );

  return directive.nextAutonomousUnits && directive.nextAutonomousUnits.length > 0
    ? units
    : units.sort(compareAutomationUnits);
}

export function getFreshAutomationSafeUnits(
  directive: PulseAutonomousDirective,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): PulseAutonomousDirectiveUnit[] {
  const ranked = getAutomationSafeUnits(directive, riskProfile);
  const stalledUnitIds = getStalledUnitIds(previousState);
  return ranked.filter((unit) => !stalledUnitIds.has(unit.id));
}

export function getPreferredAutomationSafeUnits(
  directive: PulseAutonomousDirective,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): PulseAutonomousDirectiveUnit[] {
  const fresh = getFreshAutomationSafeUnits(directive, riskProfile, previousState);
  return fresh.length > 0 ? fresh : getAutomationSafeUnits(directive, riskProfile);
}

export function hasUnitConflict(
  unit: PulseAutonomousDirectiveUnit,
  selectedUnits: PulseAutonomousDirectiveUnit[],
): boolean {
  const capabilitySet = new Set(unit.affectedCapabilities || []);
  const flowSet = new Set(unit.affectedFlows || []);
  return selectedUnits.some((selected) => {
    const selectedCapabilities = selected.affectedCapabilities || [];
    const selectedFlows = selected.affectedFlows || [];
    const capabilityConflict = selectedCapabilities.some((value) => capabilitySet.has(value));
    const flowConflict = selectedFlows.some((value) => flowSet.has(value));
    return capabilityConflict || flowConflict;
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
