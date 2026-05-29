import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';

export interface SubscriptionListArgs {
  limit?: number;
  status?: string;
  [key: string]: unknown;
}

export interface SubscriptionUpdateArgs {
  status?: string;
  cancelAtPeriodEnd?: boolean;
  plan?: string;
  [key: string]: unknown;
}

/**
 * SubscriptionService — read/update workspace platform subscription.
 *
 * domainService aliases:
 *   - SubscriptionService.list  (returns subscription + invoices)
 *   - SubscriptionService.update (updates status/plan/cancelAtPeriodEnd — non-financial metadata only)
 *
 * Workspace isolation: all operations filter by workspaceId.
 *
 * NOTE: This does NOT call Stripe directly. Stripe lifecycle mutations must
 * go through BillingService. This service only reads/updates the Prisma
 * Subscription record as a local cache.
 */
@Injectable()
export class SubscriptionService {
  private readonly logger = StructuredLogger.from(SubscriptionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** List workspace subscription and recent invoices. */
  async list(
    workspaceId: string,
    args: SubscriptionListArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const limit = Math.min(Number(args.limit ?? 20), 100);

    const [subscription, invoices] = await Promise.all([
      this.prisma.subscription.findUnique({
        where: { workspaceId },
        select: {
          id: true,
          status: true,
          plan: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: { workspaceId },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          status: true,
          url: true,
          createdAt: true,
        },
      }),
    ]);

    this.logger.log(`SubscriptionService.list ws=${workspaceId}`);
    return { success: true, data: { subscription, invoices } };
  }

  /**
   * Update local subscription metadata.
   * Only safe non-financial fields: plan label, cancelAtPeriodEnd, status.
   * Real Stripe mutations must go through BillingService.
   */
  async update(
    workspaceId: string,
    args: SubscriptionUpdateArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const existing = await this.prisma.subscription.findUnique({
      where: { workspaceId },
      select: { id: true },
    });

    if (!existing) {
      return { success: false, data: null };
    }

    const patch: Record<string, unknown> = {};
    if (args.cancelAtPeriodEnd !== undefined) {
      patch.cancelAtPeriodEnd = Boolean(args.cancelAtPeriodEnd);
    }
    if (args.status !== undefined) {
      patch.status = String(args.status).toUpperCase();
    }
    if (args.plan !== undefined) {
      patch.plan = String(args.plan).toUpperCase();
    }

    const updated = await this.prisma.subscription.update({
      where: { workspaceId },
      data: patch,
    });

    this.logger.log(`SubscriptionService.update ws=${workspaceId}`, patch);
    return { success: true, data: updated };
  }
}
