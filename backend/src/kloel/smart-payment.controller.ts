import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  Query,
  NotFoundException,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SmartPaymentService } from './smart-payment.service';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';

@ApiTags('smart-payment')
@Controller('kloel/payment')
export class SmartPaymentController {
  constructor(
    private readonly paymentService: SmartPaymentService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
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
    const status = String(sale.status || '').toLowerCase();
    const includePix = status !== 'paid' && status !== 'pago' && status !== 'confirmed';
    
    return {
      id: sale.externalPaymentId || sale.id,
      amount: sale.amount,
      productName: sale.productName || 'Pagamento',
      status: sale.status,
      paymentMethod: sale.paymentMethod || 'PIX',
      createdAt: sale.createdAt,
      paidAt: sale.paidAt,
      companyName: sale.workspace?.name || 'KLOEL',
      pixKey: includePix ? (settings?.payment?.pixKey || null) : null,
      pixKeyType: includePix ? (settings?.payment?.pixKeyType || null) : null,
    };
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post(':workspaceId/create')
  @ApiOperation({ 
    summary: 'Cria pagamento inteligente com IA',
    description: 'Gera link de pagamento com mensagem personalizada baseada no contexto'
  })
  async createSmartPayment(
    @Req() req: any,
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
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const result = await this.paymentService.createSmartPayment({
      workspaceId: effectiveWorkspaceId,
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

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post(':workspaceId/negotiate')
  @ApiOperation({ 
    summary: 'Negocia desconto usando IA',
    description: 'Analisa pedido do cliente e decide se aplica desconto'
  })
  async negotiatePayment(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body() body: {
      contactId: string;
      originalAmount: number;
      customerMessage: string;
      maxDiscountPercent?: number;
    },
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const result = await this.paymentService.negotiatePayment({
      workspaceId: effectiveWorkspaceId,
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

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get(':workspaceId/recovery/:paymentId')
  @ApiOperation({ 
    summary: 'Analisa estratégia de recuperação de pagamento',
    description: 'Sugere ação para pagamentos pendentes'
  })
  async analyzeRecovery(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Param('paymentId') paymentId: string,
    @Query('daysPending') daysPending: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const result = await this.paymentService.analyzePaymentRecovery({
      workspaceId: effectiveWorkspaceId,
      paymentId,
      daysPending: parseInt(daysPending) || 1,
    });

    return {
      success: true,
      ...result,
    };
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post(':workspaceId/webhook/confirm')
  @ApiOperation({ 
    summary: 'Processa confirmação de pagamento',
    description: 'Webhook para quando pagamento é confirmado'
  })
  async processConfirmation(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body() body: {
      paymentId: string;
      status: 'CONFIRMED' | 'RECEIVED' | 'OVERDUE' | 'REFUNDED';
      amount: number;
      customerId?: string;
    },
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const result = await this.paymentService.processPaymentConfirmation({
      workspaceId: effectiveWorkspaceId,
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
