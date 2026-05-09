import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AdInsightSyncResult } from '../ad-provider.interface';

/** Ad insight service. */
@Injectable()
export class AdInsightService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    workspaceId: string,
    params: {
      accountId?: string;
      platform?: string;
      since?: Date;
      until?: Date;
      page?: number;
      limit?: number;
    },
  ) {
    const { accountId, platform, since, until, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.AdInsightWhereInput = {
      workspaceId,
      ...(accountId ? { accountId } : {}),
      ...(platform ? { platform } : {}),
      ...(since || until
        ? { date: { ...(since ? { gte: since } : {}), ...(until ? { lte: until } : {}) } }
        : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.adInsight.count({ where: { workspaceId, ...where } }),
      this.prisma.adInsight.findMany({
        where: { workspaceId, ...where },
        skip,
        take: limit,
        orderBy: { date: 'desc' },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async syncInsights(
    workspaceId: string,
    accountId: string,
    platform: string,
    insights: AdInsightSyncResult[],
  ) {
    if (!insights.length) {
      return { synced: 0 };
    }

    let synced = 0;

    for (const insight of insights) {
      const date = insight.date instanceof Date ? insight.date : new Date(insight.date);

      await this.prisma.adInsight.upsert({
        where: {
          workspaceId_platform_accountId_date: {
            workspaceId,
            platform,
            accountId,
            date,
          },
        },
        update: {
          spend: insight.spend,
          revenue: insight.revenue,
          roas: insight.roas,
          conversions: insight.conversions,
          impressions: insight.impressions,
          clicks: insight.clicks,
          ctr: insight.ctr,
          cpc: insight.cpc,
        },
        create: {
          workspace: { connect: { id: workspaceId } },
          accountId,
          platform,
          date,
          spend: insight.spend,
          revenue: insight.revenue,
          roas: insight.roas,
          conversions: insight.conversions,
          impressions: insight.impressions,
          clicks: insight.clicks,
          ctr: insight.ctr,
          cpc: insight.cpc,
        },
      });

      synced++;
    }

    return { synced };
  }

  async create(
    workspaceId: string,
    data: {
      accountId: string;
      platform: string;
      date: Date;
      spend?: number;
      revenue?: number;
      roas?: number;
      conversions?: number;
      impressions?: number;
      clicks?: number;
      ctr?: number;
      cpc?: number;
    },
  ) {
    const date = data.date instanceof Date ? data.date : new Date(data.date);

    return this.prisma.adInsight.create({
      data: {
        workspace: { connect: { id: workspaceId } },
        accountId: data.accountId,
        platform: data.platform,
        date,
        spend: data.spend ?? 0,
        revenue: data.revenue ?? 0,
        roas: data.roas ?? 0,
        conversions: data.conversions ?? 0,
        impressions: data.impressions ?? 0,
        clicks: data.clicks ?? 0,
        ctr: data.ctr ?? 0,
        cpc: data.cpc ?? 0,
      },
    });
  }

  async update(
    workspaceId: string,
    id: string,
    data: {
      spend?: number;
      revenue?: number;
      roas?: number;
      conversions?: number;
      impressions?: number;
      clicks?: number;
      ctr?: number;
      cpc?: number;
    },
  ) {
    const insight = await this.prisma.adInsight.findUnique({ where: { id } });
    if (!insight || insight.workspaceId !== workspaceId) {
      return null;
    }

    return this.prisma.adInsight.update({
      where: { id },
      data,
    });
  }

  async delete(workspaceId: string, id: string) {
    const insight = await this.prisma.adInsight.findUnique({ where: { id } });
    if (!insight || insight.workspaceId !== workspaceId) {
      return null;
    }

    return this.prisma.adInsight.delete({ where: { id } });
  }

  async getSummary(
    workspaceId: string,
    params: { accountId?: string; platform?: string; since?: Date; until?: Date },
  ) {
    const { accountId, platform, since, until } = params;

    const where: Prisma.AdInsightWhereInput = {
      workspaceId,
      ...(accountId ? { accountId } : {}),
      ...(platform ? { platform } : {}),
      ...(since || until
        ? { date: { ...(since ? { gte: since } : {}), ...(until ? { lte: until } : {}) } }
        : {}),
    };

    const result = await this.prisma.adInsight.aggregate({
      where: { workspaceId, ...where },
      _sum: {
        spend: true,
        revenue: true,
        conversions: true,
        impressions: true,
        clicks: true,
      },
      _count: true,
    });

    return {
      totalSpend: result._sum.spend ?? 0,
      totalRevenue: result._sum.revenue ?? 0,
      totalConversions: result._sum.conversions ?? 0,
      totalImpressions: result._sum.impressions ?? 0,
      totalClicks: result._sum.clicks ?? 0,
      roas:
        (result._sum.spend ?? 0) > 0
          ? (result._sum.revenue ?? 0) / (result._sum.spend ?? 0)
          : 0,
      totalRecords: result._count,
    };
  }
}
