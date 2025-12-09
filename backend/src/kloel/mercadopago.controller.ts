import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MercadoPagoService } from './mercadopago.service';

@ApiTags('MercadoPago')
@Controller('mercadopago')
export class MercadoPagoController {
  constructor(private readonly mpService: MercadoPagoService) {}

  @Post(':workspaceId/connect')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Conecta workspace ao Mercado Pago' })
  async connect(
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      accessToken: string;
      publicKey?: string;
      environment?: 'sandbox' | 'production';
    },
  ) {
    return this.mpService.connectWorkspace(
      workspaceId,
      body.accessToken,
      body.publicKey,
      body.environment,
    );
  }

  @Post(':workspaceId/disconnect')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Desconecta workspace do Mercado Pago' })
  async disconnect(@Param('workspaceId') workspaceId: string) {
    await this.mpService.disconnectWorkspace(workspaceId);
    return { success: true };
  }

  @Get(':workspaceId/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Verifica status da conexão' })
  async getStatus(@Param('workspaceId') workspaceId: string) {
    return this.mpService.getConnectionStatus(workspaceId);
  }

  @Post(':workspaceId/pix')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cria pagamento PIX' })
  async createPix(
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      amount: number;
      description: string;
      email: string;
      externalReference?: string;
    },
  ) {
    return this.mpService.createPixPayment(workspaceId, body);
  }

  @Post(':workspaceId/preference')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cria preferência de checkout' })
  async createPreference(
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      items: Array<{
        title: string;
        quantity: number;
        unitPrice: number;
        id?: string;
      }>;
      backUrls?: {
        success?: string;
        failure?: string;
        pending?: string;
      };
      externalReference?: string;
      notificationUrl?: string;
    },
  ) {
    return this.mpService.createPreference(workspaceId, body);
  }

  @Get(':workspaceId/payments')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lista pagamentos' })
  async listPayments(
    @Param('workspaceId') workspaceId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.mpService.listPayments(workspaceId, {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':workspaceId/payment/:paymentId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Busca pagamento por ID' })
  async getPayment(
    @Param('workspaceId') workspaceId: string,
    @Param('paymentId') paymentId: string,
  ) {
    const payment = await this.mpService.getPayment(
      workspaceId,
      parseInt(paymentId, 10),
    );
    return payment || { error: 'Payment not found' };
  }

  @Post(':workspaceId/refund/:paymentId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cria reembolso' })
  async createRefund(
    @Param('workspaceId') workspaceId: string,
    @Param('paymentId') paymentId: string,
    @Body() body: { amount?: number },
  ) {
    return this.mpService.createRefund(
      workspaceId,
      parseInt(paymentId, 10),
      body.amount,
    );
  }

  // Webhook público (sem JWT)
  @Post('webhook/:workspaceId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Webhook do Mercado Pago' })
  async webhook(
    @Param('workspaceId') workspaceId: string,
    @Body()
    payload: {
      action: string;
      data: { id: string };
      type: string;
    },
  ) {
    return this.mpService.handleWebhook(workspaceId, payload);
  }
}
