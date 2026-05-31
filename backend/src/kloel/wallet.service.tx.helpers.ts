import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import {
  buildAnticipationDescription,
  buildAnticipationTransactionMetadata,
  buildSaleLedgerMetadata,
  buildSaleTransactionMetadata,
  buildWalletAnticipationRowData,
  buildWithdrawalDescription,
  ConcurrentWalletUpdateError,
  type SaleSplit,
} from './wallet.helpers';
import {
  buildAnticipationLedgerCreditMetadata,
  buildAnticipationLedgerDebitMetadata,
  buildWithdrawalLedgerMetadata,
} from './wallet.reconcile.helpers';
import type { WalletLedgerService } from './wallet-ledger.service';

/**
 * Transactional inner-body helpers for WalletService. Extracted from
 * `wallet.service.ts` (Gate-fix2-D, 2026-05-28) so the public service stays
 * below the 600-LOC ratchet while preserving the exact $transaction semantics
 * (optimistic lock by `updatedAt`, status-flip atomicity, ledger pair inside
 * the same snapshot). Each helper accepts a Prisma `TransactionClient` already
 * opened by the caller plus the `WalletLedgerService` instance — no I/O
 * outside the supplied client.
 */

/** Discriminated union returned by {@link runConfirmPaymentTx}. */
export type ConfirmPaymentOutcome =
  | { kind: 'ok' }
  | { kind: 'not_found' }
  | { kind: 'not_pending' }
  | { kind: 'race_lost' };

/** Inputs for {@link runProcessSaleTx}. */
export interface RunProcessSaleTxArgs {
  tx: Prisma.TransactionClient;
  walletLedger: WalletLedgerService;
  wallet: { id: string; updatedAt: Date };
  workspaceId: string;
  saleId: string;
  description: string;
  netAmount: number;
  netAmountInCents: number;
  split: SaleSplit;
}

/**
 * Credit a sale into the wallet's `pending` bucket, persist the matching
 * transaction row, and append the I12 ledger entry — all inside the supplied
 * Prisma $transaction snapshot so they commit together or roll back together.
 */
export async function runProcessSaleTx(args: RunProcessSaleTxArgs): Promise<{ id: string }> {
  const {
    tx,
    walletLedger,
    wallet,
    workspaceId,
    saleId,
    description,
    netAmount,
    netAmountInCents,
    split,
  } = args;

  const credit = await tx.kloelWallet.updateMany({
    where: { id: wallet.id, workspaceId, updatedAt: wallet.updatedAt },
    data: {
      // DUAL-WRITE during the P6-2 → P6-3 observation window.
      pendingBalance: { increment: netAmount },
      pendingBalanceInCents: { increment: BigInt(netAmountInCents) },
    },
  });
  if (credit.count === 0) {
    throw new ConcurrentWalletUpdateError();
  }

  const created = await tx.kloelWalletTransaction.create({
    data: {
      walletId: wallet.id,
      type: 'credit',
      amount: netAmount,
      amountInCents: BigInt(netAmountInCents),
      description: `Venda: ${description}`,
      reference: saleId,
      status: 'pending',
      metadata: buildSaleTransactionMetadata(split),
    },
  });

  // I12 — append-only ledger entry for the credit, INSIDE the same
  // $transaction so the wallet update + ledger append commit together
  // or both roll back together.
  await walletLedger.appendWithinTx(tx, {
    workspaceId,
    walletId: wallet.id,
    transactionId: created.id,
    direction: 'credit',
    bucket: 'pending',
    amountInCents: BigInt(netAmountInCents),
    reason: 'sale_credit',
    metadata: buildSaleLedgerMetadata({ saleId, split }),
  });

  return created;
}

/** Inputs for {@link runConfirmPaymentTx}. */
export interface RunConfirmPaymentTxArgs {
  tx: Prisma.TransactionClient;
  walletLedger: WalletLedgerService;
  workspaceId: string;
  transactionId: string;
}

