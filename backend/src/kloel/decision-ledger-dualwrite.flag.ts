/**
 * Feature flag for the ADDITIVE `RAC_MindPolicy` decision-ledger dual-write.
 *
 * P1-B prep (decision-ledger unification): the repo currently maintains TWO
 * parallel decision ledgers —
 *   - `DecisionOutcomeService` → `RAC_DecisionOutcome`
 *   - `MindPolicyService`       → `RAC_MindPolicy` (already carries the
 *                                 `outcome` / `baselineOutcome` columns).
 *
 * When this flag is set to `'true'`, `DecisionOutcomeService` ALSO mirrors each
 * decision it records / closes into `RAC_MindPolicy` (best-effort, never
 * breaking the canonical `RAC_DecisionOutcome` write). This pre-stages the
 * eventual read-cutover onto the single `RAC_MindPolicy` ledger.
 *
 * DEFAULT OFF. No read path consumes this flag. No backfill is performed.
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom
 * (e.g. `KLOEL_MINDMEMORY_DUALWRITE`).
 *
 * @see backend/src/kloel/decision-outcome.service.ts
 * @see backend/src/kloel/decision-ledger-dualwrite.helpers.ts
 */
export function isDecisionLedgerDualWriteEnabled(): boolean {
  return process.env.KLOEL_DECISION_LEDGER_DUALWRITE === 'true';
}
