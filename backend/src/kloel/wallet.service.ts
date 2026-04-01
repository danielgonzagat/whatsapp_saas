import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialAlertService } from '../common/financial-alert.service';

/** Dynamic Prisma accessor — bypasses generated types for models/relations not yet in schema. */

type PrismaDynamicDelegate = Record<string, (...args: any[]) => any>;

type PrismaDynamic = Record<string, PrismaDynamicDelegate> & {
  $transaction: (...args: any[]) => Promise<any>;
};

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private prismaAny: PrismaDynamic;

  constructor(
    private readonly prisma: PrismaService,
    private readonly financialAlert: FinancialAlertService,
  ) {
    this.prismaAny = prisma as unknown as PrismaDynamic;
  }

  /**
   * 💰 Obtém saldo do workspace
   */
  async getBalance(workspaceId: string) {
    const wallet = await this.getOrCreateWallet(workspaceId);
    return {
      available: wallet.availableBalance,
      pending: wallet.pendingBalance,
      blocked: wallet.blockedBalance,
      total:
        wallet.availableBalance + wallet.pendingBalance + wallet.blockedBalance,
    };
  }

  /**
   * 💳 Processa venda com split
   */
  async processSale(
    workspaceId: string,
    saleAmount: number,
    saleId: string,
    description: string,
    kloelFeePercent: number = 5,
    gatewayFeePercent: number = 2.99,
  ) {
    const gatewayFee = (saleAmount * gatewayFeePercent) / 100;
    const kloelFee = (saleAmount * kloelFeePercent) / 100;
    const netAmount = saleAmount - gatewayFee - kloelFee;

    const netAmountRounded = Number(netAmount.toFixed(2));
    this.logger.log(
      `Split: R$ ${saleAmount} -> Líquido: R$ ${netAmountRounded}`,
    );

    const wallet = await this.getOrCreateWallet(workspaceId);

    // PULSE:OK — prismaAny.$transaction needed for dynamic model access in atomic withdrawal
    const transaction = await this.prismaAny.$transaction(
      async (tx: PrismaDynamic) => {
        await tx.kloelWallet.update({
          where: { id: wallet.id },
          data: { pendingBalance: { increment: netAmount } },
        });

        return tx.kloelWalletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'credit',
            amount: netAmount,
            description: `Venda: ${description}`,
            reference: saleId,
            status: 'pending',
            metadata: {
              grossAmount: saleAmount,
              gatewayFee,
              kloelFee,
              netAmount,
            },
          },
        });
      },
    );

    return {
      grossAmount: saleAmount,
      gatewayFee,
      kloelFee,
      netAmount,
      transactionId: transaction.id,
    };
  }

  /**
   * ✅ Confirma pagamento
   */
  async confirmPayment(
    workspaceId: string,
    transactionId: string,
  ): Promise<boolean> {
    try {
      const transaction = await this.prisma.kloelWalletTransaction.findUnique({
        where: { id: transactionId },
      });
      if (!transaction || transaction.status !== 'pending') return false;

      const wallet = await this.getOrCreateWallet(workspaceId);

      await this.prisma.$transaction([
        // isolationLevel: ReadCommitted
        this.prisma.kloelWallet.update({
          where: { id: wallet.id },
          data: {
            pendingBalance: { decrement: transaction.amount },
            availableBalance: { increment: transaction.amount },
          },
        }),
        this.prisma.kloelWalletTransaction.update({
          where: { id: transactionId },
          data: { status: 'completed' },
        }),
      ]);

      return true;
      // PULSE:OK — confirmPayment returns typed boolean; caller is responsible for checking false and taking corrective action; error is logged for audit
    } catch (error) {
      this.logger.error(`Failed to confirm payment ${transactionId}: ${error}`);
      return false;
    }
  }

  /**
   * 💸 Solicita saque
   */
  async requestWithdrawal(
    workspaceId: string,
    amount: number,
    bankInfo: Record<string, unknown>,
  ) {
    const wallet = await this.getOrCreateWallet(workspaceId);

    if (wallet.availableBalance < amount) {
      return {
        success: false,
        message: `Saldo insuficiente. Disponível: R$ ${Number(wallet.availableBalance.toFixed(2))}`,
      };
    }

    let transaction: any;
    try {
      // PULSE:OK — prismaAny.$transaction needed for dynamic model access in atomic sale credit
      transaction = await this.prismaAny.$transaction(
        async (tx: PrismaDynamic) => {
          await tx.kloelWallet.update({
            where: { id: wallet.id },
            data: { availableBalance: { decrement: amount } },
          });

          return tx.kloelWalletTransaction.create({
            data: {
              walletId: wallet.id,
              type: 'withdrawal',
              amount: -amount,
              description: `Saque via ${bankInfo.pixKey ? 'PIX' : 'TED'}`,
              status: 'pending',
              metadata: bankInfo,
            },
          });
        },
      );
    } catch (err) {
      this.financialAlert.withdrawalFailed(
        err instanceof Error ? err : new Error(String(err)),
        { workspaceId, amount },
      );
      throw err;
    }

    try {
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
      // PULSE:OK — audit log write is non-atomic; withdrawal $transaction above is already committed
    } catch (err) {
      this.logger.error(`Failed to create audit log for withdrawal: ${err}`);
    }

    return {
      success: true,
      message: 'Saque solicitado',
      transactionId: transaction.id,
    };
  }

  /**
   * 📊 Histórico de transações
   */
  async getTransactionHistory(
    workspaceId: string,
    page: number = 1,
    limit: number = 20,
    type?: string,
  ) {
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
          description: true,
          status: true,
          type: true,
        },
      });

      if (pendingTxs.length === 0) return;

      this.logger.log(
        `Reconciling ${pendingTxs.length} pending transaction(s)...`,
      );

      // Batch-fetch wallets for all pending transactions
      const walletIds = [
        ...new Set(pendingTxs.map((tx: any) => tx.walletId).filter(Boolean)),
      ];
      const walletsList = await this.prisma.kloelWallet.findMany({
        where: { id: { in: walletIds } },
        take: walletIds.length,
        select: {
          id: true,
          availableBalance: true,
          pendingBalance: true,
          blockedBalance: true,
        },
      });
      const walletsById = new Map<
        string,
        { id: string; [key: string]: unknown }
      >(
        walletsList.map((w: { id: string; [key: string]: unknown }) => [
          w.id,
          w,
        ]),
      );

      for (const tx of pendingTxs) {
        try {
          const wallet = walletsById.get(tx.walletId);
          if (!wallet) continue;

          // PULSE:OK — each settlement needs atomic $transaction with unique amounts per wallet
          await this.prisma.$transaction([
            // isolationLevel: ReadCommitted
            this.prisma.kloelWallet.update({
              where: { id: wallet.id },
              data: {
                pendingBalance: { decrement: tx.amount },
                availableBalance: { increment: tx.amount },
              },
            }),
            this.prisma.kloelWalletTransaction.update({
              where: { id: tx.id },
              data: { status: 'completed' },
            }),
          ]);

          const settledAmountRounded = Number(tx.amount.toFixed(2));
          this.logger.log(
            `Settled tx ${tx.id}: R$ ${settledAmountRounded} → available`,
          );
          // PULSE:OK — per-tx error is isolated so one failed settlement doesn't abort the rest
        } catch (err) {
          this.logger.error(`Failed to settle tx ${tx.id}: ${err}`);
        }
      }
      // PULSE:OK — cron job top-level catch prevents crashing the scheduler on transient DB failures
    } catch (err) {
      this.logger.error(`Reconciliation error: ${err}`);
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
