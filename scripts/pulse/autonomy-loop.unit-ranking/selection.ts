/**
 * Unit selection: stall detection, risk assessment, conflict detection,
 * and parallel unit assembly for automation.
 */
import type { PulseAutonomyIterationRecord, PulseAutonomyState } from '../types.autonomy';
import type {
  PulseAutonomousDirective,
  PulseAutonomousDirectiveUnit,
} from '../autonomy-loop.types';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import type { StructuralQueueInfluence } from './structural-rank';
import {
  getAiSafeUnits,
  riskMatchesGrammarLevel,
  riskLevelMatchesGrammarCritical,
  riskLevelMatchesGrammarHigh,
  riskProfileMatchesGrammarToken,
  strategyMatchesGrammarAdaptiveNarrowScope,
} from './structural-rank';
import { isSuppressedByMemory, compareAutomationUnits } from './runtime-rank';

// ── Stall detection ───────────────────────────────────────────────────────────

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

    const current = attempts.get(unitId) || {
      attempts: deriveZeroValue(),
      stalled: deriveZeroValue(),
    };
    current.attempts += u;
    const didImprove =
      record.improved === true ||
      (record.directiveDigestBefore !== null &&
        record.directiveDigestAfter !== null &&
        record.directiveDigestBefore !== record.directiveDigestAfter) ||
      (typeof record.directiveBefore?.score === 'number' &&
        record.directiveAfter !== null &&
        typeof record.directiveAfter.score === 'number' &&
        record.directiveAfter.score > record.directiveBefore.score) ||
      (record.directiveBefore !== null &&
        record.directiveAfter !== null &&
        record.directiveBefore.blockingTier !== null &&
        record.directiveAfter.blockingTier !== null &&
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

// ── Unit history ──────────────────────────────────────────────────────────────

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
  return Boolean(
    last && strategyMatchesGrammarAdaptiveNarrowScope(last.strategyMode) && last.improved === false,
  );
}

// ── Risk assessment ───────────────────────────────────────────────────────────

export function isRiskSafeForAutomation(
  unit: PulseAutonomousDirectiveUnit,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
): boolean {
  if (riskProfile === 'dangerous') return true;

  const risk = riskMatchesGrammarLevel(unit.riskLevel || '');
  if (
    riskLevelMatchesGrammarCritical(risk) ||
    (riskProfile === 'safe' && riskLevelMatchesGrammarHigh(risk))
  ) {
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

// ── Unit selection ────────────────────────────────────────────────────────────

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

// ── Conflict detection ────────────────────────────────────────────────────────

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

// ── Parallel unit selection ───────────────────────────────────────────────────

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
