import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleAdsProvider } from './google-ads.provider';
import { MetaMarketingProvider } from './meta-marketing.provider';
import { googleAdsSyncQueue, metaAdsSyncQueue } from '../queue/queue';
import { createRedisClient } from '../common/redis/redis.util';
import {
  persistAdAccounts,
  persistAdCampaigns,
  persistAdInsights,
  readAdsSyncStatus,
} from './ads-sync-persistence.helpers';
import type {
  AdAccountSyncResult,
  AdCampaignSyncResult,
  AdInsightSyncResult,
} from './ad-provider.interface';

type AdsSyncJobData =
  | { type: 'sync-accounts'; workspaceId: string }
  | { type: 'sync-campaigns'; workspaceId: string }
  | { type: 'sync-insights'; workspaceId: string; since: string; until: string }
  | { type: 'refresh-google-token'; workspaceId: string };

type MetaSyncJobData =
  | { type: 'sync-meta-accounts'; workspaceId: string }
  | { type: 'sync-meta-campaigns'; workspaceId: string }
  | { type: 'sync-meta-insights'; workspaceId: string; since: string; until: string }
  | { type: 'refresh-meta-token'; workspaceId: string };

const MAX_CONCURRENCY = 2;
const GOOGLE_RETRY_ATTEMPTS = 5;
const META_RETRY_ATTEMPTS = 5;
const META_RATE_LIMIT_PER_HOUR = 200;