/**
 * Inner transactional body for `WalletService.confirmPayment`.
 *
 * Invariants:
 *  - The owning KloelWalletTransaction is read INSIDE the $transaction so the
 *    ownership check shares the snapshot with the subsequent writes.
 *  - Cross-tenant access throws `ForbiddenException('wallet_ownership_mismatch')`.
 *  - The pending→completed status flip is atomic at the DB layer; a `count=0`
 *    return means another worker beat us to it (idempotent double-confirm).
 *  - The pending→available bucket move uses an optimistic lock by `updatedAt`.
 *  - Two ledger entries (debit pending + credit available) are appended in
 *    the same snapshot so audits never observe a half-applied move.
 */
export async function runConfirmPaymentTx(
  args: RunConfirmPaymentTxArgs,
): Promise<ConfirmPaymentOutcome> {
  const { tx, walletLedger, workspaceId, transactionId } = args;

  const walletTx = await tx.kloelWalletTransaction.findUnique({
    where: { id: transactionId },
    include: { wallet: { select: { id: true, workspaceId: true, updatedAt: true } } },
  });

  if (!walletTx) {
    return { kind: 'not_found' };
  }
  if (walletTx.status !== 'pending') {
    return { kind: 'not_pending' };
  }

  // I10 — ownership assertion inside the transaction snapshot.
  if (walletTx.wallet.workspaceId !== workspaceId) {
    throw new ForbiddenException('wallet_ownership_mismatch');
  }

  // Atomic status transition. If another worker beat us to it, count=0
  // and we leave the balance untouched.
  const statusFlip = await tx.kloelWalletTransaction.updateMany({
    where: { id: transactionId, status: 'pending' },
    data: { status: 'completed' },
  });
  if (statusFlip.count === 0) {
    return { kind: 'race_lost' };
  }

  // DUAL-WRITE during the P6-2 → P6-3 observation window (I11).
  // Optimistic lock by `updatedAt` so a concurrent writer can't move
  // the same money twice between buckets.
  const moved = await tx.kloelWallet.updateMany({
    where: {
      id: walletTx.wallet.id,
      workspaceId: walletTx.wallet.workspaceId,
      updatedAt: walletTx.wallet.updatedAt,
    },
    data: {
      pendingBalance: { decrement: walletTx.amount },
      availableBalance: { increment: walletTx.amount },
      pendingBalanceInCents: { decrement: walletTx.amountInCents },
      availableBalanceInCents: { increment: walletTx.amountInCents },
    },
  });
  if (moved.count === 0) {
    return { kind: 'race_lost' };
  }

  // I12 — confirm_payment moves cents from `pending` to `available`
  // by writing TWO ledger entries (a debit on pending and a credit
  // on available) inside the same transaction snapshot.
  await walletLedger.appendWithinTx(tx, {
    workspaceId,
    walletId: walletTx.wallet.id,
    transactionId: walletTx.id,
    direction: 'debit',
    bucket: 'pending',
    amountInCents: walletTx.amountInCents,
    reason: 'confirm_payment_debit',
  });
  await walletLedger.appendWithinTx(tx, {
    workspaceId,
    walletId: walletTx.wallet.id,
    transactionId: walletTx.id,
    direction: 'credit',
    bucket: 'available',
    amountInCents: walletTx.amountInCents,
    reason: 'confirm_payment_credit',
  });

  return { kind: 'ok' };
}

/** Inputs for {@link runWithdrawalTx}. */
export interface RunWithdrawalTxArgs {
  tx: Prisma.TransactionClient;
  walletLedger: WalletLedgerService;
  wallet: { id: string; updatedAt: Date };
  workspaceId: string;
  amount: number;
  amountInCents: number;
  bankInfo: Record<string, unknown>;
}

/**
 * Debit `availableBalance` for a withdrawal, persist the transaction row, and
 * append the I12 ledger debit — all inside the supplied $transaction snapshot.
 */
