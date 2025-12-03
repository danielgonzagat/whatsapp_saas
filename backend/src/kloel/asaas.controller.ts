import { Controller, Post, Get, Body, Param, Query, Delete, HttpCode, HttpStatus, Logger, Headers } from '@nestjs/common';
import { AsaasService } from './asaas.service';

@Controller('kloel/asaas')
export class AsaasController {
  private readonly logger = new Logger(AsaasController.name);

  constructor(private readonly asaasService: AsaasService) {}

  /**
   * Connect workspace to Asaas
   * POST /kloel/asaas/:workspaceId/connect
   */
  @Post(':workspaceId/connect')
  async connect(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { apiKey: string; environment?: 'sandbox' | 'production' }
  ) {
    return this.asaasService.connectWorkspace(
      workspaceId,
      body.apiKey,
      body.environment || 'sandbox'
    );
  }

  /**
   * Disconnect workspace from Asaas
   * DELETE /kloel/asaas/:workspaceId/disconnect
   */
  @Delete(':workspaceId/disconnect')
  async disconnect(@Param('workspaceId') workspaceId: string) {
    await this.asaasService.disconnectWorkspace(workspaceId);
    return { success: true, message: 'Disconnected from Asaas' };
  }

  /**
   * Get connection status
   * GET /kloel/asaas/:workspaceId/status
   */
  @Get(':workspaceId/status')
  async getStatus(@Param('workspaceId') workspaceId: string) {
    return this.asaasService.getConnectionStatus(workspaceId);
  }

  /**
   * Get Asaas account balance
   * GET /kloel/asaas/:workspaceId/balance
   */
  @Get(':workspaceId/balance')
  async getBalance(@Param('workspaceId') workspaceId: string) {
    const { balance, pending } = await this.asaasService.getBalance(workspaceId);
    return {
      balance,
      pending,
      formattedBalance: `R$ ${balance.toFixed(2)}`,
      formattedPending: `R$ ${pending.toFixed(2)}`,
    };
  }

  /**
   * Create PIX payment
   * POST /kloel/asaas/:workspaceId/pix
   */
  @Post(':workspaceId/pix')
  async createPix(
    @Param('workspaceId') workspaceId: string,
    @Body() body: {
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      amount: number;
      description: string;
      externalReference?: string;
    }
  ) {
    const payment = await this.asaasService.createPixPayment(workspaceId, body);
    return {
      success: true,
      payment,
      message: 'PIX payment created successfully',
    };
  }

  /**
   * Create Boleto payment
   * POST /kloel/asaas/:workspaceId/boleto
   */
  @Post(':workspaceId/boleto')
  async createBoleto(
    @Param('workspaceId') workspaceId: string,
    @Body() body: {
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      customerCpfCnpj: string;
      amount: number;
      description: string;
      externalReference?: string;
    }
  ) {
    const payment = await this.asaasService.createBoletoPayment(workspaceId, body);
    return {
      success: true,
      payment,
      message: 'Boleto payment created successfully',
    };
  }

  /**
   * Get payment status
   * GET /kloel/asaas/:workspaceId/payment/:paymentId
   */
  @Get(':workspaceId/payment/:paymentId')
  async getPaymentStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('paymentId') paymentId: string
  ) {
    return this.asaasService.getPaymentStatus(workspaceId, paymentId);
  }

  /**
   * List payments
   * GET /kloel/asaas/:workspaceId/payments
   */
  @Get(':workspaceId/payments')
  async listPayments(
    @Param('workspaceId') workspaceId: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    const payments = await this.asaasService.listPayments(workspaceId, {
      status,
      startDate,
      endDate,
    });
    return {
      total: payments.length,
      payments,
    };
  }

  /**
   * Asaas Webhook receiver
   * POST /kloel/asaas/webhook/:workspaceId
   */
  @Post('webhook/:workspaceId')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { event: string; payment: any },
    @Headers('asaas-access-token') accessToken?: string
  ) {
    this.logger.log(`Webhook received for workspace ${workspaceId}: ${body.event}`);
    
    // In production, validate the webhook token
    // if (accessToken !== expectedToken) throw new UnauthorizedException();

    await this.asaasService.handleWebhook(workspaceId, body.event, body.payment);
    
    return { received: true };
  }
}
