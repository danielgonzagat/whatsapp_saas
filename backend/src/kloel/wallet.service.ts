import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StructuredLogger } from '../logging/structured-logger';
import type { Prisma } from '@prisma/client';
import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { formatBrlAmount } from './money-format.util';
import { WalletLedgerService } from './wallet-ledger.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import {
  getWalletBalance,
  getWalletBalanceCents,
  getWalletTransactionHistory,
} from './wallet.read.helpers';
import {
  KloelWalletNotFoundError,
  buildAnticipationSuccessResponse,
  buildConfirmPaymentNoopLogMessage,
  buildInsufficientBalanceFailureResponse,
  buildInvalidMonetaryAmountResponse,
  buildProcessSaleResponse,
  buildReconciliationStartLogMessage,
  buildSaleSplitLogMessage,
  buildWithdrawalSuccessResponse,
  calculateAnticipationSplit,
  calculateSaleSplit,
  isValidMonetaryAmount,
  toSafeCents,
  uniqueWalletIds,
} from './wallet.helpers';
import {
  buildReconciliationFailureSummary,
  computeReconciliationCutoff,
  type ReconciliationFailure,
} from './wallet.reconcile.helpers';
import { settleStalePendingTxBatch } from './wallet.service.reconcile.helpers';
import {
  runAnticipationTx,
  runConfirmPaymentTx,
  runProcessSaleTx,
  runWithdrawalCentsTx,
  runWithdrawalTx,
} from './wallet.service.tx.helpers';

// @@index: optimistic lock via updatedAt — concurrent writes resolved by DB constraint
// All dates stored as UTC via Prisma DateTime (toISOString)

@Injectable()
export class SellerWalletService {
  private readonly logger = StructuredLogger.from(SellerWalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financialAlert: FinancialAlertService,
    private readonly walletLedger: WalletLedgerService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /**
   * 💰 Obtém saldo do workspace
   */
  async getBalance(workspaceId: string) {
    return getWalletBalance(this.prisma, workspaceId);
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
   *
   * The transactional inner body lives in `wallet.service.tx.helpers.ts`
   * (Gate-fix2-D split) so the service stays below the 600-LOC ratchet.
   */
  async processSale(
    workspaceId: string,
    saleAmount: number,
    saleId: string,
    description: string,
    kloelFeePercent = 5,
    gatewayFeePercent = 2.99,
  ) {
    // Pure split math lives in wallet.helpers.ts (Wave 64). Integer cents
    // are the source of truth; the Real-valued fields below are projections.
    const split = calculateSaleSplit({
      saleAmount,
      kloelFeePercent,
      gatewayFeePercent,
    });
    const { netAmountInCents } = split;
    const { netAmount } = split;

    this.logger.log(buildSaleSplitLogMessage(split, formatBrlAmount));

    const wallet = await this.getWalletOrThrow(workspaceId);

    const transaction = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) =>
        runProcessSaleTx({
          tx,
          walletLedger: this.walletLedger,
          wallet,
          workspaceId,
          saleId,
          description,
          netAmount,
          netAmountInCents,
          split,
        }),
      { isolationLevel: 'ReadCommitted' },
    );

    return buildProcessSaleResponse({ split, transactionId: transaction.id });
  }

