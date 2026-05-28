// @@index: API response envelopes + WalletAnticipation row payload extracted
// from wallet.helpers.ts (Wave 64 / Gate-fix2-C). Pure projections — no
// money arithmetic, no Prisma, no async, no I/O.

import type { AnticipationSplit, SaleSplit } from './wallet.helpers.cents';
import { buildInsufficientBalanceMessage } from './wallet.helpers.descriptions';

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
