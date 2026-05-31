// @@index: PT-BR description / log / metadata builders extracted from
// wallet.helpers.ts (Wave 64 / Gate-fix2-C). Pure string + JSON projections
// — no money arithmetic, no Prisma, no async, no I/O.

import type { SaleSplit } from './wallet.helpers.cents';

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
  const {
    grossAmount,
    grossAmountInCents,
    gatewayFeeInCents,
    kloelFeeInCents,
    netAmount,
    netAmountInCents,
  } = split;
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
