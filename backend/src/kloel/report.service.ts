import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import type {
  OperationReport,
  AbandonmentReport,
  AbandonmentItem,
  SubscriptionReport,
  SubscriptionReportItem,
  ChargebackReport,
  ChargebackReportItem,
} from './report.service.types';

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
   * Canonical-name alias of {@link operations} for the Kloel capability
   * resolver (`ReportService.getOperations`). Accepts the
   * (workspaceId, args) signature used by `KloelDomainServiceResolver`.
   * Args `since` (Date|string) and `limit` (number) are forwarded.
   */
  async getOperations(
    workspaceId: string,
    args?: { since?: Date | string; limit?: number },
  ): Promise<OperationReport> {
    const since =
      args?.since instanceof Date
        ? args.since
        : typeof args?.since === 'string'
          ? new Date(args.since)
          : undefined;
    const limit = typeof args?.limit === 'number' ? args.limit : undefined;
    return this.operations(workspaceId, {
      ...(since ? { since } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
  }

  /**
   * Canonical-name alias of {@link abandonments} for the Kloel capability
   * resolver (`ReportService.getAbandonments`). Accepts the
   * (workspaceId, args) signature used by `KloelDomainServiceResolver`.
   * Args `since` (Date|string) and `limit` (number) are forwarded.
   */
  async getAbandonments(
    workspaceId: string,
    args?: { since?: Date | string; limit?: number },
  ): Promise<AbandonmentReport> {
    const since =
      args?.since instanceof Date
        ? args.since
        : typeof args?.since === 'string'
          ? new Date(args.since)
          : undefined;
    const limit = typeof args?.limit === 'number' ? args.limit : undefined;
    return this.abandonments(workspaceId, {
      ...(since ? { since } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
  }

  /**
   * Canonical-name report for the Kloel capability resolver
   * (`ReportService.getSubscriptions`). Accepts the (workspaceId, args)
   * signature used by `KloelDomainServiceResolver`.
   *
   * Read-only, workspace-scoped list of CustomerSubscription rows plus a
   * status breakdown. `args.status` filters by exact status; `args.limit`
   * caps the list (default/max 50). No mutation, no $queryRaw.
   */
  async getSubscriptions(
    workspaceId: string,
    args?: { status?: string; limit?: number },
  ): Promise<SubscriptionReport> {
    const status = typeof args?.status === 'string' ? args.status.toUpperCase() : undefined;
    const limit = Math.min(Math.max(Math.trunc(args?.limit ?? DEFAULT_LIMIT), 1), DEFAULT_LIMIT);

    const [rows, grouped] = await Promise.all([
      this.prisma.customerSubscription.findMany({
        where: { workspaceId, ...(status ? { status } : {}) },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          planName: true,
          amount: true,
          interval: true,
          startedAt: true,
          nextBillingAt: true,
          cancelledAt: true,
        },
      }),
      this.prisma.customerSubscription.groupBy({
        by: ['status'],
        where: { workspaceId },
        _count: { id: true },
      }),
    ]);

    const byStatus: Record<string, number> = {};
    for (const g of grouped) {
      byStatus[g.status] = g._count.id;
    }

    const items: SubscriptionReportItem[] = rows.map((r) => ({
      id: r.id,
      status: r.status,
      planName: r.planName,
      amount: r.amount,
      interval: r.interval,
      startedAt: r.startedAt.toISOString(),
      nextBillingAt: r.nextBillingAt?.toISOString() ?? null,
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
    }));

    this.logger.log(`subscriptions ws=${workspaceId} total=${items.length}`);
    return { items, total: items.length, byStatus };
  }

  /**
   * Canonical-name report for the Kloel capability resolver
   * (`ReportService.getChargebacks`). Accepts the (workspaceId, args)
   * signature used by `KloelDomainServiceResolver`.
   *
   * Read-only, workspace-scoped list of CheckoutPayment rows with status
   * CHARGEBACK (joined to their order for the workspace filter, amount and
   * customer name). Money stays in integer cents (bigint) — no float math.
   */
  async getChargebacks(workspaceId: string, args?: { limit?: number }): Promise<ChargebackReport> {
    const limit = Math.min(Math.max(Math.trunc(args?.limit ?? DEFAULT_LIMIT), 1), DEFAULT_LIMIT);

    const rows = await this.prisma.checkoutPayment.findMany({
      where: { status: 'CHARGEBACK', order: { workspaceId } },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderId: true,
        createdAt: true,
        order: { select: { totalInCents: true, customerName: true } },
      },
    });

    let totalAmountCents = 0n;
    const items: ChargebackReportItem[] = rows.map((r) => {
      const amountCents = BigInt(r.order?.totalInCents ?? 0);
      totalAmountCents += amountCents;
      return {
        paymentId: r.id,
        orderId: r.orderId,
        amountCents,
        customerName: r.order?.customerName ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    });

    this.logger.log(`chargebacks ws=${workspaceId} total=${items.length}`);
    return { items, total: items.length, totalAmountCents };
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
