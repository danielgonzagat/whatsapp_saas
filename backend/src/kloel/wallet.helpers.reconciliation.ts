// @@index: reconciliation / wallet-index helpers extracted from
// wallet.helpers.ts (Wave 64 / Gate-fix2-C). Pure projections — no Prisma,
// no async, no I/O.

/**
 * Pure projection used by the reconciliation cron: collect distinct, valid
 * wallet ids from a batch of pending transactions. Skips rows whose
 * `walletId` is null, empty, or a non-string — matching the inline filter
 * the cron previously inlined twice.
 */
export function uniqueWalletIds(pendingTxs: ReadonlyArray<{ walletId?: string | null }>): string[] {
  return [
    ...new Set(
      pendingTxs
        .map((tx) => tx.walletId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
}

/**
 * Build a Map keyed by wallet id, used by the reconciliation cron to look up
 * a wallet row in O(1) while iterating pending transactions. The map's value
 * shape is kept loose (`Record<string, unknown>`) because the cron only
 * consumes `id` + `workspaceId` and bigger payloads would over-narrow the
 * helper.
 */
export function buildWalletIndex<W extends { id: string }>(
  wallets: ReadonlyArray<W>,
): Map<string, W> {
  return new Map(wallets.map((w) => [w.id, w]));
}

/**
 * Build the log line emitted by `reconcilePendingPayments` after each
 * successful settlement. `formatBalance` is injected to keep the helper free
 * of the `money-format.util` dependency, matching the convention used by
 * `buildInsufficientBalanceMessage` / `buildSaleSplitLogMessage`.
 */
export function buildReconciliationSettledLogMessage(
  txId: string,
  amount: number,
  formatBalance: (value: number) => string,
): string {
  return `Settled tx ${txId}: ${formatBalance(amount)} -> available`;
}

/**
 * Build the log line emitted by `reconcilePendingPayments` at the start of a
 * non-empty sweep. Pure string projection of the batch size.
 */
export function buildReconciliationStartLogMessage(batchSize: number): string {
  return `Reconciling ${batchSize} pending transaction(s)...`;
}

/**
 * Build the log line emitted by `confirmPayment` when it returns `false`.
 * The three no-op reasons (`not_found`, `not_pending`, `race_lost`) are kept
 * verbatim so ops dashboards already parsing this string keep working.
 */
export function buildConfirmPaymentNoopLogMessage(
  transactionId: string,
  reason: 'not_found' | 'not_pending' | 'race_lost',
): string {
  return `confirmPayment noop for ${transactionId}: ${reason}`;
}

/**
 * Build the log line emitted by `reconcilePendingPayments` when a per-tx
 * settlement fails. Pure string projection so the parser-facing wording stays
 * locked.
 */
export function buildReconciliationFailedLogMessage(txId: string, errorMessage: string): string {
  return `Failed to settle tx ${txId}: ${errorMessage}`;
}
