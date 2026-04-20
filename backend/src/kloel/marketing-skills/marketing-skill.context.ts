import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { MarketingWorkspaceSnapshot } from './marketing-skill.types';

type TopProductEntry = MarketingWorkspaceSnapshot['topProducts'][number];
type RecentCampaignEntry = MarketingWorkspaceSnapshot['recentCampaigns'][number];

interface ProductRow {
  id: string;
  name: string;
  price: unknown;
  active: boolean;
}

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  scheduledAt: Date | null;
}

function toTopProduct(product: ProductRow): TopProductEntry {
  return {
    id: product.id,
    name: product.name,
    price: typeof product.price === 'number' ? product.price : null,
    active: product.active,
  };
}

function toRecentCampaign(campaign: CampaignRow): RecentCampaignEntry {
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    scheduledAt: campaign.scheduledAt?.toISOString() || null,
  };
}

/** Marketing skill context builder. */
@Injectable()
export class MarketingSkillContextBuilder {
  constructor(private readonly prisma: PrismaService) {}

  /** Build snapshot. */
  async buildSnapshot(workspaceId: string): Promise<MarketingWorkspaceSnapshot> {
    const [workspace, brandVoiceMemory, workspaceProducts] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true },
      }),
      this.prisma.kloelMemory.findFirst({
        where: { workspaceId, key: 'brandVoice' },
        select: { value: true },
      }),
      this.prisma.product.findMany({
        where: { workspaceId },
        select: { id: true },
      }),
    ]);

    const workspaceProductIds = workspaceProducts.map((product) => product.id);
    const affiliateProducts =
      workspaceProductIds.length > 0
        ? await this.prisma.affiliateProduct.findMany({
            where: { productId: { in: workspaceProductIds } },
            select: { id: true },
          })
        : [];
    const affiliateProductIds = affiliateProducts.map((product) => product.id);

    const [
      products,
      productCount,
      activeProductCount,
      totalOrderCount,
      paidOrderCount,
      revenueAggregate,
      socialLeadCount,
      campaignCount,
      recentCampaigns,
      siteCount,
      publishedSiteCount,
      affiliateLinkCount,
      contactCount,
    ] = await Promise.all([
      this.prisma.product.findMany({
        where: { workspaceId },
        select: { id: true, name: true, price: true, active: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.product.count({ where: { workspaceId } }),
      this.prisma.product.count({ where: { workspaceId, active: true } }),
      this.prisma.checkoutOrder.count({ where: { workspaceId } }),
      this.prisma.checkoutOrder.count({ where: { workspaceId, status: 'PAID' } }),
      this.prisma.checkoutOrder.aggregate({
        where: { workspaceId, status: 'PAID' },
        _sum: { totalInCents: true },
      }),
      this.prisma.checkoutSocialLead.count({ where: { workspaceId } }),
      this.prisma.campaign.count({ where: { workspaceId } }),
      this.prisma.campaign.findMany({
        where: { workspaceId },
        select: { id: true, name: true, status: true, scheduledAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      this.prisma.kloelSite.count({ where: { workspaceId } }),
      this.prisma.kloelSite.count({ where: { workspaceId, published: true } }),
      affiliateProductIds.length > 0
        ? this.prisma.affiliateLink.count({
            where: { affiliateProductId: { in: affiliateProductIds } },
          })
        : Promise.resolve(0),
      this.prisma.contact.count({ where: { workspaceId } }),
    ]);

    const brandVoiceValue =
      brandVoiceMemory?.value && typeof brandVoiceMemory.value === 'object'
        ? (brandVoiceMemory.value as Record<string, unknown>)
        : null;
    const affiliateProductCount = affiliateProducts.length;

    const checkoutConversionRate =
      socialLeadCount > 0 ? Number(((paidOrderCount / socialLeadCount) * 100).toFixed(2)) : null;

    const notes: string[] = [];
    if (activeProductCount === 0) {
      notes.push('Nenhum produto ativo encontrado no workspace.');
    }
    if (socialLeadCount === 0) {
      notes.push(
        'Sem leads sociais capturados ainda; não há base real para taxa de conversão de checkout.',
      );
    }
    if (campaignCount === 0) {
      notes.push('Nenhuma campanha cadastrada ainda.');
    }
    if (siteCount === 0) {
      notes.push('Nenhum site/landing salvo ainda.');
    }
    if (affiliateProductCount === 0) {
      notes.push('Programa de afiliados ainda não tem produtos listados.');
    }

    return {
      workspaceName: workspace?.name || null,
      brandVoice: typeof brandVoiceValue?.style === 'string' ? brandVoiceValue.style : null,
      productCount,
      activeProductCount,
      topProducts: products.map(toTopProduct),
      paidOrderCount,
      totalOrderCount,
      socialLeadCount,
      checkoutConversionRate,
      grossRevenueCents: Number(revenueAggregate._sum.totalInCents || 0),
      campaignCount,
      recentCampaigns: recentCampaigns.map(toRecentCampaign),
      siteCount,
      publishedSiteCount,
      affiliateProductCount,
      affiliateLinkCount,
      contactCount,
      notes,
    };
  }
}
