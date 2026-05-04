import type { PulseAutonomyIterationRecord, PulseAutonomyState } from '../../types';
import type {
  PulseAutonomousDirective,
  PulseAutonomousDirectiveUnit,
} from '../../autonomy-loop.types';
import { getAiSafeUnits, isSuppressedByMemory, compareAutomationUnits } from './core';
import type { StructuralQueueInfluence } from './types';

export function isRiskSafeForAutomation(
  unit: PulseAutonomousDirectiveUnit,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
): boolean {
  if (riskProfile === 'dangerous') return true;
  const risk = String(unit.riskLevel || '')
    .trim()
    .toLowerCase();
  if (risk === 'critical' || (riskProfile === 'safe' && risk === 'high')) return false;
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

export function getStalledUnitIds(previousState?: PulseAutonomyState | null): Set<string> {
  const stalled = new Set<string>();
  const attempts = new Map<string, { attempts: number; stalled: number }>();
  for (const record of (previousState?.history || []).slice(-8)) {
    if (record.codex.executed === false && record.validation.executed === false) continue;
    const unitId = record.unit?.id;
    if (!unitId) continue;
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
    if (!didImprove) current.stalled += 1;
    attempts.set(unitId, current);
  }
  for (const [unitId, summary] of attempts.entries()) {
    if (summary.attempts >= 2 && summary.stalled >= 2) stalled.add(unitId);
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
    return (
      selectedCapabilities.some((value) => capabilitySet.has(value)) ||
      selectedFlows.some((value) => flowSet.has(value)) ||
      selectedOwnedFiles.some((value) => ownedFileSet.has(value))
    );
  });
}

export function selectParallelUnits(
  directive: PulseAutonomousDirective,
  parallelAgents: number,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): PulseAutonomousDirectiveUnit[] {
  const aiSafeUnits = getPreferredAutomationSafeUnits(directive, riskProfile, previousState);
  if (parallelAgents <= 1 || aiSafeUnits.length <= 1) return aiSafeUnits.slice(0, 1);
  const selected: PulseAutonomousDirectiveUnit[] = [];
  for (const unit of aiSafeUnits) {
    if (selected.length >= parallelAgents) break;
    if (selected.length === 0 || !hasUnitConflict(unit, selected)) selected.push(unit);
  }
  if (selected.length === 0 && aiSafeUnits[0]) return [aiSafeUnits[0]];
  return selected;
}
