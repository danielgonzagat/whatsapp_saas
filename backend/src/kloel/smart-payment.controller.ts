import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SmartPaymentService } from './smart-payment.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('smart-payment')
@Controller('kloel/payment')
export class SmartPaymentController {
  constructor(
    private readonly paymentService: SmartPaymentService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('public/:paymentId')
  @ApiOperation({ 
    summary: 'Busca detalhes públicos de um pagamento',
    description: 'Endpoint público para página de pagamento fallback'
  })
  async getPaymentDetails(@Param('paymentId') paymentId: string) {
    const prismaAny = this.prisma as any;
    
    // Buscar pelo externalPaymentId (pay_xxx) ou pelo id
    const sale = await prismaAny.kloelSale.findFirst({
      where: {
        OR: [
          { externalPaymentId: paymentId },
          { id: paymentId },
        ],
      },
      include: {
        workspace: {
          select: {
            name: true,
            providerSettings: true,
          },
        },
      },
    }).catch(() => null);

    if (!sale) {
      throw new NotFoundException('Pagamento não encontrado');
    }

    // Retornar informações públicas apenas
    const settings = sale.workspace?.providerSettings as any;
    
    return {
      id: sale.externalPaymentId || sale.id,
      amount: sale.amount,
      productName: sale.productName || 'Pagamento',
      status: sale.status,
      paymentMethod: sale.paymentMethod || 'PIX',
      createdAt: sale.createdAt,
      paidAt: sale.paidAt,
      companyName: sale.workspace?.name || 'KLOEL',
      pixKey: settings?.payment?.pixKey || null,
      pixKeyType: settings?.payment?.pixKeyType || null,
      bankInfo: settings?.payment?.bankInfo || null,
    };
  }

  @Post(':workspaceId/create')
  @ApiOperation({ 
    summary: 'Cria pagamento inteligente com IA',
    description: 'Gera link de pagamento com mensagem personalizada baseada no contexto'
  })
  async createSmartPayment(
    @Param('workspaceId') workspaceId: string,
    @Body() body: {
      phone: string;
      customerName: string;
      amount: number;
      productName?: string;
      contactId?: string;
      conversation?: string;
    },
  ) {
    const result = await this.paymentService.createSmartPayment({
      workspaceId,
      phone: body.phone,
      customerName: body.customerName,
      amount: body.amount,
      productName: body.productName,
      contactId: body.contactId,
      conversation: body.conversation,
    });

    return {
      success: true,
      ...result,
    };
  }

  @Post(':workspaceId/negotiate')
  @ApiOperation({ 
    summary: 'Negocia desconto usando IA',
    description: 'Analisa pedido do cliente e decide se aplica desconto'
  })
  async negotiatePayment(
    @Param('workspaceId') workspaceId: string,
    @Body() body: {
      contactId: string;
      originalAmount: number;
      customerMessage: string;
      maxDiscountPercent?: number;
    },
  ) {
    const result = await this.paymentService.negotiatePayment({
      workspaceId,
      contactId: body.contactId,
      originalAmount: body.originalAmount,
      customerMessage: body.customerMessage,
      maxDiscountPercent: body.maxDiscountPercent,
    });

    return {
      success: true,
      ...result,
    };
  }

  @Get(':workspaceId/recovery/:paymentId')
  @ApiOperation({ 
    summary: 'Analisa estratégia de recuperação de pagamento',
    description: 'Sugere ação para pagamentos pendentes'
  })
  async analyzeRecovery(
    @Param('workspaceId') workspaceId: string,
    @Param('paymentId') paymentId: string,
    @Query('daysPending') daysPending: string,
  ) {
    const result = await this.paymentService.analyzePaymentRecovery({
      workspaceId,
      paymentId,
      daysPending: parseInt(daysPending) || 1,
    });

    return {
      success: true,
      ...result,
    };
  }

  @Post(':workspaceId/webhook/confirm')
  @ApiOperation({ 
    summary: 'Processa confirmação de pagamento',
    description: 'Webhook para quando pagamento é confirmado'
  })
  async processConfirmation(
    @Param('workspaceId') workspaceId: string,
    @Body() body: {
      paymentId: string;
      status: 'CONFIRMED' | 'RECEIVED' | 'OVERDUE' | 'REFUNDED';
      amount: number;
      customerId?: string;
    },
  ) {
    const result = await this.paymentService.processPaymentConfirmation({
      workspaceId,
      paymentId: body.paymentId,
      status: body.status,
      amount: body.amount,
      customerId: body.customerId,
    });

    return {
      success: true,
      ...result,
    };
  }
}
