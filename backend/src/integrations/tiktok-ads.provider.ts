import { Injectable, Logger } from '@nestjs/common';
import { TikTokMarketingService } from '../marketing/tiktok-marketing.service';
import { TikTokAdsService } from '../marketing/tiktok-ads.service';
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
    private readonly tiktokMarketing: TikTokMarketingService,
    private readonly tiktokAds: TikTokAdsService,
  ) {}

  async connect(workspaceId: string, _redirectUri: string): Promise<OAuthConnectResult> {
    try {
      const result = this.tiktokMarketing.generateAuthUrl(workspaceId, 'advertiser');
      return Promise.resolve({
        connected: false,
        status: 'pending_oauth',
        authUrl: result.url,
      });
    } catch (err) {
      this.logger.error('TikTok Ads connect URL generation failed', err);
      return Promise.resolve({
        connected: false,
        status: 'tiktok_not_configured',
        providerMessage: String(err),
      });
    }
  }

  async completeOAuth(
    workspaceId: string,
    code: string,
    redirectUri: string,
  ): Promise<OAuthConnectResult> {
    try {
      const result = await this.tiktokMarketing.completeOAuth(workspaceId, {
        code,
        kind: 'advertiser',
        redirectUri,
      });
      return {
        connected: result.connected,
        status: result.status,
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

  async syncCampaigns(workspaceId: string): Promise<SyncCampaignsResult> {
    let auth: { accessToken: string; advertiserIds: string[] };

    try {
      auth = await this.tiktokAds.getAccessTokenAndAdvertiserIds(workspaceId);
    } catch (err) {
      this.logger.error('TikTok Ads syncCampaigns — authentication failed', err);
      throw err;
    }

    const campaigns: SyncCampaignsResult['campaigns'] = [];

    for (const advertiserId of auth.advertiserIds) {
      try {
        const fetched = await this.tiktokAds.getCampaignsForAdvertiser(
          auth.accessToken,
          advertiserId,
        );

        for (const c of fetched) {
          campaigns.push({
            platform: 'tiktok',
            accountId: c.advertiserId,
            campaignId: c.campaignId,
            campaignName: c.campaignName,
            status: c.status,
            spend: 0,
            revenue: 0,
            roas: 0,
            conversions: 0,
            impressions: 0,
            clicks: 0,
            ctr: 0,
            cpc: 0,
          });
        }
      } catch (err) {
        this.logger.error(`TikTok campaign sync failed for advertiser ${advertiserId}`, err);
        throw err;
      }
    }

    this.logger.log(
      `TikTok syncCampaigns done — ${campaigns.length} campaigns across ${auth.advertiserIds.length} advertisers`,
    );
    return { campaigns };
  }

  async syncInsights(workspaceId: string, since: Date, until: Date): Promise<SyncInsightsResult> {
    let auth: { accessToken: string; advertiserIds: string[] };

    try {
      auth = await this.tiktokAds.getAccessTokenAndAdvertiserIds(workspaceId);
    } catch (err) {
      this.logger.error('TikTok Ads syncInsights — authentication failed', err);
      throw err;
    }

    const startDate = since.toISOString().slice(0, 10);
    const endDate = until.toISOString().slice(0, 10);

    const insights: SyncInsightsResult['insights'] = [];

    for (const advertiserId of auth.advertiserIds) {
      try {
        const rows = await this.tiktokAds.getReport(
          auth.accessToken,
          advertiserId,
          startDate,
          endDate,
        );

        for (const row of rows) {
          insights.push({
            platform: 'tiktok',
            accountId: row.advertiserId,
            date: new Date(row.date),
            spend: row.spend,
            revenue: 0,
            roas: row.spend > 0 ? 0 : 0,
            conversions: row.conversions,
            impressions: row.impressions,
            clicks: row.clicks,
            ctr: row.ctr,
            cpc: row.cpc,
          });
        }
      } catch (err) {
        this.logger.error(`TikTok insights sync failed for advertiser ${advertiserId}`, err);
        throw err;
      }
    }

    this.logger.log(
      `TikTok syncInsights done — ${insights.length} report rows across ${auth.advertiserIds.length} advertisers`,
    );
    return { insights };
  }
}
