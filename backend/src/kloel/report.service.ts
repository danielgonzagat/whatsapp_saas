import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import type { OperationReport, AbandonmentReport, AbandonmentItem } from './report.service.types';

const DEFAULT_LIMIT = 50;

/**
 * Read-only report service for workspace-scoped operational data.
 *
 * Every query filters by workspaceId — cross-tenant data is impossible
 * by construction. No mutation, no $queryRaw, no floating-point money math.
 */
@Injectable()
export class ReportService {
  private readonly logger = StructuredLogger.from(ReportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregate counts of {orders, sales, refunds, abandonments} within the
   * given period (or all-time if `since` is omitted).
   */
  async operations(
    workspaceId: string,
    opts?: { since?: Date; limit?: number },
  ): Promise<OperationReport> {
    const since = opts?.since ?? new Date(0);

    const [orders, sales, refunds, abandonments] = await Promise.all([
      this.prisma.checkoutOrder.count({
        where: { workspaceId, createdAt: { gte: since } },
      }),
      this.prisma.kloelSale.count({
        where: { workspaceId, status: 'paid', createdAt: { gte: since } },
      }),
      this.prisma.kloelSale.count({
        where: { workspaceId, status: 'refunded', createdAt: { gte: since } },
      }),
      this.prisma.checkoutSocialLead.count({
        where: { workspaceId, convertedAt: null, createdAt: { gte: since } },
      }),
    ]);

    this.logger.log(
      `operations ws=${workspaceId} orders=${orders} sales=${sales} refunds=${refunds} abandonments=${abandonments}`,
    );

    return { orders, sales, refunds, abandonments };
  }

  /**
   * List carts that started but did not complete (convertedAt is null).
   * Ordered by most-recent first, capped at `limit` (default 50).
   */
  async abandonments(
    workspaceId: string,
    opts?: { since?: Date; limit?: number },
  ): Promise<AbandonmentReport> {
    const since = opts?.since ?? new Date(0);
    const limit = opts?.limit ?? DEFAULT_LIMIT;

    const rows = await this.prisma.checkoutSocialLead.findMany({
      where: { workspaceId, convertedAt: null, createdAt: { gte: since } },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        stepReached: true,
        abandonedAt: true,
        createdAt: true,
      },
    });

    const items: AbandonmentItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      stepReached: r.stepReached,
      abandonedAt: r.abandonedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

    return { items, total: items.length };
  }

  /**
   * CRM pipeline snapshot: count of KloelLead rows grouped by `stage`,
   * scoped to one workspace.
   */
  async pipeline(workspaceId: string): Promise<{ stages: Record<string, number> }> {
    const grouped = await this.prisma.kloelLead.groupBy({
      by: ['stage'],
      where: { workspaceId },
      _count: { id: true },
    });
    const stages: Record<string, number> = {};
    for (const g of grouped) {
      stages[g.stage] = g._count.id;
    }
    return { stages };
  }
}
