import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleAdsProvider } from './google-ads.provider';
import { googleAdsSyncQueue } from '../queue/queue';
import { createRedisClient } from '../common/redis/redis.util';
import type {
  AdAccountSyncResult,
  AdCampaignSyncResult,
  AdInsightSyncResult,
} from './ad-provider.interface';

type AdsSyncJobData =
  | { type: 'sync-accounts'; workspaceId: string }
  | { type: 'sync-campaigns'; workspaceId: string }
  | { type: 'sync-insights'; workspaceId: string; since: string; until: string };

const MAX_CONCURRENCY = 2;

@Injectable()
export class AdsSyncProcessor implements OnModuleDestroy {
  private readonly logger = new Logger(AdsSyncProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleAds: GoogleAdsProvider,
  ) {}

  onModuleInit() {
    this.startWorker();
  }

  onModuleDestroy() {
    void this.stopWorker();
  }

  private startWorker() {
    const queueName = 'google-ads-sync-jobs';
    const redisConnection = createRedisClient();

    this.worker = new Worker(
      queueName,
      async (job: Job<AdsSyncJobData>) => {
        const { type } = job.data;
        this.logger.log(
          `Processing Google Ads sync job: ${type} workspace=${job.data.workspaceId} attempt=${job.attemptsMade + 1}`,
        );

        switch (type) {
          case 'sync-accounts':
            return this.processSyncAccounts(job.data.workspaceId);
          case 'sync-campaigns':
            return this.processSyncCampaigns(job.data.workspaceId);
          case 'sync-insights':
            return this.processSyncInsights(
              job.data.workspaceId,
              new Date(job.data.since),
              new Date(job.data.until),
            );
          default:
            throw new Error(`Unknown Google Ads sync job type: ${type}`);
        }
      },
      {
        connection: redisConnection,
        concurrency: MAX_CONCURRENCY,
        autorun: true,
        limiter: {
          max: 1,
          duration: 2000,
        },
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(
        `Google Ads sync job completed: ${job.data.type} workspace=${job.data.workspaceId}`,
      );
    });

    this.worker.on('failed', (job, err) => {
      if (job) {
        this.logger.error(
          `Google Ads sync job failed: ${job.data.type} workspace=${job.data.workspaceId} attempt=${job.attemptsMade} error=${err.message}`,
        );
      }
    });

    this.logger.log('Google Ads sync worker started');
  }

  private async stopWorker() {
    if (this.worker) {
      await this.worker.close().catch(() => undefined);
      this.worker = null;
      this.logger.log('Google Ads sync worker stopped');
    }
  }

  private async processSyncAccounts(workspaceId: string) {
    const result = await this.googleAds.syncAccounts(workspaceId);
    await this.persistAccounts(workspaceId, result.accounts);
    return { accounts: result.accounts.length };
  }

  private async processSyncCampaigns(workspaceId: string) {
    const result = await this.googleAds.syncCampaigns(workspaceId);
    await this.persistCampaigns(workspaceId, result.campaigns);
    return { campaigns: result.campaigns.length };
  }

  private async processSyncInsights(workspaceId: string, since: Date, until: Date) {
    const result = await this.googleAds.syncInsights(workspaceId, since, until);
    await this.persistInsights(workspaceId, result.insights);
    return { insights: result.insights.length };
  }

  private async persistAccounts(workspaceId: string, accounts: AdAccountSyncResult[]) {
    for (const acc of accounts) {
      await this.prisma.adAccount.upsert({
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

  private async persistCampaigns(workspaceId: string, campaigns: AdCampaignSyncResult[]) {
    for (const camp of campaigns) {
      await this.prisma.adCampaign.upsert({
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

  private async persistInsights(workspaceId: string, insights: AdInsightSyncResult[]) {
    for (const insight of insights) {
      const date = insight.date instanceof Date ? insight.date : new Date(insight.date);
      await this.prisma.adInsight.upsert({
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

  static enqueueSyncAccounts(workspaceId: string) {
    const jobData: AdsSyncJobData = { type: 'sync-accounts', workspaceId };
    return googleAdsSyncQueue.add('sync-accounts', jobData);
  }

  static enqueueSyncCampaigns(workspaceId: string) {
    const jobData: AdsSyncJobData = { type: 'sync-campaigns', workspaceId };
    return googleAdsSyncQueue.add('sync-campaigns', jobData);
  }

  static enqueueSyncInsights(workspaceId: string, since: Date, until: Date) {
    const jobData: AdsSyncJobData = {
      type: 'sync-insights',
      workspaceId,
      since: since.toISOString(),
      until: until.toISOString(),
    };
    return googleAdsSyncQueue.add('sync-insights', jobData);
  }
}
