/**
 * UTP-RECOVERY-006 — Error Narrative Builder.
 *
 * Folds detected errors and their recovery tactics into a weekly
 * narrative entry suitable for the DRIFT consumer (Camada X).
 * Produces an ErrorNarrative with structured entries, recovery
 * summary, and trust impact assessment.
 *
 * Pure function — takes detected errors + tactics and produces narrative.
 */

import { randomUUID } from 'node:crypto';
import type {
  DetectedError,
  ErrorNarrative,
  ErrorNarrativeEntry,
  RecoveryTactic,
} from './recovery.types';

/**
 * Compute the start of the ISO week for a given date.
 */
function weekStart(nowMs: number): string {
  const d = new Date(nowMs);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function resolveOutcome(
  error: DetectedError,
  tactic: RecoveryTactic,
): ErrorNarrativeEntry['outcome'] {
  if (tactic.action === 'silence') {return 'unresolved';}
  if (error.severity === 'high') {return 'pending';}
  return 'recovered';
}

function makeEntry(
  error: DetectedError,
  tactic: RecoveryTactic | null,
): ErrorNarrativeEntry {
  return {
    errorId: error.errorId,
    category: error.category,
    detectedAt: error.detectedAt,
    recoveryTactic: tactic?.action ?? null,
    outcome: tactic ? resolveOutcome(error, tactic) : 'pending',
  };
}

function computeTrustImpact(
  entries: readonly ErrorNarrativeEntry[],
): ErrorNarrative['trustImpact'] {
  const resolved = entries.filter((e) => e.outcome === 'recovered').length;
  const unresolved = entries.filter((e) => e.outcome === 'unresolved').length;

  if (unresolved > resolved) {return 'declining';}
  if (resolved > 0 && unresolved === 0) {return 'improving';}
  return 'stable';
}

function buildRecoverySummary(
  entries: readonly ErrorNarrativeEntry[],
): string {
  if (entries.length === 0) {return 'Nenhum erro detectado no período.';}

  const recovered = entries.filter((e) => e.outcome === 'recovered').length;
  const pending = entries.filter((e) => e.outcome === 'pending').length;
  const unresolved = entries.filter((e) => e.outcome === 'unresolved').length;

  let summary = `${entries.length} erro(s) detectado(s): `;
  if (recovered > 0) {summary += `${recovered} recuperado(s), `;}
  if (pending > 0) {summary += `${pending} pendente(s), `;}
  if (unresolved > 0) {summary += `${unresolved} não resolvido(s)`;}
  summary = summary.replace(/, $/, '.');

  return summary;
}

/**
 * Build a weekly error narrative for DRIFT consumption (Camada X).
 *
 * Input: DetectedError[], RecoveryTactic[], workspaceId, nowMs
 * Output: ErrorNarrative (structured weekly error narrative)
 */
export function buildErrorNarrative(
  errors: readonly DetectedError[],
  tactics: ReadonlyMap<string, RecoveryTactic>,
  workspaceId: string,
  nowMs: number,
): ErrorNarrative {
  const entries: ErrorNarrativeEntry[] = errors.map((error) => {
    const tactic = tactics.get(error.errorId) ?? null;
    return makeEntry(error, tactic);
  });

  return {
    narrativeId: `nar_${randomUUID()}`,
    weekStart: weekStart(nowMs),
    workspaceId,
    errors: entries,
    recoverySummary: buildRecoverySummary(entries),
    trustImpact: computeTrustImpact(entries),
  };
}
