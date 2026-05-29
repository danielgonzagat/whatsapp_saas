import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';

export interface RefundListArgs {
  since?: string;
  limit?: number;
  [key: string]: unknown;
}

/**
 * RefundService — lists refunded orders and sales for the workspace.
 *
 * domainService alias: RefundService.list
 * Workspace isolation: all queries filter by workspaceId.
 *
 * Reads from CheckoutOrder (status=REFUNDED) and KloelSale (status=refunded).
 * No financial mutation — read-only.
 */
@Injectable()
export class RefundService {
  private readonly logger = StructuredLogger.from(RefundService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** List refunded transactions for the workspace. */
  async list(
    workspaceId: string,
    args: RefundListArgs,
  ): Promise<{ success: boolean; data: unknown; total: number }> {
    const since = args.since ? new Date(String(args.since)) : new Date(0);
    const limit = Math.min(Number(args.limit ?? 50), 200);

    const [refundedOrders, refundedSales] = await Promise.all([
      this.prisma.checkoutOrder.findMany({
        where: { workspaceId, status: 'REFUNDED', updatedAt: { gte: since } },
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          customerEmail: true,
          totalInCents: true,
          status: true,
          paymentMethod: true,
          updatedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.kloelSale.findMany({
        where: { workspaceId, status: 'refunded', updatedAt: { gte: since } },
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          leadPhone: true,
          productName: true,
          amount: true,
          status: true,
          paymentMethod: true,
          updatedAt: true,
          createdAt: true,
        },
      }),
    ]);

    const total = refundedOrders.length + refundedSales.length;
    this.logger.log(`RefundService.list ws=${workspaceId} total=${total}`);

    return {
      success: true,
      data: { refundedOrders, refundedSales },
      total,
    };
  }
}
