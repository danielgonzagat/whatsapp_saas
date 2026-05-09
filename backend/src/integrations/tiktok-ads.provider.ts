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

const TIKTOK_ADS_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

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
      const { url, kind } = await this.tiktokMarketing.generateAuthUrl(workspaceId, 'advertiser');
      return {
        connected: false,
        status: 'pending_oauth',
        authUrl: url,
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
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const tiktok = (settings.tiktok || {}) as Record<string, unknown>;
    const accessToken = tiktok.accessToken as string | undefined;

    if (!accessToken) {
      return { accounts: [] };
    }

    // TODO: Call TikTok Ads API /v1.3/advertiser/info/ to get advertiser names when fully implemented
    const accounts = status.advertiserIds.map((id) => ({
      platform: 'tiktok' as const,
      accountId: id,
      accountName: `TikTok Ad Account ${id}`,
    }));

    return { accounts };
  }

  async syncCampaigns(workspaceId: string): Promise<SyncCampaignsResult> {
    const status = await this.tiktokMarketing.getStatus(workspaceId);
    if (!status.connected) {
      return { campaigns: [] };
    }
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const tiktok = (settings.tiktok || {}) as Record<string, unknown>;
    const accessToken = tiktok.accessToken as string | undefined;

    if (!accessToken) {
      return { campaigns: [] };
    }

    // TODO: Call TikTok Ads API /v1.3/campaign/get/ to fetch real campaigns
    this.logger.warn('TikTok Ads syncCampaigns scaffold — implement TikTok Ads API campaign listing');
    return { campaigns: [] };
  }

  async syncInsights(_workspaceId: string, _since: Date, _until: Date): Promise<SyncInsightsResult> {
    // TODO: Call TikTok Ads API /v1.3/report/integrated/get/ for ad insights
    this.logger.warn('TikTok Ads syncInsights scaffold — implement TikTok Ads API reporting');
    return { insights: [] };
  }
}
