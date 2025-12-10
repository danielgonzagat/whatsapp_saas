import { Controller, Get, Post, Body, Param, Query, Logger, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';

@ApiTags('KLOEL Wallet')
@ApiBearerAuth()
@Controller('kloel/wallet')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(private readonly walletService: WalletService) {}

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
    @Body() body: { amount: number; saleId: string; description: string; kloelFeePercent?: number },
  ) {
    const result = await this.walletService.processSale(
      workspaceId, body.amount, body.saleId, body.description, body.kloelFeePercent,
    );
    return { status: 'processed', ...result };
  }

  @Post(':workspaceId/confirm/:transactionId')
  @ApiOperation({ summary: 'Confirma pagamento e libera saldo' })
  async confirmPayment(@Param('workspaceId') workspaceId: string, @Param('transactionId') transactionId: string) {
    const success = await this.walletService.confirmPayment(workspaceId, transactionId);
    return { status: success ? 'confirmed' : 'failed', transactionId };
  }

  @Post(':workspaceId/withdraw')
  @ApiOperation({ summary: 'Solicita saque' })
  async withdraw(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { amount: number; pixKey?: string; bankCode?: string; agency?: string; account?: string },
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
    return this.walletService.getTransactionHistory(workspaceId, parseInt(page || '1'), 20, type);
  }
}
