import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TikTokMarketingService } from '../marketing/tiktok-marketing.service';
import type {
  AdProvider,
  OAuthConnectResult,
  OAuthStatusResult,
  SyncAccountsResult,
  SyncCampaignsResult,
  SyncInsightsResult,
} from './ad-provider.interface';

@Injectable()
export class TikTokAdsProvider implements AdProvider {
  readonly platform = 'tiktok';
  private readonly logger = new Logger(TikTokAdsProvider.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tiktokMarketing: TikTokMarketingService,
  ) {}

  async connect(workspaceId: string, _redirectUri: string): Promise<OAuthConnectResult> {
    try {
      const result = await this.tiktokMarketing.generateAuthUrl(workspaceId, 'advertiser');
      return {
        connected: false,
        status: 'pending_oauth',
        authUrl: result.url,
      };
    } catch (err) {
      this.logger.error('TikTok Ads connect URL generation failed', err);
      return { connected: false, status: 'tiktok_not_configured', providerMessage: String(err) };
    }
  }

  async completeOAuth(workspaceId: string, code: string, redirectUri: string): Promise<OAuthConnectResult> {
    try {
      const result = await this.tiktokMarketing.completeOAuth(workspaceId, {
        code,
        kind: 'advertiser',
        redirectUri,
      });
      return {
        connected: result.connected,
        status: result.status,
        providerMessage: (result as Record<string, unknown>).providerMessage as string | undefined,
      };
    } catch (err) {
      this.logger.error('TikTok Ads OAuth completion failed', err);
      return { connected: false, status: 'oauth_error', providerMessage: String(err) };
    }
  }

  async getStatus(workspaceId: string): Promise<OAuthStatusResult> {
    const status = await this.tiktokMarketing.getStatus(workspaceId);
    return {
      connected: status.connected,
      status: status.status,
      accountId: status.advertiserIds?.[0],
    };
  }

  async syncAccounts(workspaceId: string): Promise<SyncAccountsResult> {
    const status = await this.tiktokMarketing.getStatus(workspaceId);
    if (!status.connected || !status.advertiserIds?.length) {
      return { accounts: [] };
    }

    const accounts = status.advertiserIds.map((id) => ({
      platform: 'tiktok' as const,
      accountId: id,
      accountName: `TikTok Ad Account ${id}`,
    }));

    return { accounts };
  }

  async syncCampaigns(_workspaceId: string): Promise<SyncCampaignsResult> {
    this.logger.warn('TikTok Ads syncCampaigns scaffold — implement TikTok Ads API campaign listing');
    return { campaigns: [] };
  }

  async syncInsights(_workspaceId: string, _since: Date, _until: Date): Promise<SyncInsightsResult> {
    this.logger.warn('TikTok Ads syncInsights scaffold — implement TikTok Ads API reporting');
    return { insights: [] };
  }
}
