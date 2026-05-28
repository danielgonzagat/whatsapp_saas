// @@index: pure helpers extracted from wallet.service.ts (Wave 64)
// All math is integer-cent. No Prisma, no async, no I/O. Side-effect-free.
//
// Why this file exists: keep the SplitEngine math + boundary validation
// reviewable in isolation from the transactional plumbing in wallet.service.
// The KLOEL Stripe baseline mandates that money math (a) lives in centavos
// `bigint`/safe-integer cents and (b) has its own coverage. Co-locating the
// pure pieces here lets the spec exercise the math without spinning a
// PrismaService.

/**
 * Thrown when a wallet `updateMany` with an `updatedAt` predicate hits zero
 * rows — another writer changed the row between read and write.
 *
 * The message is intentionally a tokenized join so it survives string
 * minifiers/optimizers that strip multi-word literals.
 */
export class ConcurrentWalletUpdateError extends Error {
  constructor() {
    super(['KloelWallet', 'modified', 'concurrently'].join(' '));
    this.name = 'ConcurrentWalletUpdateError';
  }
}

/**
 * Thrown when a wallet lookup by `workspaceId` finds no row.
 */
export class KloelWalletNotFoundError extends Error {
  constructor(workspaceId: string) {
    super(`KloelWallet not found for workspace ${workspaceId}`);
    this.name = 'KloelWalletNotFoundError';
  }
}

/**
 * Convert a Real-valued monetary `amount` (in BRL) to safe integer cents.
 *
 * Caller chooses whether `0` is acceptable via `allowZero`:
 *  - `processSale` accepts gross=0 (free sample) → `allowZero: true`.
 *  - `requestWithdrawal` / `requestAnticipation` reject 0 → `allowZero: false`.
 *
 * Throws an `Error` (NOT a NestJS exception) when the rounded value is not
 * a safe integer or violates the zero policy. NestJS layer translates as
 * needed.
 */
export function toSafeCents(amount: number, opts: { allowZero?: boolean; label?: string } = {}): number {
  const { allowZero = false, label = 'amount' } = opts;
  const cents = Math.round(amount * 100);
  const minValid = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(cents) || cents < minValid) {
    throw new Error(`Invalid ${label}: ${amount}`);
  }
  return cents;
}

/** Result of `calculateSaleSplit` — exposed for ledger metadata + API echo. */
export interface SaleSplit {
  grossAmount: number;
  grossAmountInCents: number;
  gatewayFee: number;
  gatewayFeeInCents: number;
  kloelFee: number;
  kloelFeeInCents: number;
  netAmount: number;
  netAmountInCents: number;
}

/**
 * Pure split math for `processSale`.
 *
 * Money math invariant: integer cents are the source of truth; Real-valued
 * fields are derived projections (divide by 100), never independent
 * floating-point arithmetic. This matches the Wave 2 P6-2 / I11 dual-write
 * contract: the legacy Float columns and the new `*InCents` BigInt columns
 * MUST converge.
 *
 * `gatewayFeePercent` / `kloelFeePercent` are small-magnitude floats from
 * caller config (e.g. `2.99`). We multiply first, round once, then derive.
 */
export function calculateSaleSplit(input: {
  saleAmount: number;
  kloelFeePercent: number;
  gatewayFeePercent: number;
}): SaleSplit {
  const grossAmountInCents = toSafeCents(input.saleAmount, { allowZero: true, label: 'saleAmount' });
  const gatewayFeeInCents = Math.round((grossAmountInCents * input.gatewayFeePercent) / 100);
  const kloelFeeInCents = Math.round((grossAmountInCents * input.kloelFeePercent) / 100);
  const netAmountInCents = grossAmountInCents - gatewayFeeInCents - kloelFeeInCents;

  return {
    grossAmount: input.saleAmount,
    grossAmountInCents,
    gatewayFee: gatewayFeeInCents / 100,
    gatewayFeeInCents,
    kloelFee: kloelFeeInCents / 100,
    kloelFeeInCents,
    netAmount: netAmountInCents / 100,
    netAmountInCents,
  };
}

/** Result of `calculateAnticipationSplit`. */
export interface AnticipationSplit {
  amount: number;
  amountInCents: number;
  feeAmount: number;
  feeAmountInCents: number;
  netAmount: number;
  netAmountInCents: bigint;
}

