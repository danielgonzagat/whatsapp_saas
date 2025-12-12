import { Controller, Post, Get, Body, Param, Query, Delete, HttpCode, HttpStatus, Logger, Headers, UnauthorizedException, UseGuards, Req } from '@nestjs/common';
import { AsaasService } from './asaas.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { Public } from '../auth/public.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('KLOEL Asaas Integration')
@Controller('kloel/asaas')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@ApiBearerAuth()
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
   * 
   * Validates the webhook token from Asaas using X-Asaas-Token or asaas-access-token header
   * @Public - Webhooks don't have JWT, they use their own token validation
   */
  @Public()
  @Post('webhook/:workspaceId')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { event: string; payment: any },
    @Headers('asaas-access-token') accessToken?: string,
    @Headers('x-asaas-token') xAsaasToken?: string
  ) {
    this.logger.log(`Webhook received for workspace ${workspaceId}: ${body.event}`);
    
    // Validate webhook token for security
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
    const receivedToken = xAsaasToken || accessToken;

    if (process.env.NODE_ENV === 'production' && !expectedToken) {
      this.logger.warn(`⚠️ ASAAS_WEBHOOK_TOKEN not configured (workspace ${workspaceId})`);
      throw new UnauthorizedException('ASAAS_WEBHOOK_TOKEN not configured');
    }
    if (expectedToken) {
      if (!receivedToken || expectedToken !== receivedToken) {
        this.logger.warn(`⚠️ Invalid webhook token for workspace ${workspaceId}`);
        throw new UnauthorizedException('Invalid webhook token');
      }
    }

    await this.asaasService.handleWebhook(workspaceId, body.event, body.payment);
    
    return { received: true };
  }
}
