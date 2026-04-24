/**
 * Private ranking, cost, and stall-detection helpers for autonomy-decision.ts.
 * All functions are pure — no I/O, no side effects.
 */
import type { PulseAutonomyIterationRecord, PulseAutonomyState } from './types';
import { type PulseAutonomousDirectiveUnit } from './autonomy-types';
import { unique } from './autonomy-memory';

export function getPriorityRank(priority: string): number {
  if (priority === 'P0') return 0;
  if (priority === 'P1') return 1;
  if (priority === 'P2') return 2;
  return 3;
}

export function getRiskRank(riskLevel: string): number {
  const n = String(riskLevel || '')
    .trim()
    .toLowerCase();
  if (n === 'critical') return 3;
  if (n === 'high') return 2;
  if (n === 'medium') return 1;
  return 0;
}

export function getEvidenceRank(evidenceMode: string): number {
  if (evidenceMode === 'observed') return 0;
  if (evidenceMode === 'inferred') return 1;
  return 2;
}

export function getConfidenceRank(confidence: string): number {
  const n = String(confidence || '')
    .trim()
    .toLowerCase();
  if (n === 'high') return 3;
  if (n === 'medium') return 2;
  if (n === 'low') return 1;
  const numeric = Number.parseFloat(n);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function getKindExecutionPenalty(unit: PulseAutonomousDirectiveUnit): number {
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
  return (previousState?.history || []).filter((r) => r.unit?.id === unitId);
}

export function hasAdaptiveRetryBeenExhausted(
  previousState: PulseAutonomyState | null | undefined,
  unitId: string,
): boolean {
  const history = getUnitHistory(previousState, unitId);
  const last = history[history.length - 1];
  return Boolean(last && last.strategyMode === 'adaptive_narrow_scope' && last.improved === false);
}

export function extractMissingStructuralRoles(summary: string): string[] {
  const match = summary.match(/Missing structural roles:\s*([^.;]+)/i);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

export function compareAutomationUnits(
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
  if (risk === 'critical' || (riskProfile === 'safe' && risk === 'high')) return false;
  const capabilityCount = (unit.affectedCapabilities || []).length;
  const flowCount = (unit.affectedFlows || []).length;
  return riskProfile === 'safe'
    ? capabilityCount <= 8 && flowCount <= 2
    : capabilityCount <= 12 && flowCount <= 4;
}
