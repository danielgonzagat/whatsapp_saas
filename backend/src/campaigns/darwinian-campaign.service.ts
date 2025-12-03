import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DarwinianCampaignService {
  private readonly logger = new Logger(DarwinianCampaignService.name);

  constructor(private prisma: PrismaService) {}

  async evolveCampaigns() {
    // Find active campaigns with variants
    const parents = await this.prisma.campaign.findMany({
      where: { status: 'RUNNING', parentId: null },
      include: { variants: true },
    });

    for (const parent of parents) {
      if (parent.variants.length === 0) continue;

      // Compare variants
      let bestVariant: any = parent;
      let bestRate = this.calculateConversion(parent.stats);

      for (const variant of parent.variants) {
        const rate = this.calculateConversion(variant.stats);
        if (rate > bestRate) {
          bestRate = rate;
          bestVariant = variant;
        }
      }

      // If a variant is significantly better (> 10%), pause others
      if (bestVariant.id !== parent.id) {
        this.logger.log(
          `Darwinian Evolution: Variant ${bestVariant.id} is winning. Promoting...`,
        );
        // Logic to pause losers and allocate more budget/leads to winner
        // For MVP: Just log it.
      }
    }
  }

  private calculateConversion(stats: any): number {
    if (!stats || !stats.sent) return 0;
    return (stats.replied || 0) / stats.sent;
  }
}
