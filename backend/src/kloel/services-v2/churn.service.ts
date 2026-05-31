import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';

export interface ChurnGetArgs {
  since?: string;
  limit?: number;
  [key: string]: unknown;
}

/**
 * ChurnService — workspace churn analysis derived from canceled/refunded orders.
 *
 * domainService alias: ChurnService.get
 * Workspace isolation: all queries filter by workspaceId.
 *
 * "Churn" in this context = orders/sales with status CANCELED or REFUNDED,
 * or subscriptions that moved to CANCELED. No dedicated churn model exists.
 */
@Injectable()
export class ChurnService {
  private readonly logger = StructuredLogger.from(ChurnService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Get churn statistics for the workspace. */
  async get(workspaceId: string, args: ChurnGetArgs): Promise<{ success: boolean; data: unknown }> {
    const since = args.since ? new Date(String(args.since)) : new Date(0);
    const limit = Math.min(Number(args.limit ?? 50), 200);

    const [canceledOrders, refundedOrders, canceledSales, subscription] = await Promise.all([
      this.prisma.checkoutOrder.count({
        where: { workspaceId, status: 'CANCELED', updatedAt: { gte: since } },
      }),
      this.prisma.checkoutOrder.count({
        where: { workspaceId, status: 'REFUNDED', updatedAt: { gte: since } },
      }),
      this.prisma.kloelSale.count({
        where: {
          workspaceId,
          status: { in: ['cancelled', 'refunded'] },
          updatedAt: { gte: since },
        },
      }),
      this.prisma.subscription.findUnique({
        where: { workspaceId },
        select: { status: true, cancelAtPeriodEnd: true, currentPeriodEnd: true },
      }),
    ]);

    const recentChurned = await this.prisma.checkoutOrder.findMany({
      where: {
        workspaceId,
        status: { in: ['CANCELED', 'REFUNDED'] },
        updatedAt: { gte: since },
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        status: true,
        totalInCents: true,
        updatedAt: true,
      },
    });

    const totalChurned = canceledOrders + refundedOrders + canceledSales;

    this.logger.log(`ChurnService.get ws=${workspaceId} total=${totalChurned}`);

    return {
      success: true,
      data: {
        totalChurned,
        canceledOrders,
        refundedOrders,
        canceledSales,
        subscription: subscription
          ? {
              status: subscription.status,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
              currentPeriodEnd: subscription.currentPeriodEnd,
            }
          : null,
        recentChurned,
      },
    };
  }
}