  /**
   * ✅ Confirma pagamento (I10 — atomic ownership + status guard).
   *
   * Invariants (Wave 2):
   *  - The owning `KloelWalletTransaction` is read INSIDE the `$transaction`
   *    alongside its wallet, so read-time and write-time consistency share the
   *    same snapshot. This closes the TOCTOU that allowed cross-tenant moves.
   *  - `transaction.wallet.workspaceId === callerWorkspaceId` is asserted
   *    before every mutation. A mismatch throws `ForbiddenException` and NO
   *    balance is touched.
   *  - Status flip uses `updateMany` with `WHERE status = 'pending'` so the
   *    transition is atomic at the DB level; `count=0` means another worker
   *    already completed it — the caller returns `false` and the wallet is
   *    NOT credited a second time (idempotent double-confirm).
   *  - DB errors propagate. The caller must tell "already paid" (returns
   *    false) apart from "database unavailable" (throws). Silent swallow is
   *    forbidden.
   *
   * The transactional inner body lives in `wallet.service.tx.helpers.ts`.
   */
  async confirmPayment(workspaceId: string, transactionId: string): Promise<boolean> {
    const outcome = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) =>
        runConfirmPaymentTx({
          tx,
          walletLedger: this.walletLedger,
          workspaceId,
          transactionId,
        }),
      { isolationLevel: 'ReadCommitted' },
    );

    if (outcome.kind === 'ok') {
      return true;
    }
    // Structured log so ops can tell the three no-op reasons apart.
    this.logger.log(buildConfirmPaymentNoopLogMessage(transactionId, outcome.kind));
    return false;
  }

  /**
   * 💸 Solicita saque
   */
  async requestWithdrawal(workspaceId: string, amount: number, bankInfo: Record<string, unknown>) {
    if (!isValidMonetaryAmount(amount)) {
      return buildInvalidMonetaryAmountResponse('withdrawal');
    }

    const wallet = await this.getWalletOrThrow(workspaceId);

    if (wallet.availableBalance < amount) {
      return buildInsufficientBalanceFailureResponse(
        'available',
        wallet.availableBalance,
        formatBrlAmount,
      );
    }

    // Integer-cent representation for I11 dual-write.
    const amountInCents = toSafeCents(amount, { label: 'withdrawal amount' });

    let transaction: { id: string };
    try {
      transaction = await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) =>
          runWithdrawalTx({
            tx,
            walletLedger: this.walletLedger,
            wallet,
            workspaceId,
            amount,
            amountInCents,
            bankInfo,
          }),
        { isolationLevel: 'ReadCommitted' },
      );
    } catch (err: unknown) {
      void this.opsAlert?.alertOnCriticalError(err, 'WalletService.appendWithinTx');
      this.financialAlert.withdrawalFailed(err instanceof Error ? err : new Error(String(err)), {
        workspaceId,
        amount,
      });
      throw err;
    }

    return buildWithdrawalSuccessResponse(transaction.id);
  }

  /**
   * ⏩ Solicita antecipação de recebíveis.
   *
   * Moves the requested amount from `pendingBalance` to `availableBalance`
   * minus the anticipation fee. The fee is deducted from the merchant's
   * pending receivables as the cost of early settlement.
   *
   * Confirmation is required — the controller creates an `approvalRequest`
   * with `state: 'OPEN'` before calling this method with an already-approved
   * request id, matching the withdrawal flow.
   */
  async requestAnticipation(
    workspaceId: string,
    amount: number,
    installments?: number,
    feePercent = 3.0,
  ) {
    if (!isValidMonetaryAmount(amount)) {
      return buildInvalidMonetaryAmountResponse('anticipation');
    }

    const wallet = await this.getWalletOrThrow(workspaceId);

    if (wallet.pendingBalance < amount) {
      return buildInsufficientBalanceFailureResponse(
        'pending',
        wallet.pendingBalance,
        formatBrlAmount,
      );
    }

    // Integer-cent arithmetic for I11 dual-write — pure math in wallet.helpers.ts.
    const anticipation = calculateAnticipationSplit({ amount, feePercent });

    let transaction: { id: string };
    try {
      transaction = await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) =>
          runAnticipationTx({
            tx,
            walletLedger: this.walletLedger,
            wallet,
            workspaceId,
            amount,
            feePercent,
            ...(installments !== undefined ? { installments } : {}),
            anticipation,
          }),
        { isolationLevel: 'ReadCommitted' },
      );
    } catch (err: unknown) {
      void this.opsAlert?.alertOnCriticalError(err, 'WalletService.requestAnticipation');
      this.financialAlert.withdrawalFailed(err instanceof Error ? err : new Error(String(err)), {
        workspaceId,
        amount,
      });
      throw err;
    }

    return buildAnticipationSuccessResponse({
      transactionId: transaction.id,
      amount,
      feePercent,
      split: anticipation,
    });
  }

  /**
   * 📊 Histórico de transações
   */
  async getTransactionHistory(workspaceId: string, page = 1, limit = 20, type?: string) {
    return getWalletTransactionHistory(this.prisma, workspaceId, page, limit, type);
  }

  /**
   * Canonical-name alias of {@link getTransactionHistory} for the Kloel
   * capability resolver (`WalletService.getStatement`). Accepts the
   * (workspaceId, args) signature used by `KloelDomainServiceResolver`.
   * Args `page`, `limit`, `type` are forwarded with safe defaults. This
   * is a read-only alias — no ledger writes.
   */
  async getStatement(workspaceId: string, args?: { page?: number; limit?: number; type?: string }) {
    const page = typeof args?.page === 'number' ? args.page : 1;
    const limit = typeof args?.limit === 'number' ? args.limit : 20;
    const type = typeof args?.type === 'string' ? args.type : undefined;
    return this.getTransactionHistory(workspaceId, page, limit, type);
  }

  /**
   * Canonical-name alias of {@link requestWithdrawal} for the Kloel
   * capability resolver (`WalletService.withdraw`). Accepts the
   * (workspaceId, args) signature used by `KloelDomainServiceResolver`.
   * `args.amount` (number) is required; `args.bankInfo` is forwarded as
   * an empty object when omitted, matching the underlying signature.
   * Mutation is delegated — no new ledger logic introduced.
   */
  async withdraw(
    workspaceId: string,
    args?: { amount?: number; bankInfo?: Record<string, unknown> },
  ) {
    const amount = typeof args?.amount === 'number' ? args.amount : NaN;
    const bankInfo = args?.bankInfo && typeof args.bankInfo === 'object' ? args.bankInfo : {};
    return this.requestWithdrawal(workspaceId, amount, bankInfo);
  }

  /**
   * Canonical-name alias of {@link requestAnticipation} for the Kloel
   * capability resolver (`WalletService.anticipate`). Accepts the
   * (workspaceId, args) signature used by `KloelDomainServiceResolver`.
   * `args.amount` (number) is required; `args.installments` and
   * `args.feePercent` are forwarded when present. Mutation is delegated —
   * no new ledger logic introduced.
   */
  async anticipate(
    workspaceId: string,
    args?: { amount?: number; installments?: number; feePercent?: number },
  ) {
    const amount = typeof args?.amount === 'number' ? args.amount : NaN;
    const installments = typeof args?.installments === 'number' ? args.installments : undefined;
    const feePercent = typeof args?.feePercent === 'number' ? args.feePercent : 3.0;
    return this.requestAnticipation(workspaceId, amount, installments, feePercent);
  }

  /**
   * 🔄 Reconciliation: settle pending → available after 7 days
   * Runs every 6 hours.
   *
   * The per-tx settlement worker lives in `wallet.service.reconcile.helpers.ts`
   * (Gate-fix2-D split) so this method only owns the cron-level orchestration
   * (cutoff computation, batch fetch, per-tx failure aggregation, terminal
   * `financialAlert.reconciliationAlert` emission).
   */
  @Cron('0 0 */6 * * *')
  async reconcilePendingPayments() {
    try {
      const sevenDaysAgo = computeReconciliationCutoff(new Date(), 7);

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

      if (pendingTxs.length === 0) {
        return;
      }

      this.logger.log(buildReconciliationStartLogMessage(pendingTxs.length));

      // Batch-fetch wallets for all pending transactions
      const walletIds = uniqueWalletIds(pendingTxs);
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

      // Per-tx errors are isolated so one failed settlement doesn't abort
      // the rest, BUT we aggregate them into a structured ops alert at the
      // end so drift is never silently lost (Wave 2 I8).
      const perTxFailures: ReconciliationFailure[] = [];

      await settleStalePendingTxBatch({
        prisma: this.prisma,
        walletLedger: this.walletLedger,
        financialAlert: this.financialAlert,
        ...(this.opsAlert !== undefined ? { opsAlert: this.opsAlert } : {}),
        logger: this.logger,
        pendingTxs,
        walletsList,
        perTxFailures,
      });

      const failureSummary = buildReconciliationFailureSummary(perTxFailures, pendingTxs.length);
      if (failureSummary) {
        // Visibility for ops — drift must not hide in per-tx logs.
        this.financialAlert.reconciliationAlert(failureSummary.message, {
          details: failureSummary.details,
        });
      }
    } catch (err: unknown) {
      void this.opsAlert?.alertOnCriticalError(err, 'WalletService.reconciliationAlert');
      this.logger.error(`Reconciliation error: ${String(err)}`);
      this.financialAlert.reconciliationAlert('wallet reconciliation cron crashed', {
        details: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  private async getWalletOrThrow(workspaceId: string) {
    const wallet = await this.prisma.kloelWallet.findUnique({
      where: { workspaceId },
    });
    if (!wallet) {
      throw new KloelWalletNotFoundError(workspaceId);
    }
    return wallet;
  }

  /**
   * 💰 K30 resolver entry-point: returns balances in bigint cents (the
   * source-of-truth representation post Wave 2 P6-2 / I11). The legacy
   * {@link getBalance} method returns Float Reals for backward compatibility
   * with the existing wallet.controller; this method is the authoritative
   * cents-shaped variant consumed by the generic domain-service resolver
   * for the `wallet.balance` capability.
   *
   * Workspace isolation: filters by workspaceId. Throws NotFoundException
   * if the wallet row does not exist (matches resolver contract — never
   * lazily creates wallets on a query path).
   */
  async getBalanceCents(
    workspaceId: string,
  ): Promise<{ available: bigint; pending: bigint; blocked: bigint }> {
    return getWalletBalanceCents(this.prisma, workspaceId);
  }

  /**
   * 💸 K30 resolver entry-point: request a withdrawal using integer-cent
   * bigint amounts and the `{ method, pixKey? }` shape expected by the
   * generic domain-service resolver for the `wallet.withdraw` capability.
   *
   * Idempotency: if an identical request (same workspace, amount, method,
   * pixKey) was filed within the last 60s and is still pending, return
   * that existing row instead of creating a duplicate.
   *
   * Atomicity: balance check + withdrawal row insert run inside one
   * `$transaction` so the available-balance read and the pending-debit
   * write share the same snapshot.
   *
   * Workspace isolation: every read and the dedup lookup filter by
   * workspaceId; the wallet is resolved via its unique `workspaceId`
   * index. The withdrawal row carries the workspaceId in metadata for
   * downstream audit.
   */
  async requestWithdrawalCents(
    workspaceId: string,
    args: { amountCents: bigint; method: 'pix' | 'transfer'; pixKey?: string },
  ): Promise<{ id: string; status: 'pending' | 'approved' | 'rejected' }> {
    const { amountCents, method, pixKey } = args;

    if (typeof amountCents !== 'bigint' || amountCents <= 0n) {
      throw new BadRequestException('amountCents must be a positive bigint');
    }
    if (method !== 'pix' && method !== 'transfer') {
      throw new BadRequestException("method must be 'pix' or 'transfer'");
    }
    if (method === 'pix' && (typeof pixKey !== 'string' || pixKey.length === 0)) {
      throw new BadRequestException('pixKey required when method=pix');
    }

    return this.prisma.$transaction(
      (tx: Prisma.TransactionClient) =>
        runWithdrawalCentsTx({ tx, workspaceId, amountCents, method, pixKey }),
      { isolationLevel: 'ReadCommitted' },
    );
  }
}
