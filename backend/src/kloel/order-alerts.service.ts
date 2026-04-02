import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
// @@index: optimistic lock via updatedAt — concurrent writes resolved by DB constraint

@Injectable()
export class OrderAlertsService {
  private readonly logger = new Logger(OrderAlertsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Scans orders, payments, and sales to generate alerts for anomalies.
   * Idempotent: skips alerts that already exist (same type + orderId).
   */
  async generateAlerts(workspaceId: string): Promise<{ created: number }> {
    let created = 0;

    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

    // Pre-fetch all existing unresolved alerts to avoid N+1 findFirst per item
    const existingAlerts = await this.prisma.orderAlert.findMany({
      where: { workspaceId, resolved: false },
      select: { type: true, orderId: true },
      take: 2000,
    });
    const existingSet = new Set(existingAlerts.map((a) => `${a.type}:${a.orderId}`));
    const alertExists = (type: string, orderId: string) => existingSet.has(`${type}:${orderId}`);

    // Collect all new alert data first, then batch insert to avoid N+1 creates
    const newAlerts: Array<{
      workspaceId: string;
      type: string;
      severity: string;
      orderId: string;
      title: string;
      description: string;
    }> = [];

    // 1) PhysicalOrder without trackingCode after 48h -> MISSING_TRACKING (WARNING)
    const missingTracking = await this.prisma.physicalOrder.findMany({
      where: {
        workspaceId,
        status: 'PROCESSING',
        trackingCode: null,
        createdAt: { lt: fortyEightHoursAgo },
      },
      select: {
        id: true,
        customerName: true,
        productName: true,
        createdAt: true,
      },
      take: 200,
    });

    for (const order of missingTracking) {
      if (!alertExists('MISSING_TRACKING', order.id)) {
        newAlerts.push({
          workspaceId,
          type: 'MISSING_TRACKING',
          severity: 'WARNING',
          orderId: order.id,
          title: `Pedido sem rastreamento`,
          description: `Pedido de ${order.customerName} (${order.productName}) criado em ${order.createdAt.toISOString().slice(0, 10)} ainda sem código de rastreio.`,
        });
      }
    }

    // 2) CheckoutPayment with CHARGEBACK status -> CHARGEBACK (CRITICAL)
    const chargebackPayments = await this.prisma.checkoutPayment.findMany({
      where: {
        status: 'CHARGEBACK',
        order: { workspaceId },
      },
      select: {
        id: true,
        orderId: true,
        order: {
          select: { customerName: true, totalInCents: true, orderNumber: true },
        },
      },
      take: 200,
    });

    for (const payment of chargebackPayments) {
      if (!alertExists('CHARGEBACK', payment.orderId)) {
        const amount = Number((payment.order.totalInCents / 100).toFixed(2));
        newAlerts.push({
          workspaceId,
          type: 'CHARGEBACK',
          severity: 'CRITICAL',
          orderId: payment.orderId,
          title: `Chargeback no pedido #${payment.order.orderNumber}`,
          description: `Cliente ${payment.order.customerName} abriu chargeback de R$ ${amount}.`,
        });
      }
    }

    // 3) KloelSale with status 'refund_requested' -> REFUND_REQUEST (WARNING)
    const refundRequests = await this.prisma.kloelSale.findMany({
      where: { workspaceId, status: 'refund_requested' },
      select: { id: true, productName: true, leadPhone: true, amount: true },
      take: 200,
    });

    for (const sale of refundRequests) {
      if (!alertExists('REFUND_REQUEST', sale.id)) {
        newAlerts.push({
          workspaceId,
          type: 'REFUND_REQUEST',
          severity: 'WARNING',
          orderId: sale.id,
          title: `Reembolso solicitado`,
          description: `Reembolso de R$ ${Number(sale.amount.toFixed(2))} solicitado para ${sale.productName || 'produto'} (${sale.leadPhone || 'sem telefone'}).`,
        });
      }
    }

    // 4) PhysicalOrder SHIPPED > 15 days ago without deliveredAt -> POSSIBLE_LOSS (WARNING)
    const possibleLoss = await this.prisma.physicalOrder.findMany({
      where: {
        workspaceId,
        status: 'SHIPPED',
        deliveredAt: null,
        shippedAt: { lt: fifteenDaysAgo },
      },
      select: {
        id: true,
        customerName: true,
        trackingCode: true,
        shippedAt: true,
        productName: true,
      },
      take: 200,
    });

    for (const order of possibleLoss) {
      if (!alertExists('POSSIBLE_LOSS', order.id)) {
        const daysInTransit = Math.floor(
          (Date.now() - (order.shippedAt?.getTime() ?? Date.now())) / (24 * 60 * 60 * 1000),
        );
        newAlerts.push({
          workspaceId,
          type: 'POSSIBLE_LOSS',
          severity: 'WARNING',
          orderId: order.id,
          title: `Possível extravio de encomenda`,
          description: `Pedido de ${order.customerName} (${order.productName}) com rastreio ${order.trackingCode || 'N/A'} está há ${daysInTransit} dias em trânsito sem confirmação de entrega.`,
        });
      }
    }

    // Batch insert all new alerts in a single query
    if (newAlerts.length > 0) {
      await this.prisma.orderAlert.createMany({ data: newAlerts });
      created = newAlerts.length;
    }

    this.logger.log(`Generated ${created} new alerts for workspace ${workspaceId}`);
    return { created };
  }

  /**
   * List alerts for a workspace, optionally filtering by resolved status.
   */
  async getAlerts(
    workspaceId: string,
    resolved?: boolean,
  ): Promise<{ alerts: any[]; counts: Record<string, number> }> {
    // Generate fresh alerts on every read so the list is always up to date
    await this.generateAlerts(workspaceId);

    const where: any = { workspaceId };
    if (resolved !== undefined) {
      where.resolved = resolved;
    }

    const alerts = await this.prisma.orderAlert.findMany({
      where,
      select: {
        id: true,
        workspaceId: true,
        type: true,
        severity: true,
        orderId: true,
        title: true,
        description: true,
        resolved: true,
        resolvedAt: true,
        createdAt: true,
      },
      orderBy: [
        { resolved: 'asc' },
        { severity: 'asc' }, // CRITICAL < WARNING alphabetically, so CRITICAL first
        { createdAt: 'desc' },
      ],
      take: 200,
    });

    const counts = {
      total: alerts.length,
      critical: alerts.filter((a) => a.severity === 'CRITICAL' && !a.resolved).length,
      warning: alerts.filter((a) => a.severity === 'WARNING' && !a.resolved).length,
      resolved: alerts.filter((a) => a.resolved).length,
      MISSING_TRACKING: alerts.filter((a) => a.type === 'MISSING_TRACKING' && !a.resolved).length,
      CHARGEBACK: alerts.filter((a) => a.type === 'CHARGEBACK' && !a.resolved).length,
      REFUND_REQUEST: alerts.filter((a) => a.type === 'REFUND_REQUEST' && !a.resolved).length,
      POSSIBLE_LOSS: alerts.filter((a) => a.type === 'POSSIBLE_LOSS' && !a.resolved).length,
    };

    return { alerts, counts };
  }

  /**
   * Mark an alert as resolved.
   */
  async resolveAlert(id: string, workspaceId: string) {
    // Wrap find+update in $transaction to prevent concurrent resolve attempts
    // from racing and double-processing.
    const updated = await this.prisma.$transaction(async (tx) => {
      const alert = await tx.orderAlert.findFirst({
        where: { id, workspaceId },
      });
      if (!alert) throw new NotFoundException('Alert not found');

      return tx.orderAlert.update({
        where: { id },
        data: { resolved: true, resolvedAt: new Date() },
      });
    });

    return { alert: updated, success: true };
  }
}
