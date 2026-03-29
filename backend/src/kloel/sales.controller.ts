import { Controller, Get, Post, Put, Body, Param, Query, Request, UseGuards, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════
  // VENDAS (KloelSale)
  // ═══════════════════════════════════════

  @Get()
  async listSales(@Request() req: any, @Query('status') status?: string, @Query('search') search?: string, @Query('method') method?: string) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return { sales: [], count: 0 };
    const where: any = { workspaceId };
    if (status && status !== 'todos') where.status = status;
    if (method) where.paymentMethod = method;
    if (search) {
      where.OR = [
        { productName: { contains: search, mode: 'insensitive' } },
        { leadPhone: { contains: search } },
      ];
    }
    const sales = await this.prisma.kloelSale.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    return { sales, count: sales.length };
  }

  @Get('stats')
  async getSalesStats(@Request() req: any) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return { totalRevenue: 0, totalTransactions: 0, totalPending: 0, pendingCount: 0, avgTicket: 0, revenueTrend: 0 };
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const sales = await this.prisma.kloelSale.findMany({ where: { workspaceId, createdAt: { gte: thirtyDaysAgo } } });
    const paid = sales.filter(s => s.status === 'paid');
    const pending = sales.filter(s => s.status === 'pending');
    const totalRevenue = paid.reduce((sum, s) => sum + s.amount, 0);
    const totalPending = pending.reduce((sum, s) => sum + s.amount, 0);
    const avgTicket = paid.length > 0 ? totalRevenue / paid.length : 0;

    const prevSales = await this.prisma.kloelSale.findMany({ where: { workspaceId, status: 'paid', createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } });
    const prevRevenue = prevSales.reduce((sum, s) => sum + s.amount, 0);
    const revenueTrend = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    return { totalRevenue, totalTransactions: sales.length, totalPending, pendingCount: pending.length, avgTicket: Math.round(avgTicket * 100) / 100, revenueTrend: Math.round(revenueTrend * 10) / 10 };
  }

  @Get('chart')
  async getSalesChart(@Request() req: any) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return { chart: [] };
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sales = await this.prisma.kloelSale.findMany({ where: { workspaceId, status: 'paid', createdAt: { gte: thirtyDaysAgo } } });

    const chart: number[] = [];
    for (let i = 29; i >= 0; i--) {
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0); dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
      const dayTotal = sales.filter(s => s.createdAt >= dayStart && s.createdAt < dayEnd).reduce((sum, s) => sum + s.amount, 0);
      chart.push(Math.round(dayTotal * 100) / 100);
    }
    return { chart };
  }

  // ═══════════════════════════════════════
  // ASSINATURAS (CustomerSubscription)
  // ═══════════════════════════════════════

  @Get('subscriptions')
  async listSubscriptions(@Request() req: any, @Query('status') status?: string) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return { subscriptions: [], count: 0 };
    const where: any = { workspaceId };
    if (status && status !== 'todos') where.status = status;
    const subscriptions = await this.prisma.customerSubscription.findMany({ where, orderBy: { createdAt: 'desc' } });
    return { subscriptions, count: subscriptions.length };
  }

  @Get('subscriptions/stats')
  async getSubscriptionStats(@Request() req: any) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return { mrr: 0, arr: 0, activeCount: 0, totalCount: 0, churnRate: 0, avgLtv: 0, lifecycle: {} };
    const subs = await this.prisma.customerSubscription.findMany({ where: { workspaceId } });
    const active = subs.filter(s => s.status === 'ACTIVE' || s.status === 'TRIALING');
    const mrr = active.reduce((sum, s) => sum + s.amount, 0);
    const totalLtv = subs.reduce((sum, s) => sum + s.totalPaid, 0);
    const cancelled = subs.filter(s => s.status === 'CANCELLED');
    const churnRate = subs.length > 0 ? (cancelled.length / subs.length) * 100 : 0;

    return {
      mrr, arr: mrr * 12, activeCount: active.length, totalCount: subs.length,
      churnRate: Math.round(churnRate * 10) / 10,
      avgLtv: subs.length > 0 ? Math.round(totalLtv / subs.length) : 0,
      lifecycle: {
        trial: subs.filter(s => s.status === 'TRIALING').length,
        active: subs.filter(s => s.status === 'ACTIVE').length,
        past_due: subs.filter(s => s.status === 'PAST_DUE').length,
        paused: subs.filter(s => s.status === 'PAUSED').length,
        cancelled: cancelled.length,
      },
    };
  }

  @Post('subscriptions/:id/pause')
  async pauseSubscription(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const sub = await this.prisma.customerSubscription.findFirst({ where: { id, workspaceId } });
    if (!sub) throw new NotFoundException('Subscription not found');
    const updated = await this.prisma.customerSubscription.update({ where: { id }, data: { status: 'PAUSED', pausedAt: new Date() } });
    return { subscription: updated, success: true };
  }

  @Post('subscriptions/:id/resume')
  async resumeSubscription(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const sub = await this.prisma.customerSubscription.findFirst({ where: { id, workspaceId } });
    if (!sub) throw new NotFoundException('Subscription not found');
    const updated = await this.prisma.customerSubscription.update({ where: { id }, data: { status: 'ACTIVE', pausedAt: null } });
    return { subscription: updated, success: true };
  }

  @Post('subscriptions/:id/cancel')
  async cancelSubscription(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const sub = await this.prisma.customerSubscription.findFirst({ where: { id, workspaceId } });
    if (!sub) throw new NotFoundException('Subscription not found');
    const updated = await this.prisma.customerSubscription.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    return { subscription: updated, success: true };
  }

  @Put('subscriptions/:id/change-plan')
  async changeSubscriptionPlan(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: { newPlanId: string },
  ) {
    const workspaceId = req.user?.workspaceId;
    const sub = await this.prisma.customerSubscription.findFirst({
      where: { id, workspaceId },
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.status === 'CANCELLED')
      throw new BadRequestException('Cannot change plan of cancelled subscription');
    const newPlan = await this.prisma.productPlan.findUnique({
      where: { id: dto.newPlanId },
    });
    if (!newPlan) throw new NotFoundException('Plan not found');
    const updated = await this.prisma.customerSubscription.update({
      where: { id },
      data: {
        planId: dto.newPlanId,
        planName: newPlan.name,
        amount: newPlan.price,
        planChangedAt: new Date(),
        previousPlanId: sub.planId,
      },
    });
    return { subscription: updated, success: true };
  }

  // ═══════════════════════════════════════
  // PEDIDOS FISICOS (PhysicalOrder)
  // ═══════════════════════════════════════

  @Get('orders')
  async listOrders(@Request() req: any, @Query('status') status?: string) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return { orders: [], count: 0 };
    const where: any = { workspaceId };
    if (status && status !== 'todos') where.status = status;
    const orders = await this.prisma.physicalOrder.findMany({ where, orderBy: { createdAt: 'desc' } });
    return { orders, count: orders.length };
  }

  @Get('orders/stats')
  async getOrderStats(@Request() req: any) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return { total: 0, processing: 0, shipped: 0, delivered: 0 };
    const orders = await this.prisma.physicalOrder.findMany({ where: { workspaceId } });
    return {
      total: orders.length,
      processing: orders.filter(o => o.status === 'PROCESSING').length,
      shipped: orders.filter(o => o.status === 'SHIPPED').length,
      delivered: orders.filter(o => o.status === 'DELIVERED').length,
    };
  }

  @Get('orders/pipeline')
  async getOrderPipeline(@Request() req: any) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return { processing: 0, shipped: 0, delivered: 0, returned: 0, cancelled: 0 };
    const orders = await this.prisma.physicalOrder.findMany({ where: { workspaceId } });
    return {
      processing: orders.filter(o => o.status === 'PROCESSING').length,
      shipped: orders.filter(o => o.status === 'SHIPPED').length,
      delivered: orders.filter(o => o.status === 'DELIVERED').length,
      returned: orders.filter(o => o.status === 'RETURNED').length,
      cancelled: orders.filter(o => o.status === 'CANCELLED').length,
    };
  }

  @Put('orders/:id/ship')
  async shipOrder(@Request() req: any, @Param('id') id: string, @Body() dto: { trackingCode: string; shippingMethod?: string }) {
    const workspaceId = req.user?.workspaceId;
    const order = await this.prisma.physicalOrder.findFirst({ where: { id, workspaceId } });
    if (!order) throw new NotFoundException('Order not found');
    const updated = await this.prisma.physicalOrder.update({
      where: { id },
      data: { status: 'SHIPPED', trackingCode: dto.trackingCode, shippingMethod: dto.shippingMethod, shippedAt: new Date(), trackingUrl: `https://www.linkcorreios.com.br/?id=${dto.trackingCode}` },
    });
    return { order: updated, success: true };
  }

  @Put('orders/:id/deliver')
  async deliverOrder(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const order = await this.prisma.physicalOrder.findFirst({ where: { id, workspaceId } });
    if (!order) throw new NotFoundException('Order not found');
    const updated = await this.prisma.physicalOrder.update({ where: { id }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
    return { order: updated, success: true };
  }

  @Put('orders/:id/return')
  async returnOrder(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const order = await this.prisma.physicalOrder.findFirst({ where: { id, workspaceId } });
    if (!order) throw new NotFoundException('Order not found');
    const updated = await this.prisma.physicalOrder.update({ where: { id }, data: { status: 'RETURNED' } });
    return { order: updated, success: true };
  }

  // ═══════════════════════════════════════
  // VENDA POR ID (deve ficar DEPOIS de todas as rotas literais)
  // ═══════════════════════════════════════

  @Get(':id')
  async getSale(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const sale = await this.prisma.kloelSale.findFirst({ where: { id, workspaceId } });
    return { sale };
  }

  @Post(':id/refund')
  async refundSale(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const sale = await this.prisma.kloelSale.findFirst({ where: { id, workspaceId } });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.status !== 'paid') throw new BadRequestException('Only paid sales can be refunded');
    const updated = await this.prisma.kloelSale.update({ where: { id }, data: { status: 'refunded' } });
    return { sale: updated, success: true };
  }

  // ═══════════════════════════════════════
  // ORDER ALERTS
  // ═══════════════════════════════════════

  @Get('orders/alerts')
  async getOrderAlerts(@Request() req: any) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return { alerts: [], counts: { missingTracking: 0, possibleLost: 0, chargebacks: 0 } };
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const [missingTracking, staleShipped, chargebacks] = await Promise.all([
      this.prisma.physicalOrder.findMany({
        where: { workspaceId, status: 'PROCESSING', createdAt: { lt: threeDaysAgo } },
        select: { id: true, customerName: true, createdAt: true },
      }),
      this.prisma.physicalOrder.findMany({
        where: { workspaceId, status: 'SHIPPED', shippedAt: { lt: fifteenDaysAgo } },
        select: { id: true, customerName: true, trackingCode: true, shippedAt: true },
      }),
      this.prisma.kloelSale.findMany({
        where: { workspaceId, status: 'chargeback' },
        select: { id: true, customerName: true, amount: true, createdAt: true },
      }),
    ]);
    return {
      alerts: [
        ...missingTracking.map((o) => ({ type: 'missing_tracking', severity: 'warning', orderId: o.id, customer: o.customerName, since: o.createdAt })),
        ...staleShipped.map((o) => ({ type: 'possible_lost', severity: 'danger', orderId: o.id, customer: o.customerName, trackingCode: o.trackingCode, since: o.shippedAt })),
        ...chargebacks.map((s) => ({ type: 'chargeback', severity: 'critical', saleId: s.id, customer: s.customerName, amount: s.amount })),
      ],
      counts: {
        missingTracking: missingTracking.length,
        possibleLost: staleShipped.length,
        chargebacks: chargebacks.length,
      },
    };
  }
}