export async function runWithdrawalTx(args: RunWithdrawalTxArgs): Promise<{ id: string }> {
  const { tx, walletLedger, wallet, workspaceId, amount, amountInCents, bankInfo } = args;

  const debit = await tx.kloelWallet.updateMany({
    where: { id: wallet.id, workspaceId, updatedAt: wallet.updatedAt },
    data: {
      availableBalance: { decrement: amount },
      availableBalanceInCents: { decrement: BigInt(amountInCents) },
    },
  });
  if (debit.count === 0) {
    throw new ConcurrentWalletUpdateError();
  }

  const created = await tx.kloelWalletTransaction.create({
    data: {
      walletId: wallet.id,
      type: 'withdrawal',
      amount: -amount,
      amountInCents: BigInt(-amountInCents),
      description: buildWithdrawalDescription(bankInfo),
      status: 'pending',
      metadata: bankInfo as Prisma.InputJsonValue,
    },
  });

  // I12 — withdrawal debits the `available` bucket. Sign is conveyed
  // by `direction`, so amountInCents is positive in the ledger row.
  await walletLedger.appendWithinTx(tx, {
    workspaceId,
    walletId: wallet.id,
    transactionId: created.id,
    direction: 'debit',
    bucket: 'available',
    amountInCents: BigInt(amountInCents),
    reason: 'withdrawal_debit',
    metadata: buildWithdrawalLedgerMetadata(bankInfo),
  });

  return created;
}

/** Inputs for {@link runAnticipationTx}. */
export interface RunAnticipationTxArgs {
  tx: Prisma.TransactionClient;
  walletLedger: WalletLedgerService;
  wallet: { id: string; updatedAt: Date };
  workspaceId: string;
  amount: number;
  feePercent: number;
  installments?: number;
  anticipation: {
    amountInCents: number;
    feeAmount: number;
    feeAmountInCents: number;
    netAmount: number;
    netAmountInCents: bigint;
  };
}

/**
 * Inner transactional body for `WalletService.requestAnticipation`. Moves the
 * full requested amount out of `pending`, credits the net to `available`,
 * persists the anticipation row, and emits the I12 debit/credit ledger pair.
 * The fee is effectively retained by Kloel (not credited to available).
 */
export async function runAnticipationTx(args: RunAnticipationTxArgs): Promise<{ id: string }> {
  const { tx, walletLedger, wallet, workspaceId, amount, feePercent, installments, anticipation } =
    args;
  const { amountInCents, feeAmount, feeAmountInCents, netAmount, netAmountInCents } = anticipation;

  // Move the full amount out of pending, credit net to available.
  const moved = await tx.kloelWallet.updateMany({
    where: { id: wallet.id, workspaceId, updatedAt: wallet.updatedAt },
    data: {
      pendingBalance: { decrement: amount },
      availableBalance: { increment: netAmount },
      pendingBalanceInCents: { decrement: BigInt(amountInCents) },
      availableBalanceInCents: { increment: netAmountInCents },
    },
  });
  if (moved.count === 0) {
    throw new ConcurrentWalletUpdateError();
  }

  const created = await tx.kloelWalletTransaction.create({
    data: {
      walletId: wallet.id,
      type: 'anticipation',
      amount: netAmount,
      amountInCents: netAmountInCents,
      description: buildAnticipationDescription(feePercent),
      status: 'completed',
      metadata: buildAnticipationTransactionMetadata({
        amount,
        feePercent,
        feeAmount,
        netAmount,
        ...(installments !== undefined ? { installments } : {}),
      }),
    },
  });

  // Persist the anticipation record for reporting.
  await tx.walletAnticipation.create({
    data: buildWalletAnticipationRowData({
      workspaceId,
      amount,
      feePercent,
      feeAmount,
      netAmount,
      transactionId: created.id,
      ...(installments !== undefined ? { installments } : {}),
    }),
  });

  // I12 — ledger entries: debit pending for the full amount,
  // credit available for the net (fee is not credited).
  await walletLedger.appendWithinTx(tx, {
    workspaceId,
    walletId: wallet.id,
    transactionId: created.id,
    direction: 'debit',
    bucket: 'pending',
    amountInCents: BigInt(amountInCents),
    reason: 'withdrawal_debit',
    metadata: buildAnticipationLedgerDebitMetadata({ feePercent, feeAmountInCents }),
  });
  await walletLedger.appendWithinTx(tx, {
    workspaceId,
    walletId: wallet.id,
    transactionId: created.id,
    direction: 'credit',
    bucket: 'available',
    amountInCents: netAmountInCents,
    reason: 'confirm_payment_credit',
    metadata: buildAnticipationLedgerCreditMetadata(),
  });

  return created;
}

export {
  runWithdrawalCentsTx,
  type RunWithdrawalCentsTxArgs,
} from './wallet.service.tx.withdraw-cents.helpers';
