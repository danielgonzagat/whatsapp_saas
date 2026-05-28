import type { Prisma } from '@prisma/client';

import { forEachSequential } from '../common/async-sequence';
import type { StructuredLogger } from '../logging/structured-logger';
import type { FinancialAlertService } from '../common/financial-alert.service';
import type { OpsAlertService } from '../observability/ops-alert.service';
import type { PrismaService } from '../prisma/prisma.service';
import { formatBrlAmount } from './money-format.util';
import {
  buildReconciliationFailedLogMessage,
  buildReconciliationSettledLogMessage,
  buildWalletIndex,
} from './wallet.helpers';
import {
  appendFailureAndCheckFirst,
  type ReconciliationFailure,
} from './wallet.reconcile.helpers';
import type { WalletLedgerService } from './wallet-ledger.service';

/**
 * Per-transaction settlement worker for the reconciliation cron, extracted
 * from `wallet.service.ts` (Gate-fix2-D, 2026-05-28). The cron iterates the
 * pending tx batch and delegates each row to this helper; failures are
 * accumulated into the `failures` array via {@link appendFailureAndCheckFirst}
 * so a single bad row never aborts the whole sweep.
 */

export interface SettleStalePendingTxInput {
  prisma: PrismaService;
  walletLedger: WalletLedgerService;
  financialAlert: FinancialAlertService;
  opsAlert?: OpsAlertService;
  logger: StructuredLogger;
  tx: {
    id: string;
    walletId: string;
    amount: number;
    amountInCents: bigint;
  };
  walletsById: Map<string, { id: string; workspaceId?: unknown; [key: string]: unknown }>;
  perTxFailures: ReconciliationFailure[];
}

/**
 * Settle a single stale pending transaction inside its own Prisma transaction.
 *
 * Re-implements the per-tx body of the original
 * `WalletService.reconcilePendingPayments` worker. The behavior is unchanged:
 *
 *  - Flips status from `pending` → `completed` under a `WHERE status='pending'`
 *    guard (so concurrent `confirmPayment` calls never double-credit).
 *  - Moves cents from the `pending` bucket to the `available` bucket on the
 *    matching wallet, dual-writing the float column for I11 compatibility.
 *  - Appends a `reconcile_settle_*` debit/credit pair into the ledger inside
 *    the same `$transaction` snapshot.
 *
 * Per-row exceptions are captured into `perTxFailures`; the FIRST failure
 * fires an immediate `financialAlert.reconciliationAlert`. Subsequent
 * failures roll into the aggregate alert emitted at the end of the sweep.
 */
export async function settleStalePendingTx(input: SettleStalePendingTxInput): Promise<void> {
  const {
    prisma,
    walletLedger,
    financialAlert,
    opsAlert,
    logger,
    tx,
    walletsById,
    perTxFailures,
  } = input;

  try {
    const wallet = walletsById.get(tx.walletId);
    if (!wallet) {
      return;
    }

    await prisma.$transaction(
      async (txn: Prisma.TransactionClient) => {
        // Guard the status flip with `updateMany` so a concurrent
        // confirmPayment can't double-credit the same amount.
        const flip = await txn.kloelWalletTransaction.updateMany({
          where: { id: tx.id, status: 'pending' },
          data: { status: 'completed' },
        });
        if (flip.count === 0) {
          // Another path (likely confirmPayment) already settled it.
          return;
        }
        // DUAL-WRITE during the P6-2 → P6-3 window (I11).
        await txn.kloelWallet.update({
          where: { id: wallet.id },
          data: {
            pendingBalance: { decrement: tx.amount },
            availableBalance: { increment: tx.amount },
            pendingBalanceInCents: { decrement: tx.amountInCents },
            availableBalanceInCents: { increment: tx.amountInCents },
          },
        });

        // I12 — reconciliation cron also writes the matching pair of
        // ledger entries inside the same status-guarded transaction.
        // Distinguished from confirmPayment by the `reconcile_*`
        // reasons so the audit log shows which path settled the tx.
        await walletLedger.appendWithinTx(txn, {
          workspaceId: wallet.workspaceId as string,
          walletId: wallet.id,
          transactionId: tx.id,
          direction: 'debit',
          bucket: 'pending',
          amountInCents: tx.amountInCents,
          reason: 'reconcile_settle_debit',
        });
        await walletLedger.appendWithinTx(txn, {
          workspaceId: wallet.workspaceId as string,
          walletId: wallet.id,
          transactionId: tx.id,
          direction: 'credit',
          bucket: 'available',
          amountInCents: tx.amountInCents,
          reason: 'reconcile_settle_credit',
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );

    logger.log(buildReconciliationSettledLogMessage(tx.id, tx.amount, formatBrlAmount));
  } catch (err: unknown) {
    void opsAlert?.alertOnCriticalError(err, 'WalletService.async');
    const message = err instanceof Error ? err.message : String(err);
    const isFirstFailure = appendFailureAndCheckFirst(perTxFailures, {
      txId: tx.id,
      error: message,
    });
    logger.error(buildReconciliationFailedLogMessage(tx.id, message));
    if (isFirstFailure) {
      const alert = 'wallet reconciliation encountered settlement failures';
      financialAlert.reconciliationAlert(alert, {
        details: { txId: tx.id, error: message, mode: 'first_failure' },
      });
    }
  }
}

/**
 * Settle a batch of stale pending transactions sequentially. Thin orchestrator
 * over {@link settleStalePendingTx} that builds the wallet lookup index and
 * walks the batch via {@link forEachSequential} so I/O stays predictable.
 */
export async function settleStalePendingTxBatch(input: {
  prisma: PrismaService;
  walletLedger: WalletLedgerService;
  financialAlert: FinancialAlertService;
  opsAlert?: OpsAlertService;
  logger: StructuredLogger;
  pendingTxs: Array<{
    id: string;
    walletId: string;
    amount: number;
    amountInCents: bigint;
  }>;
  walletsList: Array<{ id: string; [key: string]: unknown }>;
  perTxFailures: ReconciliationFailure[];
}): Promise<void> {
  const {
    prisma,
    walletLedger,
    financialAlert,
    opsAlert,
    logger,
    pendingTxs,
    walletsList,
    perTxFailures,
  } = input;

  const walletsById = buildWalletIndex<{ id: string; [key: string]: unknown }>(walletsList);

  await forEachSequential(pendingTxs, async (tx) => {
    await settleStalePendingTx({
      prisma,
      walletLedger,
      financialAlert,
      ...(opsAlert !== undefined ? { opsAlert } : {}),
      logger,
      tx,
      walletsById,
      perTxFailures,
    });
  });
}