@Injectable()
export class AdsSyncProcessor implements OnModuleDestroy {
  private readonly logger = new Logger(AdsSyncProcessor.name);
  private googleWorker: Worker | null = null;
  private metaWorker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleAds: GoogleAdsProvider,
    private readonly metaMarketing: MetaMarketingProvider,
  ) {}

  onModuleInit() {
    this.startGoogleWorker();
    this.startMetaWorker();
  }

  onModuleDestroy() {
    void this.stopWorkers();
  }

  // ── Google Ads Worker ──────────────────────────────────────────────

  private startGoogleWorker() {
    const redisConnection = createRedisClient();

    this.googleWorker = new Worker(
      'google-ads-sync-jobs',
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
          case 'refresh-google-token':
            return this.processGoogleTokenRefresh(job.data.workspaceId);
          default:
            throw new Error(`Unknown Google Ads sync job type: ${String(type)}`);
        }
      },
      {
        connection: redisConnection,
        concurrency: MAX_CONCURRENCY,
        autorun: true,
        limiter: { max: 1, duration: 2000 },
      },
    );

    this.googleWorker.on('completed', (job: Job<AdsSyncJobData>) => {
      this.logger.log(
        `Google Ads sync job completed: type=${String(job.data.type)} workspace=${String(job.data.workspaceId)}`,
      );
    });

    this.googleWorker.on('failed', (job: Job<AdsSyncJobData> | undefined, err: Error) => {
      if (job) {
        this.logger.error(
          `Google Ads sync job failed: type=${String(job.data.type)} workspace=${String(job.data.workspaceId)} attempt=${job.attemptsMade} error=${err.message}`,
        );

        if (job.attemptsMade >= GOOGLE_RETRY_ATTEMPTS) {
          this.logger.error(
            `Google Ads sync job EXHAUSTED after ${GOOGLE_RETRY_ATTEMPTS} retries — sending to DLQ: ${String(job.data.type)} workspace=${String(job.data.workspaceId)}`,
          );
        }
      }
    });

    this.logger.log('Google Ads sync worker started (retry: 5x, dedup by jobId)');
  }

  // ── Meta Ads Worker ─────────────────────────────────────────────────

  private startMetaWorker() {
    const redisConnection = createRedisClient();

    this.metaWorker = new Worker(
      'ads-sync-meta',
      async (job: Job<MetaSyncJobData>) => {
        const { type, workspaceId } = job.data;
        this.logger.log(
          `Processing Meta Ads sync job: ${type} workspace=${workspaceId} attempt=${job.attemptsMade + 1}`,
        );

        switch (type) {
          case 'sync-meta-accounts':
            return this.processMetaSyncAccounts(workspaceId);
          case 'sync-meta-campaigns':
            return this.processMetaSyncCampaigns(workspaceId);
          case 'sync-meta-insights':
            return this.processMetaSyncInsights(
              workspaceId,
              new Date(job.data.since),
              new Date(job.data.until),
            );
          case 'refresh-meta-token':
            return this.processMetaTokenRefresh(workspaceId);
          default:
            throw new Error(`Unknown Meta Ads sync job type: ${String(type)}`);
        }
      },
      {
        connection: redisConnection,
        concurrency: MAX_CONCURRENCY,
        autorun: true,
        limiter: {
          max: META_RATE_LIMIT_PER_HOUR,
          duration: 60 * 60 * 1000,
        },
      },
    );

    this.metaWorker.on('completed', (job: Job<MetaSyncJobData>) => {
      this.logger.log(
        `Meta Ads sync job completed: type=${String(job.data.type)} workspace=${String(job.data.workspaceId)}`,
      );
    });

    this.metaWorker.on('failed', (job: Job<MetaSyncJobData> | undefined, err: Error) => {
      if (job) {
        this.logger.error(
          `Meta Ads sync job failed: type=${String(job.data.type)} workspace=${String(job.data.workspaceId)} attempt=${job.attemptsMade} error=${err.message}`,
        );

        if (job.attemptsMade >= META_RETRY_ATTEMPTS) {
          this.logger.error(
            `Meta Ads sync job EXHAUSTED after ${META_RETRY_ATTEMPTS} retries — sending to DLQ: ${String(job.data.type)} workspace=${String(job.data.workspaceId)}`,
          );
        }
      }
    });

    this.logger.log('Meta Ads sync worker started (queue: ads-sync-meta, retry: 5x, rate: 200/hr)');
  }

  private async stopWorkers() {
    if (this.googleWorker) {
      await this.googleWorker.close().catch(() => undefined);
      this.googleWorker = null;
    }
    if (this.metaWorker) {
      await this.metaWorker.close().catch(() => undefined);
      this.metaWorker = null;
    }
    this.logger.log('All Ads sync workers stopped');
  }

  // ── Google Ads processing ──────────────────────────────────────────

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

  private async processGoogleTokenRefresh(workspaceId: string) {
    const result = await this.googleAds.refreshToken(workspaceId);
    if (!result) {
      this.logger.warn(`Google token refresh returned null for workspace ${workspaceId}`);
      return { refreshed: false };
    }
    this.logger.log(`Google token refreshed for workspace ${workspaceId}`);
    return { refreshed: true, expiresIn: result.expiresIn };
  }

  // ── Meta Ads processing ────────────────────────────────────────────

  private async processMetaSyncAccounts(workspaceId: string) {
    const result = await this.metaMarketing.syncAccounts(workspaceId);
    await this.persistAccounts(workspaceId, result.accounts);
    return { accounts: result.accounts.length };
  }

  private async processMetaSyncCampaigns(workspaceId: string) {
    const result = await this.metaMarketing.syncCampaigns(workspaceId);
    await this.persistCampaigns(workspaceId, result.campaigns);
    return { campaigns: result.campaigns.length };
  }

  private async processMetaSyncInsights(workspaceId: string, since: Date, until: Date) {
    const result = await this.metaMarketing.syncInsights(workspaceId, since, until);
    await this.persistInsights(workspaceId, result.insights);
    return { insights: result.insights.length };
  }

  private async processMetaTokenRefresh(workspaceId: string) {
    const result = await this.metaMarketing.refreshToken(workspaceId);
    if (!result) {
      this.logger.warn(`Meta token refresh returned null for workspace ${workspaceId}`);
      return { refreshed: false };
    }
    this.logger.log(`Meta token refreshed for workspace ${workspaceId}`);
    return { refreshed: true, expiresIn: result.expiresIn };
  }

  // ── Persistence helpers ────────────────────────────────────────────

  private async persistAccounts(workspaceId: string, accounts: AdAccountSyncResult[]) {
    return persistAdAccounts(this.prisma, workspaceId, accounts);
  }

  private async persistCampaigns(workspaceId: string, campaigns: AdCampaignSyncResult[]) {
    return persistAdCampaigns(this.prisma, workspaceId, campaigns);
  }

  private async persistInsights(workspaceId: string, insights: AdInsightSyncResult[]) {
    return persistAdInsights(this.prisma, workspaceId, insights);
  }

  // ── Sync status reader ────────────────────────────────────────────

  async getSyncStatus(workspaceId: string) {
    return readAdsSyncStatus(this.prisma, workspaceId);
  }

  // ── Static enqueue helpers (Google) ───────────────────────────────

  static enqueueSyncAccounts(workspaceId: string) {
    const day = new Date().toISOString().slice(0, 10);
    const jobId = `google-sync-accounts-${workspaceId}-${day}`;
    const jobData: AdsSyncJobData = { type: 'sync-accounts', workspaceId };
    return googleAdsSyncQueue.add('sync-accounts', jobData, {
      jobId,
      attempts: GOOGLE_RETRY_ATTEMPTS,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  static enqueueSyncCampaigns(workspaceId: string) {
    const day = new Date().toISOString().slice(0, 10);
    const jobId = `google-sync-campaigns-${workspaceId}-${day}`;
    const jobData: AdsSyncJobData = { type: 'sync-campaigns', workspaceId };
    return googleAdsSyncQueue.add('sync-campaigns', jobData, {
      jobId,
      attempts: GOOGLE_RETRY_ATTEMPTS,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  static enqueueSyncInsights(workspaceId: string, since: Date, until: Date) {
    const day = new Date().toISOString().slice(0, 10);
    const jobId = `google-sync-insights-${workspaceId}-${day}`;
    const jobData: AdsSyncJobData = {
      type: 'sync-insights',
      workspaceId,
      since: since.toISOString(),
      until: until.toISOString(),
    };
    return googleAdsSyncQueue.add('sync-insights', jobData, {
      jobId,
      attempts: GOOGLE_RETRY_ATTEMPTS,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  static enqueueGoogleRefreshToken(workspaceId: string) {
    const jobId = `google-refresh-token-${workspaceId}`;
    const jobData: AdsSyncJobData = { type: 'refresh-google-token', workspaceId };
    return googleAdsSyncQueue.add('refresh-google-token', jobData, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
    });
  }

  // ── Static enqueue helpers (Meta) ─────────────────────────────────

  static enqueueMetaSyncAccounts(workspaceId: string) {
    const day = new Date().toISOString().slice(0, 10);
    const jobId = `meta-sync-accounts-${workspaceId}-${day}`;
    const jobData: MetaSyncJobData = { type: 'sync-meta-accounts', workspaceId };
    return metaAdsSyncQueue.add('sync-meta-accounts', jobData, {
      jobId,
      attempts: META_RETRY_ATTEMPTS,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  static enqueueMetaSyncCampaigns(workspaceId: string) {
    const day = new Date().toISOString().slice(0, 10);
    const jobId = `meta-sync-campaigns-${workspaceId}-${day}`;
    const jobData: MetaSyncJobData = { type: 'sync-meta-campaigns', workspaceId };
    return metaAdsSyncQueue.add('sync-meta-campaigns', jobData, {
      jobId,
      attempts: META_RETRY_ATTEMPTS,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  static enqueueMetaSyncInsights(workspaceId: string, since: Date, until: Date) {
    const day = new Date().toISOString().slice(0, 10);
    const jobId = `meta-sync-insights-${workspaceId}-${day}`;
    const jobData: MetaSyncJobData = {
      type: 'sync-meta-insights',
      workspaceId,
      since: since.toISOString(),
      until: until.toISOString(),
    };
    return metaAdsSyncQueue.add('sync-meta-insights', jobData, {
      jobId,
      attempts: META_RETRY_ATTEMPTS,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  static enqueueMetaRefreshToken(workspaceId: string) {
    const jobId = `meta-refresh-token-${workspaceId}`;
    const jobData: MetaSyncJobData = { type: 'refresh-meta-token', workspaceId };
    return metaAdsSyncQueue.add('refresh-meta-token', jobData, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
    });
  }
}
