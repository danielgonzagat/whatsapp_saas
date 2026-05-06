import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SmartPaymentService } from './smart-payment.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

// All dates stored as UTC via Prisma DateTime (toISOString)
@ApiTags('smart-payment')
@Controller('kloel/payment')
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class SmartPaymentController {
  constructor(
    private readonly paymentService: SmartPaymentService,
    private readonly prisma: PrismaService,
  ) {}

  /** Get payment details. */
  @Public()
  @Get('public/:paymentId')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'Busca detalhes públicos de um pagamento',
    description: 'Endpoint público para página de pagamento fallback',
  })
  async getPaymentDetails(@Param('paymentId') paymentId: string) {
    // Buscar pelo externalPaymentId (pay_xxx) ou pelo id
    const sale = await this.prisma.kloelSale
      .findFirst({
        where: {
          OR: [{ externalPaymentId: paymentId }, { id: paymentId }],
        },
        include: {
          workspace: {
            select: {
              name: true,
              providerSettings: true,
            },
          },
        },
      })
      .catch((error) => {
        Sentry.captureException(error, {
          tags: { type: 'financial_alert', operation: 'smart_payment_public_lookup' },
          extra: { paymentId },
          level: 'error',
        });
        return null;
      });

    if (!sale) {
      throw new NotFoundException('Pagamento não encontrado');
    }

    // Retornar informações públicas apenas
    const settings = sale.workspace?.providerSettings as
      | { payment?: { pixKey?: string; pixKeyType?: string } }
      | null
      | undefined;
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
      pixKey: includePix ? settings?.payment?.pixKey || null : null,
      pixKeyType: includePix ? settings?.payment?.pixKeyType || null : null,
    };
  }

  /** Create smart payment. */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post(':workspaceId/create')
  @ApiOperation({
    summary: 'Cria pagamento inteligente com IA',
    description: 'Gera link de pagamento com mensagem personalizada baseada no contexto',
  })
  async createSmartPayment(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
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

  /** Negotiate payment. */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post(':workspaceId/negotiate')
  @ApiOperation({
    summary: 'Negocia desconto usando IA',
    description: 'Analisa pedido do cliente e decide se aplica desconto',
  })
  async negotiatePayment(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
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

  /** Analyze recovery. */
  // PULSE_TODO: verify if still needed, no caller detected
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get(':workspaceId/recovery/:paymentId')
  @ApiOperation({
    summary: 'Analisa estratégia de recuperação de pagamento',
    description: 'Sugere ação para pagamentos pendentes',
  })
  analyzeRecovery(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('paymentId') paymentId: string,
    @Query('daysPending') daysPending: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const result = this.paymentService.analyzePaymentRecovery({
      workspaceId: effectiveWorkspaceId,
      paymentId,
      daysPending: Number.parseInt(daysPending, 10) || 1,
    });

    return {
      success: true,
      ...result,
    };
  }

  /** Process confirmation. */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post(':workspaceId/webhook/confirm')
  @ApiOperation({
    summary: 'Processa confirmação de pagamento',
    description: 'Webhook para quando pagamento é confirmado',
  })
  async processConfirmation(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
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
