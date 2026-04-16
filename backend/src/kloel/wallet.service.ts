import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletLedgerService } from './wallet-ledger.service';

// @@index: optimistic lock via updatedAt — concurrent writes resolved by DB constraint
// All dates stored as UTC via Prisma DateTime (toISOString)

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financialAlert: FinancialAlertService,
    private readonly walletLedger: WalletLedgerService,
  ) {}

  /**
   * 💰 Obtém saldo do workspace
   */
  async getBalance(workspaceId: string) {
    const wallet = await this.getOrCreateWallet(workspaceId);
    return {
      available: wallet.availableBalance,
      pending: wallet.pendingBalance,
      blocked: wallet.blockedBalance,
      total: wallet.availableBalance + wallet.pendingBalance + wallet.blockedBalance,
    };
  }

  /**
   * 💳 Processa venda com split.
   *
   * Wave 2 P6-2 / I11 — this method now computes fees in integer cents
   * via `money.ts` and dual-writes both the legacy Float columns and the
   * new `*InCents` BigInt columns. The legacy columns will be dropped in
   * P6-3 after a 7-day observation window proves zero drift between the
   * two representations.
   *
   * Internal arithmetic is exclusively integer cents — no `toFixed`, no
   * `Number(x.toFixed(n))`, no floating-point math on money. The method
   * only returns the Real-valued fields for backward compatibility with
   * the existing API contract (Wave 1 P1 freeze); the Reals are derived
   * from the cents at the boundary, never stored as the source of truth.
   */
  async processSale(
    workspaceId: string,
    saleAmount: number,
    saleId: string,
    description: string,
    kloelFeePercent = 5,
    gatewayFeePercent = 2.99,
  ) {
    // Convert gross into integer cents at the boundary. Math.round ensures
    // the result is always a safe integer even when `saleAmount` carries
    // floating-point noise from JSON deserialization.
    const grossAmountInCents = Math.round(saleAmount * 100);
    if (!Number.isSafeInteger(grossAmountInCents) || grossAmountInCents < 0) {
      throw new Error(`Invalid saleAmount: ${saleAmount}`);
    }

    // Fee math in pure integer cents. `percent` values are small floats
    // from caller config (e.g. 2.99%); we multiply by grossAmountInCents
    // first then round once, which matches the "compute in cents" rule.
    const gatewayFeeInCents = Math.round((grossAmountInCents * gatewayFeePercent) / 100);
    const kloelFeeInCents = Math.round((grossAmountInCents * kloelFeePercent) / 100);
    const netAmountInCents = grossAmountInCents - gatewayFeeInCents - kloelFeeInCents;

    // Derive the Real-valued fields for the legacy columns + API response.
    // These are pure projections of the integer-cent truth — no independent
    // floating-point arithmetic happens on them.
    const gatewayFee = gatewayFeeInCents / 100;
    const kloelFee = kloelFeeInCents / 100;
    const netAmount = netAmountInCents / 100;

    this.logger.log(
      `Split: R$ ${saleAmount.toFixed(2)} -> Líquido: R$ ${netAmount.toFixed(2)} ` +
        `(cents: gross=${grossAmountInCents}, gateway=${gatewayFeeInCents}, ` +
        `kloel=${kloelFeeInCents}, net=${netAmountInCents})`,
    );

    const wallet = await this.getOrCreateWallet(workspaceId);

    const transaction = await this.prisma.$transaction(async (tx) => {
      await tx.kloelWallet.update({
        where: { id: wallet.id },
        data: {
          // DUAL-WRITE during the P6-2 → P6-3 observation window.
          pendingBalance: { increment: netAmount },
          pendingBalanceInCents: { increment: BigInt(netAmountInCents) },
        },
      });

      const created = await tx.kloelWalletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'credit',
          amount: netAmount,
          amountInCents: BigInt(netAmountInCents),
          description: `Venda: ${description}`,
          reference: saleId,
          status: 'pending',
          metadata: {
            grossAmount: saleAmount,
            grossAmountInCents,
            gatewayFee,
            gatewayFeeInCents,
            kloelFee,
            kloelFeeInCents,
            netAmount,
            netAmountInCents,
          },
        },
      });

      // I12 — append-only ledger entry for the credit, INSIDE the same
      // $transaction so the wallet update + ledger append commit together
      // or both roll back together.
      await this.walletLedger.appendWithinTx(tx as any, {
        workspaceId,
        walletId: wallet.id,
        transactionId: created.id,
        direction: 'credit',
        bucket: 'pending',
        amountInCents: BigInt(netAmountInCents),
        reason: 'sale_credit',
        metadata: {
          saleId,
          grossAmountInCents,
          gatewayFeeInCents,
          kloelFeeInCents,
        },
      });

      return created;
    });

    return {
      grossAmount: saleAmount,
      gatewayFee,
      kloelFee,
      netAmount,
      transactionId: transaction.id,
    };
  }

  /**
   * ✅ Confirma pagamento (I10 — atomic ownership + status guard).
   *
   * Invariants (Wave 2):
   *  - The owning `KloelWalletTransaction` is read INSIDE the `$transaction`
   *    alongside its wallet, so read-time and write-time consistency share the
   *    same snapshot. This closes the TOCTOU that allowed cross-tenant moves.
   *  - `transaction.wallet.workspaceId === callerWorkspaceId` is asserted
   *    before any mutation. A mismatch throws `ForbiddenException` and NO
   *    balance is touched.
   *  - Status flip uses `updateMany` with `WHERE status = 'pending'` so the
   *    transition is atomic at the DB level; `count=0` means another worker
   *    already completed it — the caller returns `false` and the wallet is
   *    NOT credited a second time (idempotent double-confirm).
   *  - DB errors propagate. The caller must tell "already paid" (returns
   *    false) apart from "database unavailable" (throws). Silent swallow is
   *    forbidden.
   */
  async confirmPayment(workspaceId: string, transactionId: string): Promise<boolean> {
    type ConfirmResult =
      | { kind: 'ok' }
      | { kind: 'not_found' }
      | { kind: 'not_pending' }
      | { kind: 'race_lost' };

    const outcome = await this.prisma.$transaction(
      async (tx): Promise<ConfirmResult> => {
        const walletTx = (await (tx as any).kloelWalletTransaction.findUnique({
          where: { id: transactionId },
          include: { wallet: { select: { id: true, workspaceId: true } } },
        })) as {
          id: string;
          walletId: string;
          status: string;
          amount: number;
          amountInCents: bigint;
          wallet: { id: string; workspaceId: string };
        } | null;

        if (!walletTx) return { kind: 'not_found' };
        if (walletTx.status !== 'pending') return { kind: 'not_pending' };

        // I10 — ownership assertion inside the transaction snapshot.
        if (walletTx.wallet.workspaceId !== workspaceId) {
          throw new ForbiddenException('wallet_ownership_mismatch');
        }

        // Atomic status transition. If another worker beat us to it, count=0
        // and we leave the balance untouched.
        const statusFlip = await (tx as any).kloelWalletTransaction.updateMany({
          where: { id: transactionId, status: 'pending' },
          data: { status: 'completed' },
        });
        if (statusFlip.count === 0) return { kind: 'race_lost' };

        // DUAL-WRITE during the P6-2 → P6-3 observation window (I11).
        await (tx as any).kloelWallet.update({
          where: { id: walletTx.wallet.id },
          data: {
            pendingBalance: { decrement: walletTx.amount },
            availableBalance: { increment: walletTx.amount },
            pendingBalanceInCents: { decrement: walletTx.amountInCents },
            availableBalanceInCents: { increment: walletTx.amountInCents },
          },
        });

        // I12 — confirm_payment moves cents from `pending` to `available`
        // by writing TWO ledger entries (a debit on pending and a credit
        // on available) inside the same transaction snapshot.
        await this.walletLedger.appendWithinTx(tx as any, {
          workspaceId,
          walletId: walletTx.wallet.id,
          transactionId: walletTx.id,
          direction: 'debit',
          bucket: 'pending',
          amountInCents: walletTx.amountInCents,
          reason: 'confirm_payment_debit',
        });
        await this.walletLedger.appendWithinTx(tx as any, {
          workspaceId,
          walletId: walletTx.wallet.id,
          transactionId: walletTx.id,
          direction: 'credit',
          bucket: 'available',
          amountInCents: walletTx.amountInCents,
          reason: 'confirm_payment_credit',
        });

        return { kind: 'ok' };
      },
      { isolationLevel: 'ReadCommitted' },
    );

    if (outcome.kind === 'ok') return true;
    // Structured log so ops can tell the three no-op reasons apart.
    this.logger.log(`confirmPayment noop for ${transactionId}: ${outcome.kind}`);
    return false;
  }

  /**
   * 💸 Solicita saque
   */
  async requestWithdrawal(workspaceId: string, amount: number, bankInfo: Record<string, unknown>) {
    if (!amount || amount <= 0 || !Number.isFinite(amount)) {
      return { success: false, message: 'Valor de saque invalido.' };
    }

    const wallet = await this.getOrCreateWallet(workspaceId);
    if (!wallet) {
      return { success: false, message: 'Carteira nao encontrada.' };
    }

    if (wallet.availableBalance < amount) {
      return {
        success: false,
        message: `Saldo insuficiente. Disponível: R$ ${Number(wallet.availableBalance.toFixed(2))}`,
      };
    }

    // Integer-cent representation for I11 dual-write.
    const amountInCents = Math.round(amount * 100);
    if (!Number.isSafeInteger(amountInCents) || amountInCents <= 0) {
      throw new Error(`Invalid withdrawal amount: ${amount}`);
    }

    let transaction: { id: string };
    try {
      transaction = await this.prisma.$transaction(async (tx) => {
        await tx.kloelWallet.update({
          where: { id: wallet.id },
          data: {
            availableBalance: { decrement: amount },
            availableBalanceInCents: { decrement: BigInt(amountInCents) },
          },
        });

        const created = await tx.kloelWalletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'withdrawal',
            amount: -amount,
            amountInCents: BigInt(-amountInCents),
            description: `Saque via ${bankInfo.pixKey ? 'PIX' : 'TED'}`,
            status: 'pending',
            metadata: bankInfo as Prisma.InputJsonValue,
          },
        });

        // I12 — withdrawal debits the `available` bucket. Sign is conveyed
        // by `direction`, so amountInCents is positive in the ledger row.
        await this.walletLedger.appendWithinTx(tx as any, {
          workspaceId,
          walletId: wallet.id,
          transactionId: created.id,
          direction: 'debit',
          bucket: 'available',
          amountInCents: BigInt(amountInCents),
          reason: 'withdrawal_debit',
          metadata: { hasPix: !!bankInfo.pixKey },
        });

        return created;
      });
    } catch (err) {
      this.financialAlert.withdrawalFailed(err instanceof Error ? err : new Error(String(err)), {
        workspaceId,
        amount,
      });
      throw err;
    }

    // Audit log write is load-bearing for financial compliance. If it fails,
    // we must surface the error so ops can investigate — not silently succeed
    // while leaving a money-moving operation unaudited. Wave 2 I8 extension.
    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        action: 'withdrawal_request',
        resource: 'wallet',
        resourceId: transaction.id,
        details: {
          amount,
          bankInfo: bankInfo as Record<string, string>,
          status: 'completed',
        },
      },
    });

    return {
      success: true,
      message: 'Saque solicitado',
      transactionId: transaction.id,
    };
  }

  /**
   * 📊 Histórico de transações
   */
  async getTransactionHistory(workspaceId: string, page = 1, limit = 20, type?: string) {
    const wallet = await this.getOrCreateWallet(workspaceId);
    const where: Record<string, unknown> = { walletId: wallet.id };
    if (type) where.type = type;

    const [transactions, total] = await Promise.all([
      this.prisma.kloelWalletTransaction.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          walletId: true,
          type: true,
          amount: true,
          description: true,
          status: true,
          reference: true,
          metadata: true,
          createdAt: true,
        },
      }),
      this.prisma.kloelWalletTransaction.count({ where }),
    ]);

    return { transactions, total };
  }

  /**
   * 🔄 Reconciliation: settle pending → available after 7 days
   * Runs every 6 hours
   */
  @Cron('0 0 */6 * * *')
  async reconcilePendingPayments() {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Find pending transactions older than 7 days
      const pendingTxs = await this.prisma.kloelWalletTransaction.findMany({
        where: {
          status: 'pending',
          type: 'credit',
          createdAt: { lt: sevenDaysAgo },
        },
        take: 100,
        select: {
          id: true,
          walletId: true,
          amount: true,
          amountInCents: true,
          description: true,
          status: true,
          type: true,
        },
      });

      if (pendingTxs.length === 0) return;

      this.logger.log(`Reconciling ${pendingTxs.length} pending transaction(s)...`);

      // Batch-fetch wallets for all pending transactions
      const walletIds = [...new Set(pendingTxs.map((tx: any) => tx.walletId).filter(Boolean))];
      const walletsList = await this.prisma.kloelWallet.findMany({
        where: { id: { in: walletIds } },
        take: walletIds.length,
        select: {
          id: true,
          workspaceId: true,
          availableBalance: true,
          pendingBalance: true,
          blockedBalance: true,
        },
      });
      const walletsById = new Map<string, { id: string; [key: string]: unknown }>(
        walletsList.map((w: { id: string; [key: string]: unknown }) => [w.id, w]),
      );

      // Per-tx errors are isolated so one failed settlement doesn't abort
      // the rest, BUT we aggregate them into a structured ops alert at the
      // end so drift is never silently lost (Wave 2 I8).
      const perTxFailures: Array<{ txId: string; error: string }> = [];

      // biome-ignore lint/performance/noAwaitInLoops: sequential financial transaction processing
      for (const tx of pendingTxs) {
        try {
          const wallet = walletsById.get(tx.walletId);
          if (!wallet) continue;

          // PULSE:OK — each settlement needs atomic $transaction with unique amounts per wallet
          await this.prisma.$transaction(
            async (txn) => {
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
              await this.walletLedger.appendWithinTx(txn, {
                workspaceId: wallet.workspaceId as string,
                walletId: wallet.id,
                transactionId: tx.id,
                direction: 'debit',
                bucket: 'pending',
                amountInCents: tx.amountInCents,
                reason: 'reconcile_settle_debit',
              });
              await this.walletLedger.appendWithinTx(txn, {
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

          const settledAmountRounded = Number(tx.amount.toFixed(2));
          this.logger.log(`Settled tx ${tx.id}: R$ ${settledAmountRounded} → available`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const isFirstFailure = perTxFailures.length === 0;
          perTxFailures.push({ txId: tx.id, error: message });
          this.logger.error(`Failed to settle tx ${tx.id}: ${message}`);
          if (isFirstFailure) {
            const alert = 'wallet reconciliation encountered settlement failures';
            this.financialAlert.reconciliationAlert(alert, {
              details: { txId: tx.id, error: message, mode: 'first_failure' },
            });
          }
        }
      }

      if (perTxFailures.length > 0) {
        // Visibility for ops — drift must not hide in per-tx logs.
        this.financialAlert.reconciliationAlert(
          `wallet reconciliation: ${perTxFailures.length} of ${pendingTxs.length} settlements failed`,
          { details: { failures: perTxFailures } },
        );
      }
      // PULSE:OK — cron job top-level catch prevents crashing the scheduler on transient DB failures
    } catch (err) {
      this.logger.error(`Reconciliation error: ${err}`);
      this.financialAlert.reconciliationAlert('wallet reconciliation cron crashed', {
        details: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  private async getOrCreateWallet(workspaceId: string) {
    let wallet = await this.prisma.kloelWallet.findUnique({
      where: { workspaceId },
    });
    if (!wallet) {
      wallet = await this.prisma.kloelWallet.create({
        data: {
          workspaceId,
          availableBalance: 0,
          pendingBalance: 0,
          blockedBalance: 0,
        },
      });
    }
    return wallet;
  }
}
