import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

    // 1) PhysicalOrder without trackingCode after 48h -> MISSING_TRACKING (WARNING)
    const missingTracking = await this.prisma.physicalOrder.findMany({
      where: {
        workspaceId,
        status: 'PROCESSING',
        trackingCode: null,
        createdAt: { lt: fortyEightHoursAgo },
      },
      select: { id: true, customerName: true, productName: true, createdAt: true },
    });

    for (const order of missingTracking) {
      const exists = await this.prisma.orderAlert.findFirst({
        where: { workspaceId, type: 'MISSING_TRACKING', orderId: order.id, resolved: false },
      });
      if (!exists) {
        await this.prisma.orderAlert.create({
          data: {
            workspaceId,
            type: 'MISSING_TRACKING',
            severity: 'WARNING',
            orderId: order.id,
            title: `Pedido sem rastreamento`,
            description: `Pedido de ${order.customerName} (${order.productName}) criado em ${order.createdAt.toISOString().slice(0, 10)} ainda sem código de rastreio.`,
          },
        });
        created++;
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
        order: { select: { customerName: true, totalInCents: true, orderNumber: true } },
      },
    });

    for (const payment of chargebackPayments) {
      const exists = await this.prisma.orderAlert.findFirst({
        where: { workspaceId, type: 'CHARGEBACK', orderId: payment.orderId, resolved: false },
      });
      if (!exists) {
        const amount = (payment.order.totalInCents / 100).toFixed(2);
        await this.prisma.orderAlert.create({
          data: {
            workspaceId,
            type: 'CHARGEBACK',
            severity: 'CRITICAL',
            orderId: payment.orderId,
            title: `Chargeback no pedido #${payment.order.orderNumber}`,
            description: `Cliente ${payment.order.customerName} abriu chargeback de R$ ${amount}.`,
          },
        });
        created++;
      }
    }

    // 3) KloelSale with status 'refund_requested' -> REFUND_REQUEST (WARNING)
    const refundRequests = await this.prisma.kloelSale.findMany({
      where: { workspaceId, status: 'refund_requested' },
      select: { id: true, productName: true, leadPhone: true, amount: true },
    });

    for (const sale of refundRequests) {
      const exists = await this.prisma.orderAlert.findFirst({
        where: { workspaceId, type: 'REFUND_REQUEST', orderId: sale.id, resolved: false },
      });
      if (!exists) {
        await this.prisma.orderAlert.create({
          data: {
            workspaceId,
            type: 'REFUND_REQUEST',
            severity: 'WARNING',
            orderId: sale.id,
            title: `Reembolso solicitado`,
            description: `Reembolso de R$ ${sale.amount.toFixed(2)} solicitado para ${sale.productName || 'produto'} (${sale.leadPhone || 'sem telefone'}).`,
          },
        });
        created++;
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
      select: { id: true, customerName: true, trackingCode: true, shippedAt: true, productName: true },
    });

    for (const order of possibleLoss) {
      const exists = await this.prisma.orderAlert.findFirst({
        where: { workspaceId, type: 'POSSIBLE_LOSS', orderId: order.id, resolved: false },
      });
      if (!exists) {
        const daysInTransit = Math.floor(
          (Date.now() - (order.shippedAt?.getTime() ?? Date.now())) / (24 * 60 * 60 * 1000),
        );
        await this.prisma.orderAlert.create({
          data: {
            workspaceId,
            type: 'POSSIBLE_LOSS',
            severity: 'WARNING',
            orderId: order.id,
            title: `Possível extravio de encomenda`,
            description: `Pedido de ${order.customerName} (${order.productName}) com rastreio ${order.trackingCode || 'N/A'} está há ${daysInTransit} dias em trânsito sem confirmação de entrega.`,
          },
        });
        created++;
      }
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
      orderBy: [
        { resolved: 'asc' },
        { severity: 'asc' }, // CRITICAL < WARNING alphabetically, so CRITICAL first
        { createdAt: 'desc' },
      ],
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
    const alert = await this.prisma.orderAlert.findFirst({
      where: { id, workspaceId },
    });
    if (!alert) throw new NotFoundException('Alert not found');

    const updated = await this.prisma.orderAlert.update({
      where: { id },
      data: { resolved: true, resolvedAt: new Date() },
    });

    return { alert: updated, success: true };
  }
}
