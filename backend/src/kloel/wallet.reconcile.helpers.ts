// @@index: pure helpers extracted from wallet.service.ts (Wave 97)
// Side-effect-free utilities consumed by the reconciliation cron and the
// anticipation flow. No Prisma, no Date.now() reads, no logging — every
// time/state input arrives via parameters so specs stay deterministic.
//
// Why this file: keep the reconciliation aggregation + anticipation ledger
// metadata reviewable in isolation from the transactional plumbing in
// wallet.service. Same KLOEL Stripe-baseline discipline that gates the
// existing wallet.helpers.ts and wallet.read.helpers.ts.

/**
 * Compute the "older than `days` days" cutoff used by
 * `reconcilePendingPayments` to find stale pending transactions. The current
 * instant is injected so the helper stays referentially transparent under
 * spec — no hidden `Date.now()` read.
 *
 * Throws when `days` is not a non-negative finite number so a caller
 * misconfiguring the cron interval fails loudly instead of silently scanning
 * the entire backlog.
 */
export function computeReconciliationCutoff(now: Date, days: number): Date {
  if (!Number.isFinite(days) || days < 0) {
    throw new Error(`Invalid reconciliation window in days: ${days}`);
  }
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - days * MS_PER_DAY);
}

/** Per-transaction failure row captured during reconciliation. */
export interface ReconciliationFailure {
  txId: string;
  error: string;
}

/**
 * Append a failure to the accumulator and report whether it was the first
 * one. The cron uses the first-failure flag to surface an immediate
 * `reconciliationAlert` while subsequent failures roll into the aggregate
 * alert at the end of the sweep.
 *
 * Mutates `failures` in place to mirror the inlined `push` the cron used to
 * do — the caller already owns that array and the helper avoids allocating
 * a new one per failure on large batches.
 */
export function appendFailureAndCheckFirst(
  failures: ReconciliationFailure[],
  entry: ReconciliationFailure,
): boolean {
  const isFirstFailure = failures.length === 0;
  failures.push(entry);
  return isFirstFailure;
}

/** Result of {@link buildReconciliationFailureSummary}. */
export interface ReconciliationFailureSummary {
  message: string;
  details: { failures: ReconciliationFailure[] };
}

/**
 * Build the aggregate alert payload emitted at the end of a reconciliation
 * sweep when one or more per-transaction settlements failed. The shape
 * matches what `FinancialAlertService.reconciliationAlert` consumes so the
 * cron can hand the result through unchanged.
 *
 * Returns `null` when `failures` is empty — callers gate on a truthy result
 * to avoid emitting empty alerts on green sweeps.
 */
export function buildReconciliationFailureSummary(
  failures: readonly ReconciliationFailure[],
  totalProcessed: number,
): ReconciliationFailureSummary | null {
  if (failures.length === 0) {
    return null;
  }
  return {
    message: `wallet reconciliation: ${failures.length} of ${totalProcessed} settlements failed`,
    details: { failures: [...failures] },
  };
}

/**
 * Build the JSON metadata blob attached to the ledger debit entry for an
 * anticipation. The cron + `requestAnticipation` both emit a debit/credit
 * pair; this helper owns only the debit-side metadata so the inline literal
 * is reviewable from the spec.
 */
export function buildAnticipationLedgerDebitMetadata(input: {
  feePercent: number;
  feeAmountInCents: number;
}): { anticipation: true; feePercent: number; feeAmountInCents: number } {
  return {
    anticipation: true,
    feePercent: input.feePercent,
    feeAmountInCents: input.feeAmountInCents,
  };
}

/** Build the credit-side ledger metadata for an anticipation settlement. */
export function buildAnticipationLedgerCreditMetadata(): { anticipation: true } {
  return { anticipation: true };
}

/**
 * Build the `hasPix` metadata flag used by `requestWithdrawal` when it
 * appends the wallet ledger debit. Keeps the boolean-coercion contract
 * (`!!bankInfo.pixKey`) reviewable from a spec without a Prisma harness.
 */
export function buildWithdrawalLedgerMetadata(bankInfo: { pixKey?: unknown }): {
  hasPix: boolean;
} {
  return { hasPix: !!bankInfo.pixKey };
}
