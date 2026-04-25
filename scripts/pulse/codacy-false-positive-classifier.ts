// PULSE — Codacy false-positive classifier.
//
// Classifies HIGH severity Codacy issues into:
//   - ACTIONABLE HIGH    : real findings the team can fix in product code.
//   - NON-ACTIONABLE HIGH: HIGH severity findings produced by Codacy
//                         demo/template patterns that are not applicable to
//                         this codebase. They cannot be silenced via comment
//                         suppressions (see REGRA DE CODACY in CLAUDE.md);
//                         they must be disabled upstream at the canonical
//                         Codacy enforcer with explicit human authorization.
//
// The classifier is intentionally CONSERVATIVE: only patterns that have been
// proven to be Codacy demo/template rules (or otherwise mis-targeted at this
// codebase) are listed. Adding a new entry requires evidence of why the
// pattern is non-actionable and what authorization is required to disable it.

import type { PulseCodacySummary } from './types.truth';
import type { CodacyClassification } from './types.codacy-classification';

export type { CodacyClassification } from './types.codacy-classification';

/**
 * Patterns Codacy reports against this repo that are NOT actionable findings.
 *
 * Each entry MUST be documented with:
 *   - Pattern source (Codacy registry / Semgrep registry / etc.).
 *   - Why it is non-actionable in this codebase.
 *   - What human authorization is required to disable it upstream.
 *
 * Entries are matched by exact patternId equality against
 * `PulseCodacyIssue.patternId`.
 */
export const NON_ACTIONABLE_PATTERNS: ReadonlyArray<string> = [
  // Semgrep DEMO/template rule from the Codacy `generic.sql` rule pack.
  // Requires every SQL identifier (table/column/view) to start with the
  // literal prefix `RAC_`. This is a registry demonstration pattern from the
  // r2c "Return After Continue" / RAC sample bundle and is not applicable to
  // KLOEL's domain schema (107 Prisma models, none of which use the RAC_
  // prefix). Renaming all SQL identifiers to satisfy this demo rule would
  // break every migration, every Prisma model, and every reporting query.
  // Authorization required: repository owner must disable this pattern via
  // `scripts/ops/codacy-enforce-max-rigor.mjs` (canonical Codacy enforcer)
  // before the staticPass gate can clear.
  'Semgrep_codacy.generic.sql.rac-table-access',
];

const NON_ACTIONABLE_SET: ReadonlySet<string> = new Set(NON_ACTIONABLE_PATTERNS);

function isHighIssue(severityLevel: string): boolean {
  return severityLevel === 'HIGH';
}

function buildHumanRequiredAction(byPattern: Record<string, number>): string {
  const entries = Object.entries(byPattern).sort((left, right) => right[1] - left[1]);
  const formatted = entries.map(([pattern, count]) => `${pattern} (${count})`).join('; ');
  return [
    'Codacy reports HIGH severity issues from non-actionable demo/template patterns.',
    'Suppression via inline comments is forbidden by REGRA DE CODACY (CLAUDE.md).',
    'Repository owner must disable the following pattern(s) via the canonical',
    'Codacy enforcer at scripts/ops/codacy-enforce-max-rigor.mjs after authorization:',
    formatted,
  ].join(' ');
}

/**
 * Classify Codacy HIGH severity issues into actionable vs non-actionable
 * buckets. The summary parameter accepts a parsed `PULSE_CODACY_STATE.json`
 * shape (`PulseCodacySummary`).
 */
export function classifyCodacyIssues(state: PulseCodacySummary): CodacyClassification {
  const totalHigh = state.severityCounts.HIGH || 0;
  const nonActionableByPattern: Record<string, number> = {};

  for (const issue of state.highPriorityBatch) {
    if (!isHighIssue(issue.severityLevel)) {
      continue;
    }
    if (!NON_ACTIONABLE_SET.has(issue.patternId)) {
      continue;
    }
    nonActionableByPattern[issue.patternId] = (nonActionableByPattern[issue.patternId] || 0) + 1;
  }

  const nonActionableHigh = Object.values(nonActionableByPattern).reduce(
    (sum, count) => sum + count,
    0,
  );

  // Guard against the highPriorityBatch being a sampled subset that
  // under-counts: if the batch counts more non-actionable than the total HIGH
  // (should not happen), clamp so actionableHigh never goes negative.
  const safeNonActionable = Math.min(nonActionableHigh, totalHigh);
  const actionableHigh = Math.max(0, totalHigh - safeNonActionable);

  const result: CodacyClassification = {
    actionableHigh,
    nonActionableHigh: safeNonActionable,
    totalHigh,
    nonActionableByPattern,
  };

  if (safeNonActionable > 0) {
    result.humanRequiredAction = buildHumanRequiredAction(nonActionableByPattern);
  }

  return result;
}
