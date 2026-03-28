import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Logger,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { KycApprovedGuard } from '../kyc/kyc-approved.guard';
import { KycRequired } from '../kyc/kyc-approved.decorator';

@ApiTags('KLOEL Wallet')
@ApiBearerAuth()
@Controller('kloel/wallet')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':workspaceId/balance')
  @ApiOperation({ summary: 'Obtém saldo da carteira virtual' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  async getBalance(@Param('workspaceId') workspaceId: string) {
    const balance = await this.walletService.getBalance(workspaceId);
    return {
      ...balance,
      formattedAvailable: `R$ ${balance.available.toFixed(2)}`,
      formattedPending: `R$ ${balance.pending.toFixed(2)}`,
      formattedTotal: `R$ ${balance.total.toFixed(2)}`,
    };
  }

  @Post(':workspaceId/process-sale')
  @ApiOperation({ summary: 'Processa uma venda com split' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  async processSale(
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      amount: number;
      saleId: string;
      description: string;
      kloelFeePercent?: number;
    },
  ) {
    const result = await this.walletService.processSale(
      workspaceId,
      body.amount,
      body.saleId,
      body.description,
      body.kloelFeePercent,
    );
    return { status: 'processed', ...result };
  }

  @Post(':workspaceId/confirm/:transactionId')
  @ApiOperation({ summary: 'Confirma pagamento e libera saldo' })
  async confirmPayment(
    @Param('workspaceId') workspaceId: string,
    @Param('transactionId') transactionId: string,
  ) {
    const success = await this.walletService.confirmPayment(
      workspaceId,
      transactionId,
    );
    return { status: success ? 'confirmed' : 'failed', transactionId };
  }

  @Post(':workspaceId/withdraw')
  @ApiOperation({ summary: 'Solicita saque' })
  @UseGuards(KycApprovedGuard)
  @KycRequired()
  async withdraw(
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      amount: number;
      pixKey?: string;
      bankCode?: string;
      agency?: string;
      account?: string;
    },
  ) {
    return this.walletService.requestWithdrawal(workspaceId, body.amount, body);
  }

  @Get(':workspaceId/transactions')
  @ApiOperation({ summary: 'Histórico de transações' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'type', required: false })
  async getTransactions(
    @Param('workspaceId') workspaceId: string,
    @Query('page') page?: string,
    @Query('type') type?: string,
  ) {
    return this.walletService.getTransactionHistory(
      workspaceId,
      parseInt(page || '1'),
      20,
      type,
    );
  }

  // ── Bank accounts ──

  @Get(':workspaceId/bank-accounts')
  @ApiOperation({ summary: 'Lista contas bancárias' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  async listBankAccounts(@Param('workspaceId') workspaceId: string) {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { workspaceId },
      orderBy: { isDefault: 'desc' },
    });
    return { accounts };
  }

  @Post(':workspaceId/bank-accounts')
  @ApiOperation({ summary: 'Adiciona conta bancária' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  async addBankAccount(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: Record<string, unknown>,
  ) {
    const account = dto.account as string | undefined;
    const pixKey = dto.pixKey as string | undefined;
    const displayAccount = account
      ? '****' + account.slice(-4)
      : pixKey
        ? '****' + pixKey.slice(-4)
        : null;
    const bankAccount = await this.prisma.bankAccount.create({
      data: { workspaceId, ...dto, displayAccount } as Prisma.BankAccountUncheckedCreateInput,
    });
    return { bankAccount, success: true };
  }

  @Delete(':workspaceId/bank-accounts/:id')
  @ApiOperation({ summary: 'Remove conta bancária' })
  @ApiParam({ name: 'id', description: 'ID da conta bancária' })
  async removeBankAccount(@Param('id') id: string) {
    await this.prisma.bankAccount.delete({ where: { id } });
    return { success: true };
  }

  // ── Anticipations ──

  @Get(':workspaceId/anticipations')
  @ApiOperation({ summary: 'Lista antecipações' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  async listAnticipations(@Param('workspaceId') workspaceId: string) {
    const anticipations = await this.prisma.walletAnticipation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    const totals = {
      totalAnticipated: anticipations.reduce(
        (s, a) => s + a.originalAmount,
        0,
      ),
      totalFees: anticipations.reduce((s, a) => s + a.feeAmount, 0),
      count: anticipations.length,
    };
    return { anticipations, totals };
  }

  // ── Monthly breakdown ──

  @Get(':workspaceId/monthly')
  @ApiOperation({ summary: 'Resumo mensal de receita/despesa' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  async getMonthlyBreakdown(@Param('workspaceId') workspaceId: string) {
    const wallet = await this.prisma.kloelWallet.findUnique({
      where: { workspaceId },
    });
    if (!wallet) return { income: 0, expense: 0, balance: 0, daily: [] };
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
    );
    const transactions = await this.prisma.kloelWalletTransaction.findMany({
      where: {
        walletId: wallet.id,
        createdAt: { gte: startOfMonth, lte: endOfMonth },
      },
      orderBy: { createdAt: 'asc' },
    });
    const income = transactions
      .filter((t) => t.amount > 0)
      .reduce((s, t) => s + t.amount, 0);
    const expense = transactions
      .filter((t) => t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const daysInMonth = endOfMonth.getDate();
    const daily = Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      income: 0,
      expense: 0,
    }));
    transactions.forEach((t) => {
      const day = new Date(t.createdAt).getDate() - 1;
      if (day >= 0 && day < daysInMonth) {
        if (t.amount > 0) daily[day].income += t.amount;
        else daily[day].expense += Math.abs(t.amount);
      }
    });
    return { income, expense, balance: income - expense, daily };
  }

  // ── Revenue chart (last 7 days) ──

  @Get(':workspaceId/chart')
  @ApiOperation({ summary: 'Gráfico de receita dos últimos 7 dias' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  async getRevenueChart(@Param('workspaceId') workspaceId: string) {
    const wallet = await this.prisma.kloelWallet.findUnique({
      where: { workspaceId },
    });
    if (!wallet) return { data: Array(7).fill(0) };
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const transactions = await this.prisma.kloelWalletTransaction.findMany({
      where: {
        walletId: wallet.id,
        amount: { gt: 0 },
        createdAt: { gte: sevenDaysAgo },
      },
    });
    const result = Array(7).fill(0);
    transactions.forEach((t) => {
      const daysAgo = Math.floor(
        (Date.now() - new Date(t.createdAt).getTime()) / 86400000,
      );
      const idx = 6 - daysAgo;
      if (idx >= 0 && idx < 7) result[idx] += t.amount;
    });
    return { data: result };
  }

  // ── Withdrawals history ──

  @Get(':workspaceId/withdrawals')
  @ApiOperation({ summary: 'Histórico de saques' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  async listWithdrawals(@Param('workspaceId') workspaceId: string) {
    const wallet = await this.prisma.kloelWallet.findUnique({
      where: { workspaceId },
    });
    if (!wallet) return { withdrawals: [] };
    const withdrawals = await this.prisma.kloelWalletTransaction.findMany({
      where: { walletId: wallet.id, type: 'withdrawal' },
      orderBy: { createdAt: 'desc' },
    });
    return { withdrawals };
  }
}
