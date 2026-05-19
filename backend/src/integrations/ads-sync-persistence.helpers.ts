import { PrismaService } from '../prisma/prisma.service';
import type {
  AdAccountSyncResult,
  AdCampaignSyncResult,
  AdInsightSyncResult,
} from './ad-provider.interface';

export async function persistAdAccounts(
  prisma: PrismaService,
  workspaceId: string,
  accounts: AdAccountSyncResult[],
): Promise<void> {
  for (const acc of accounts) {
    await prisma.adAccount.upsert({
      where: {
        workspaceId_platform_accountId: {
          workspaceId,
          platform: acc.platform,
          accountId: acc.accountId,
        },
      },
      create: {
        workspaceId,
        platform: acc.platform,
        accountId: acc.accountId,
        accountName: acc.accountName ?? null,
        status: 'connected',
        lastSyncAt: new Date(),
      },
      update: {
        accountName: acc.accountName ?? null,
        status: 'connected',
        lastSyncAt: new Date(),
      },
    });
  }
}

export async function persistAdCampaigns(
  prisma: PrismaService,
  workspaceId: string,
  campaigns: AdCampaignSyncResult[],
): Promise<void> {
  for (const camp of campaigns) {
    await prisma.adCampaign.upsert({
      where: {
        workspaceId_platform_campaignId: {
          workspaceId,
          platform: camp.platform,
          campaignId: camp.campaignId,
        },
      },
      create: {
        workspaceId,
        accountId: camp.accountId,
        platform: camp.platform,
        campaignId: camp.campaignId,
        campaignName: camp.campaignName ?? null,
        status: camp.status ?? null,
        spend: camp.spend,
        revenue: camp.revenue,
        roas: camp.roas,
        conversions: camp.conversions,
        impressions: camp.impressions,
        clicks: camp.clicks,
        ctr: camp.ctr,
        cpc: camp.cpc,
        lastSyncAt: new Date(),
      },
      update: {
        campaignName: camp.campaignName ?? null,
        status: camp.status ?? null,
        spend: camp.spend,
        revenue: camp.revenue,
        roas: camp.roas,
        conversions: camp.conversions,
        impressions: camp.impressions,
        clicks: camp.clicks,
        ctr: camp.ctr,
        cpc: camp.cpc,
        lastSyncAt: new Date(),
      },
    });
  }
}

export async function persistAdInsights(
  prisma: PrismaService,
  workspaceId: string,
  insights: AdInsightSyncResult[],
): Promise<void> {
  for (const insight of insights) {
    const date = insight.date instanceof Date ? insight.date : new Date(insight.date);
    await prisma.adInsight.upsert({
      where: {
        workspaceId_platform_accountId_date: {
          workspaceId,
          platform: insight.platform,
          accountId: insight.accountId,
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
        accountId: insight.accountId,
        platform: insight.platform,
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
  }
}

export async function readAdsSyncStatus(prisma: PrismaService, workspaceId: string) {
  const metaConn = await prisma.metaConnection.findFirst({
    where: { workspaceId },
    select: { adAccountId: true, status: true },
  });

  const latestAccount = await prisma.adAccount.findFirst({
    where: { workspaceId, platform: 'meta' },
    orderBy: { lastSyncAt: 'desc' },
    select: { lastSyncAt: true },
  });

  const latestCampaign = await prisma.adCampaign.findFirst({
    where: { workspaceId, platform: 'meta' },
    orderBy: { lastSyncAt: 'desc' },
    select: { lastSyncAt: true },
  });

  const latestTikTokAccount = await prisma.adAccount.findFirst({
    where: { workspaceId, platform: 'tiktok' },
    orderBy: { lastSyncAt: 'desc' },
    select: { lastSyncAt: true },
  });

  const latestTikTokCampaign = await prisma.adCampaign.findFirst({
    where: { workspaceId, platform: 'tiktok' },
    orderBy: { lastSyncAt: 'desc' },
    select: { lastSyncAt: true },
  });

  return {
    workspaceId,
    meta: {
      connected: metaConn?.status === 'connected',
      adAccountId: metaConn?.adAccountId || null,
      lastAccountSync: latestAccount?.lastSyncAt?.toISOString() || null,
      lastCampaignSync: latestCampaign?.lastSyncAt?.toISOString() || null,
    },
    tiktok: {
      lastAccountSync: latestTikTokAccount?.lastSyncAt?.toISOString() || null,
      lastCampaignSync: latestTikTokCampaign?.lastSyncAt?.toISOString() || null,
    },
  };
}
