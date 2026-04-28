import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StripeService } from '../billing/stripe.service';
import { AuthenticatedRequest } from '../common/interfaces';
import { PrismaService } from '../prisma/prisma.service';

/** Sales controller — KloelSale CRUD. */
@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  private readonly logger = new Logger(SalesController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  // ═══════════════════════════════════════
  // VENDAS (KloelSale)
  // ═══════════════════════════════════════

  @Get()
  async listSales(
    @Request() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('method') method?: string,
  ) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) {
      return { sales: [], count: 0 };
    }
    const where: Record<string, unknown> = { workspaceId };
    if (status && status !== 'todos') {
      where.status = status;
    }
    if (method) {
      where.paymentMethod = method;
    }
    if (search) {
      where.OR = [
        { productName: { contains: search, mode: 'insensitive' } },
        { leadPhone: { contains: search } },
      ];
    }
    const sales = await this.prisma.kloelSale.findMany({
      where: { ...where, workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { sales, count: sales.length };
  }

  /** Get sales stats. */
  @Get('stats')
  async getSalesStats(@Request() req: AuthenticatedRequest) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) {
      return {
        totalRevenue: 0,
        totalTransactions: 0,
        totalPending: 0,
        pendingCount: 0,
        avgTicket: 0,
        revenueTrend: 0,
      };
    }
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const sales = await this.prisma.kloelSale.findMany({
      where: { workspaceId, createdAt: { gte: thirtyDaysAgo } },
      select: { id: true, status: true, amount: true, createdAt: true },
      take: 5000,
    });
    const paid = sales.filter((s) => s.status === 'paid');
    const pending = sales.filter((s) => s.status === 'pending');
    const totalRevenue = paid.reduce((sum, s) => sum + s.amount, 0);
    const totalPending = pending.reduce((sum, s) => sum + s.amount, 0);
    const avgTicket = paid.length > 0 ? totalRevenue / paid.length : 0;

    const prevSales = await this.prisma.kloelSale.findMany({
      take: 5000,
      where: {
        workspaceId,
        status: 'paid',
        createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
      },
      select: { id: true, amount: true },
    });
    const prevRevenue = prevSales.reduce((sum, s) => sum + s.amount, 0);
    const revenueTrend = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalTransactions: sales.length,
      totalPending,
      pendingCount: pending.length,
      avgTicket: Math.round(avgTicket * 100) / 100,
      revenueTrend: Math.round(revenueTrend * 10) / 10,
    };
  }

  /** Get sales chart. */
  @Get('chart')
  async getSalesChart(@Request() req: AuthenticatedRequest) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) {
      return { chart: [] };
    }
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sales = await this.prisma.kloelSale.findMany({
      where: { workspaceId, status: 'paid', createdAt: { gte: thirtyDaysAgo } },
      select: { id: true, amount: true, createdAt: true },
      take: 5000,
    });

    const chart: number[] = [];
    for (let i = 29; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const dayTotal = sales
        .filter((s) => s.createdAt >= dayStart && s.createdAt < dayEnd)
        .reduce((sum, s) => sum + s.amount, 0);
      chart.push(Math.round(dayTotal * 100) / 100);
    }
    return { chart };
  }

  // ═══════════════════════════════════════
  // VENDA POR ID (deve ficar DEPOIS de todas as rotas literais)
  // ═══════════════════════════════════════

  @Get(':id')
  async getSale(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const sale = await this.prisma.kloelSale.findFirst({
      where: { id, workspaceId },
    });
    return { sale };
  }

  /** Refund sale. */
  @Post(':id/refund')
  async refundSale(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const workspaceId = req.user?.workspaceId;
    const sale = await this.prisma.kloelSale.findFirst({
      where: { id, workspaceId },
    });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    // Idempotency: if the sale is already refunded/requested and caller sent an idempotency key,
    // return the existing record to avoid duplicate refund attempts.
    if (idempotencyKey && (sale.status === 'refunded' || sale.status === 'refund_requested')) {
      return { sale, success: true, idempotent: true };
    }

    if (sale.status !== 'paid') {
      throw new BadRequestException('Only paid sales can be refunded');
    }

    if (sale.externalPaymentId) {
      try {
        if (sale.externalPaymentId.startsWith('pi_')) {
          await this.stripeService.stripe.refunds.create(
            {
              payment_intent: sale.externalPaymentId,
            },
            idempotencyKey ? { idempotencyKey } : undefined,
          );
        } else {
          throw new BadRequestException(
            'Somente pagamentos Stripe são suportados para estorno nesta versão.',
          );
        }
      } catch (err: unknown) {
        throw new BadRequestException(
          `Falha ao processar estorno no gateway: ${err instanceof Error ? err.message : 'unknown_error'}`,
        );
      }
    }

    if (sale.externalPaymentId?.startsWith('pi_')) {
      await this.prisma.kloelSale.updateMany({
        where: { id, workspaceId },
        data: { status: 'refund_requested' },
      });

      try {
        await this.prisma.auditLog.create({
          data: {
            workspaceId,
            action: 'refund_requested',
            resource: 'sale',
            resourceId: id,
            agentId: req.user?.sub,
            details: { amount: sale.amount, status: 'pending_webhook' },
          },
        });
      } catch (err) {
        this.logger.error(`Failed to create audit log for refund request: ${err}`);
      }

      return { sale, success: true, pendingWebhook: true };
    }

    // Only update DB after successful gateway refund (or for manual sales with no externalPaymentId)
    const updated = await this.prisma.kloelSale.updateMany({
      where: { id, workspaceId },
      data: { status: 'refunded' },
    });

    try {
      await this.prisma.auditLog.create({
        data: {
          workspaceId,
          action: 'refund',
          resource: 'sale',
          resourceId: id,
          agentId: req.user?.sub,
          details: { amount: sale.amount, status: 'completed' },
        },
      });
    } catch (err) {
      // PULSE:OK — AuditLog write failure is non-critical; refund already processed above
      this.logger.error(`Failed to create audit log for refund: ${err}`);
    }

    return { sale: updated, success: true };
  }
}
