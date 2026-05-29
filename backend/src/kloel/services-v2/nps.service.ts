import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';

export interface NpsGetArgs {
  since?: string;
  limit?: number;
  [key: string]: unknown;
}

/**
 * NpsService — Net Promoter Score data derived from checkout reviews and sales.
 *
 * domainService alias: NpsService.get
 * Workspace isolation: all queries filter by workspaceId.
 *
 * NPS is derived from ProductReview ratings (1-5 scale → detractors/passives/promoters)
 * since there is no dedicated NPS model in the schema.
 */
@Injectable()
export class NpsService {
  private readonly logger = StructuredLogger.from(NpsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute NPS from ProductReview ratings for the workspace.
   * Rating 5 → promoter, rating 3-4 → passive, rating 1-2 → detractor.
   */
  async get(workspaceId: string, args: NpsGetArgs): Promise<{ success: boolean; data: unknown }> {
    const since = args.since ? new Date(String(args.since)) : new Date(0);
    const limit = Math.min(Number(args.limit ?? 200), 500);

    // Fetch reviews for workspace products
    const reviews = await this.prisma.productReview.findMany({
      where: {
        product: { workspaceId },
        createdAt: { gte: since },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { id: true, rating: true, authorName: true, comment: true, createdAt: true },
    });

    const promoters = reviews.filter((r) => r.rating === 5).length;
    const passives = reviews.filter((r) => r.rating >= 3 && r.rating <= 4).length;
    const detractors = reviews.filter((r) => r.rating <= 2).length;
    const total = reviews.length;

    const score =
      total > 0 ? Math.round(((promoters - detractors) / total) * 100) : null;

    this.logger.log(
      `NpsService.get ws=${workspaceId} total=${total} score=${score ?? 'n/a'}`,
    );

    return {
      success: true,
      data: {
        score,
        total,
        promoters,
        passives,
        detractors,
        reviews: reviews.slice(0, 50),
      },
    };
  }
}