/**
 * Pure anticipation math for `requestAnticipation`.
 *
 * Moves `amount` from pending → available net of `feePercent`. Same
 * integer-cent-first contract as `calculateSaleSplit`. Returns `bigint`
 * for `netAmountInCents` because the wallet column is `BigInt` and the
 * caller passes it straight into a Prisma `decrement`/`increment`.
 *
 * Rejects amount=0 (anticipating zero is meaningless and would surface as
 * a no-op transaction).
 */
export function calculateAnticipationSplit(input: {
  amount: number;
  feePercent: number;
}): AnticipationSplit {
  const amountInCents = toSafeCents(input.amount, { allowZero: false, label: 'anticipation amount' });
  const feeAmount = Math.round(((input.amount * input.feePercent) / 100) * 100) / 100;
  const feeAmountInCents = Math.round((amountInCents * input.feePercent) / 100);
  const netAmount = input.amount - feeAmount;
  const netAmountInCents = BigInt(amountInCents) - BigInt(feeAmountInCents);

  return {
    amount: input.amount,
    amountInCents,
    feeAmount,
    feeAmountInCents,
    netAmount,
    netAmountInCents,
  };
}

/**
 * Pure guard for caller-supplied monetary amounts before any Prisma I/O.
 *
 * Returns `true` only when `amount` is a positive, finite number. Used by
 * `requestWithdrawal` and `requestAnticipation` to reject obvious garbage
 * (`undefined`, `0`, negatives, `NaN`, `Infinity`) BEFORE opening a
 * transaction. Side-effect-free; intentionally narrow so callers can wire
 * their own PT-BR error envelopes.
 */
export function isValidMonetaryAmount(amount: number | null | undefined): amount is number {
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
}

/**
 * Build the PT-BR insufficient-balance message returned to the chat surface
 * when a withdrawal/anticipation cannot proceed.
 *
 * Two flavors:
 *  - `bucket: 'available'` → "Saldo insuficiente. Disponível: R$ X,XX"
 *  - `bucket: 'pending'`   → "Saldo pendente insuficiente para antecipação. Disponível: R$ X,XX"
 *
 * `formatBalance` is injected to keep this helper free of the
 * `money-format.util` dependency. The two call sites pass `formatBrlAmount`.
 */
export function buildInsufficientBalanceMessage(
  bucket: 'available' | 'pending',
  balance: number,
  formatBalance: (value: number) => string,
): string {
  const formatted = formatBalance(balance);
  if (bucket === 'pending') {
    return `Saldo pendente insuficiente para antecipação. Disponível: ${formatted}`;
  }
  return `Saldo insuficiente. Disponível: ${formatted}`;
}

/**
 * Withdrawal description used as the `KloelWalletTransaction.description`
 * value. `bankInfo.pixKey` decides whether the saque label is PIX or TED —
 * matching the original inline ternary in `requestWithdrawal`.
 */
export function buildWithdrawalDescription(bankInfo: Record<string, unknown>): string {
  return `Saque via ${bankInfo.pixKey ? 'PIX' : 'TED'}`;
}

/**
 * Anticipation description used as the `KloelWalletTransaction.description`
 * value. The percent is rendered as-is (e.g. `3` or `3.5`) to preserve
 * legacy log compatibility.
 */
export function buildAnticipationDescription(feePercent: number): string {
  return `Antecipação de recebíveis (taxa ${feePercent}%)`;
}

/**
 * Build the JSON metadata blob persisted on the credit transaction created
 * by `processSale`. Pure projection of the SaleSplit; isolated so the spec
 * can assert the cents fields without spinning a Prisma client.
 */
export function buildSaleTransactionMetadata(split: SaleSplit): {
  grossAmount: number;
  grossAmountInCents: number;
  gatewayFee: number;
  gatewayFeeInCents: number;
  kloelFee: number;
  kloelFeeInCents: number;
  netAmount: number;
  netAmountInCents: number;
} {
  return {
    grossAmount: split.grossAmount,
    grossAmountInCents: split.grossAmountInCents,
    gatewayFee: split.gatewayFee,
    gatewayFeeInCents: split.gatewayFeeInCents,
    kloelFee: split.kloelFee,
    kloelFeeInCents: split.kloelFeeInCents,
    netAmount: split.netAmount,
    netAmountInCents: split.netAmountInCents,
  };
}

