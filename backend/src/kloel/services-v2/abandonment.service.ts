import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';

export interface AbandonmentListArgs {
  since?: string;
  limit?: number;
  productId?: string;
  [key: string]: unknown;
}

/**
 * AbandonmentService — lists abandoned checkout carts (CheckoutSocialLead where convertedAt is null).
 *
 * domainService alias: AbandonmentService.list
 * Workspace isolation: all queries filter by workspaceId.
 */
@Injectable()
export class AbandonmentService {
  private readonly logger = StructuredLogger.from(AbandonmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** List abandoned carts for the workspace. */
  async list(
    workspaceId: string,
    args: AbandonmentListArgs,
  ): Promise<{ success: boolean; data: unknown; total: number }> {
    const since = args.since ? new Date(String(args.since)) : new Date(0);
    const limit = Math.min(Number(args.limit ?? 50), 200);
    const productId = args.productId ? String(args.productId) : undefined;

    const where = {
      workspaceId,
      convertedAt: null,
      createdAt: { gte: since },
      ...(productId ? { productId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.checkoutSocialLead.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          stepReached: true,
          provider: true,
          utmSource: true,
          utmCampaign: true,
          createdAt: true,
          product: { select: { id: true, name: true } },
          plan: { select: { id: true, name: true } },
        },
      }),
      this.prisma.checkoutSocialLead.count({ where }),
    ]);

    this.logger.log(`AbandonmentService.list ws=${workspaceId} total=${total}`);
    return { success: true, data: items, total };
  }
}
