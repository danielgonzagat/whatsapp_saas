// PULSE — Codacy false-positive classification types.
//
// Distinguishes ACTIONABLE HIGH severity Codacy issues (real findings against
// our code) from NON-ACTIONABLE HIGH issues raised by Codacy demo/template
// patterns that are not applicable to this codebase.
//
// REGRA DE CODACY (CLAUDE.md): suppression via comments is forbidden.
// Non-actionable patterns must be disabled at the canonical Codacy enforcer
// (`scripts/ops/codacy-enforce-max-rigor.mjs`) by the repository owner — the
// classifier merely surfaces the action required to a human.

/** Pulse codacy classification result shape. */
export interface CodacyClassification {
  /** High severity issues that this codebase can fix in product code. */
  actionableHigh: number;
  /** High severity issues raised by non-actionable (demo/template) patterns. */
  nonActionableHigh: number;
  /** Total HIGH severity issues observed in the snapshot. */
  totalHigh: number;
  /** Per-pattern counts for non-actionable HIGH issues. */
  nonActionableByPattern: Record<string, number>;
  /** Optional human instruction when non-actionable issues are present. */
  humanRequiredAction?: string;
}