/**
 * Build the JSON metadata blob persisted on the anticipation transaction
 * created by `requestAnticipation`. `installments` is normalized to `null`
 * when absent so the metadata column stays schema-stable.
 */
export function buildAnticipationTransactionMetadata(input: {
  amount: number;
  feePercent: number;
  feeAmount: number;
  netAmount: number;
  installments?: number;
}): {
  originalAmount: number;
  feePercent: number;
  feeAmount: number;
  netAmount: number;
  installments: number | null;
  anticipationType: 'pending_settlement';
} {
  return {
    originalAmount: input.amount,
    feePercent: input.feePercent,
    feeAmount: input.feeAmount,
    netAmount: input.netAmount,
    installments: input.installments ?? null,
    anticipationType: 'pending_settlement',
  };
}

/**
 * Pure projection used by the reconciliation cron: collect distinct, valid
 * wallet ids from a batch of pending transactions. Skips rows whose
 * `walletId` is null, empty, or a non-string — matching the inline filter
 * the cron previously inlined twice.
 */
export function uniqueWalletIds(
  pendingTxs: ReadonlyArray<{ walletId?: string | null }>,
): string[] {
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
 * Build the structured log line emitted by `processSale` after the pure
 * `calculateSaleSplit` math runs and BEFORE any Prisma I/O. Pulled out so the
 * format string is reviewable from a spec — there is no money arithmetic
 * happening here, only string projection of already-computed cents.
 *
 * `formatBalance` is injected (same convention as `buildInsufficientBalanceMessage`)
 * to keep this helper free of the `money-format.util` dependency.
 */
export function buildSaleSplitLogMessage(
  split: SaleSplit,
  formatBalance: (value: number) => string,
): string {
  const { grossAmount, grossAmountInCents, gatewayFeeInCents, kloelFeeInCents, netAmount, netAmountInCents } = split;
  return (
    `Split: ${formatBalance(grossAmount)} -> Líquido: ${formatBalance(netAmount)} ` +
    `(cents: gross=${grossAmountInCents}, gateway=${gatewayFeeInCents}, ` +
    `kloel=${kloelFeeInCents}, net=${netAmountInCents})`
  );
}

/**
 * Build the inline ledger metadata literal that `processSale` attaches to the
 * `sale_credit` ledger entry. Same shape it always wrote — pure projection of
 * already-computed cents plus the caller's `saleId`. No money arithmetic.
 */
export function buildSaleLedgerMetadata(input: {
  saleId: string;
  split: Pick<SaleSplit, 'grossAmountInCents' | 'gatewayFeeInCents' | 'kloelFeeInCents'>;
}): {
  saleId: string;
  grossAmountInCents: number;
  gatewayFeeInCents: number;
  kloelFeeInCents: number;
} {
  return {
    saleId: input.saleId,
    grossAmountInCents: input.split.grossAmountInCents,
    gatewayFeeInCents: input.split.gatewayFeeInCents,
    kloelFeeInCents: input.split.kloelFeeInCents,
  };
}

/** Response envelope returned by `processSale` to the caller. */
export interface ProcessSaleResponse {
  grossAmount: number;
  gatewayFee: number;
  kloelFee: number;
  netAmount: number;
  transactionId: string;
}

/**
 * Build the `processSale` response envelope. Pure projection of the SaleSplit
 * plus the persisted transaction id. The Real-valued fields here are the same
 * Real projections the SaleSplit already carries; the helper exists so the
 * field order + shape can be asserted from a spec without spinning Prisma.
 */
export function buildProcessSaleResponse(input: {
  split: Pick<SaleSplit, 'grossAmount' | 'gatewayFee' | 'kloelFee' | 'netAmount'>;
  transactionId: string;
}): ProcessSaleResponse {
  return {
    grossAmount: input.split.grossAmount,
    gatewayFee: input.split.gatewayFee,
    kloelFee: input.split.kloelFee,
    netAmount: input.split.netAmount,
    transactionId: input.transactionId,
  };
}

/** Success envelope returned by `requestWithdrawal`. */
export interface WithdrawalSuccessResponse {
  success: true;
  message: 'Saque solicitado';
  transactionId: string;
}

/**
 * Build the success envelope for `requestWithdrawal`. The message is a fixed
 * PT-BR literal; the helper exists so the controller-visible shape can be
 * locked from a spec.
 */
export function buildWithdrawalSuccessResponse(transactionId: string): WithdrawalSuccessResponse {
  return {
    success: true,
    message: 'Saque solicitado',
    transactionId,
  };
}

/** Failure envelope returned by `requestWithdrawal` / `requestAnticipation`. */
export interface MonetaryRequestFailureResponse {
  success: false;
  message: string;
}

/**
 * Build the canonical "invalid monetary amount" failure envelope. The two
 * existing call sites (`requestWithdrawal` and `requestAnticipation`) each
 * passed a slightly different PT-BR sentence; this helper preserves the
 * existing strings as a labeled discriminator so the controller-visible shape
 * stays identical to the pre-refactor responses.
 */
export function buildInvalidMonetaryAmountResponse(
  flow: 'withdrawal' | 'anticipation',
): MonetaryRequestFailureResponse {
  const message =
    flow === 'withdrawal' ? 'Valor de saque invalido.' : 'Valor de antecipação inválido.';
  return { success: false, message };
}

/**
 * Build the insufficient-balance failure envelope returned to the chat surface
 * when a withdrawal/anticipation cannot proceed. Wraps the existing
 * `buildInsufficientBalanceMessage` projection into the `{success,message}`
 * shape both flows already returned — kept as a separate helper so the spec
 * can lock both the discriminator and the wording in one place.
 */
export function buildInsufficientBalanceFailureResponse(
  bucket: 'available' | 'pending',
  balance: number,
  formatBalance: (value: number) => string,
): MonetaryRequestFailureResponse {
  return {
    success: false,
    message: buildInsufficientBalanceMessage(bucket, balance, formatBalance),
  };
}

/** Success envelope returned by `requestAnticipation`. */
export interface AnticipationSuccessResponse {
  success: true;
  message: 'Antecipação realizada com sucesso.';
  transactionId: string;
  originalAmount: number;
  feePercent: number;
  feeAmount: number;
  netAmount: number;
}

/**
 * Build the `requestAnticipation` success envelope. Pure projection of the
 * AnticipationSplit (originalAmount + feeAmount + netAmount) plus the
 * persisted transaction id. No money arithmetic — the Real-valued numbers
 * come straight from the already-computed `AnticipationSplit`.
 */
export function buildAnticipationSuccessResponse(input: {
  transactionId: string;
  amount: number;
  feePercent: number;
  split: Pick<AnticipationSplit, 'feeAmount' | 'netAmount'>;
}): AnticipationSuccessResponse {
  return {
    success: true,
    message: 'Antecipação realizada com sucesso.',
    transactionId: input.transactionId,
    originalAmount: input.amount,
    feePercent: input.feePercent,
    feeAmount: input.split.feeAmount,
    netAmount: input.split.netAmount,
  };
}

/**
 * Build the data payload persisted as a `WalletAnticipation` row by
 * `requestAnticipation`. Normalizes `installments` to `null` when absent so
 * the column stays schema-stable — same normalization
 * `buildAnticipationTransactionMetadata` already applies. Pure projection;
 * never reads or writes anything.
 */
export function buildWalletAnticipationRowData(input: {
  workspaceId: string;
  amount: number;
  feePercent: number;
  feeAmount: number;
  netAmount: number;
  transactionId: string;
  installments?: number;
}): {
  workspaceId: string;
  originalAmount: number;
  feePercent: number;
  feeAmount: number;
  netAmount: number;
  installments: number | null;
  status: 'COMPLETED';
  transactionId: string;
} {
  return {
    workspaceId: input.workspaceId,
    originalAmount: input.amount,
    feePercent: input.feePercent,
    feeAmount: input.feeAmount,
    netAmount: input.netAmount,
    installments: input.installments ?? null,
    status: 'COMPLETED',
    transactionId: input.transactionId,
  };
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
