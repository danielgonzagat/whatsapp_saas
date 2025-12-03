import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private prismaAny: any;

  constructor(private readonly prisma: PrismaService) {
    this.prismaAny = prisma as any;
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
      total: wallet.availableBalance + wallet.pendingBalance + wallet.blockedBalance,
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
    gatewayFeePercent: number = 2.99
  ) {
    const gatewayFee = saleAmount * gatewayFeePercent / 100;
    const kloelFee = saleAmount * kloelFeePercent / 100;
    const netAmount = saleAmount - gatewayFee - kloelFee;

    this.logger.log(`Split: R$ ${saleAmount} -> Líquido: R$ ${netAmount.toFixed(2)}`);

    const wallet = await this.getOrCreateWallet(workspaceId);

    const transaction = await this.prismaAny.$transaction(async (tx: any) => {
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
          metadata: { grossAmount: saleAmount, gatewayFee, kloelFee, netAmount },
        },
      });
    });

    return { grossAmount: saleAmount, gatewayFee, kloelFee, netAmount, transactionId: transaction.id };
  }

  /**
   * ✅ Confirma pagamento
   */
  async confirmPayment(workspaceId: string, transactionId: string): Promise<boolean> {
    try {
      const transaction = await this.prismaAny.kloelWalletTransaction.findUnique({ where: { id: transactionId } });
      if (!transaction || transaction.status !== 'pending') return false;

      const wallet = await this.getOrCreateWallet(workspaceId);

      await this.prismaAny.$transaction([
        this.prismaAny.kloelWallet.update({
          where: { id: wallet.id },
          data: { pendingBalance: { decrement: transaction.amount }, availableBalance: { increment: transaction.amount } },
        }),
        this.prismaAny.kloelWalletTransaction.update({ where: { id: transactionId }, data: { status: 'completed' } }),
      ]);

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 💸 Solicita saque
   */
  async requestWithdrawal(workspaceId: string, amount: number, bankInfo: any) {
    const wallet = await this.getOrCreateWallet(workspaceId);

    if (wallet.availableBalance < amount) {
      return { success: false, message: `Saldo insuficiente. Disponível: R$ ${wallet.availableBalance.toFixed(2)}` };
    }

    const transaction = await this.prismaAny.$transaction(async (tx: any) => {
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
    });

    return { success: true, message: 'Saque solicitado', transactionId: transaction.id };
  }

  /**
   * 📊 Histórico de transações
   */
  async getTransactionHistory(workspaceId: string, page: number = 1, limit: number = 20, type?: string) {
    const wallet = await this.getOrCreateWallet(workspaceId);
    const where: any = { walletId: wallet.id };
    if (type) where.type = type;

    const [transactions, total] = await Promise.all([
      this.prismaAny.kloelWalletTransaction.findMany({
        where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' },
      }),
      this.prismaAny.kloelWalletTransaction.count({ where }),
    ]);

    return { transactions, total };
  }

  private async getOrCreateWallet(workspaceId: string) {
    let wallet = await this.prismaAny.kloelWallet.findUnique({ where: { workspaceId } });
    if (!wallet) {
      wallet = await this.prismaAny.kloelWallet.create({
        data: { workspaceId, availableBalance: 0, pendingBalance: 0, blockedBalance: 0 },
      });
    }
    return wallet;
  }
}
