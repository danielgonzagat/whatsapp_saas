import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetaSdkService } from '../meta/meta-sdk.service';
import { MetaAdsService } from '../meta/ads/meta-ads.service';
import { encryptMetaToken, decryptMetaToken } from './meta-token-crypto';
import type {
  AdProvider,
  OAuthConnectResult,
  OAuthStatusResult,
  SyncAccountsResult,
  SyncCampaignsResult,
  SyncInsightsResult,
  DisconnectResult,
  RefreshTokenResult,
} from './ad-provider.interface';

interface MetaTokenResponse {
  access_token?: string;
  [key: string]: unknown;
}

interface MetaAdAccount {
  id?: string;
  name?: string;
  account_id?: string;
  [key: string]: unknown;
}

interface MetaAdAccountsResponse {
  data?: MetaAdAccount[];
  [key: string]: unknown;
}

interface MetaAccountInfo {
  name?: string;
  id?: string;
  account_status?: string;
  [key: string]: unknown;
}

interface MetaCampaignResponse {
  data?: MetaCampaignData[];
  [key: string]: unknown;
}

interface MetaCampaignData {
  id?: string;
  name?: string;
  status?: string;
  objective?: string;
  [key: string]: unknown;
}

interface MetaInsightData {
  impressions?: string;
  clicks?: string;
  spend?: string;
  ctr?: string;
  cpc?: string;
  reach?: string;
  conversions?: string;
  actions?: string;
  [key: string]: unknown;
}

interface MetaInsightsResponse {
  data?: MetaInsightData[];
  [key: string]: unknown;
}

function maskToken(token: string): string {
  if (!token || token.length < 8) return '****';
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

@Injectable()
export class MetaMarketingProvider implements AdProvider {
  readonly platform = 'meta';
  private readonly logger = new Logger(MetaMarketingProvider.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaSdk: MetaSdkService,
    private readonly metaAds: MetaAdsService,
  ) {}

  async connect(_workspaceId: string, redirectUri: string): Promise<OAuthConnectResult> {
    await Promise.resolve();
    const appId = String(process.env.META_APP_ID || '').trim();
    if (!appId) {
      return { connected: false, status: 'meta_app_id_not_configured' };
    }
    const configId = String(process.env.META_BUSINESS_CONFIG_ID || '').trim();
    const authUrl = configId
      ? `https://www.facebook.com/v22.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&config_id=${configId}&override_default_response_type=code&state=${_workspaceId}`
      : `https://www.facebook.com/v22.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=ads_management,ads_read,business_management&state=${_workspaceId}`;
    return { connected: false, status: 'pending_oauth', authUrl };
  }

  async completeOAuth(
    workspaceId: string,
    code: string,
    _redirectUri: string,
  ): Promise<OAuthConnectResult> {
    try {
      const appId = String(process.env.META_APP_ID || '').trim();
      const appSecret = String(process.env.META_APP_SECRET || '').trim();
      if (!appId || !appSecret) {
        return { connected: false, status: 'meta_credentials_not_configured' };
      }

      const tokenResponse = await this.metaSdk.graphApiGet(
        'oauth/access_token',
        {
          client_id: appId,
          client_secret: appSecret,
          code,
        },
        '',
      );

      const accessToken = (tokenResponse as MetaTokenResponse).access_token;
      if (!accessToken) {
        return { connected: false, status: 'token_exchange_failed' };
      }

      this.logger.log(
        `Meta marketing OAuth token obtained: ${maskToken(accessToken)} workspace=${workspaceId}`,
      );

      const encryptedToken = encryptMetaToken(accessToken);

      const adAccounts = await this.metaSdk.graphApiGet(
        'me/adaccounts',
        { fields: 'id,name' },
        accessToken,
      );

      const accounts = (adAccounts as MetaAdAccountsResponse).data || [];
      const primaryAccount = accounts[0];

      const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

      await this.prisma.metaConnection.upsert({
        where: { workspaceId },
        create: {
          workspaceId,
          accessToken: encryptedToken || accessToken,
          tokenExpiresAt,
          adAccountId: (primaryAccount?.id as string) ?? null,
          status: 'connected',
        },
        update: {
          accessToken: encryptedToken || accessToken,
          tokenExpiresAt,
          adAccountId: (primaryAccount?.id as string) ?? null,
          status: 'connected',
          updatedAt: new Date(),
        },
      });

      this.logger.log(
        `Meta marketing OAuth complete for workspace ${workspaceId} adAccount=${primaryAccount?.id || 'none'}`,
      );

      return { connected: true, status: 'connected' };
    } catch (err) {
      this.logger.error('Meta OAuth completion failed', err);
      return { connected: false, status: 'oauth_error', providerMessage: String(err) };
    }
  }

  async getStatus(workspaceId: string): Promise<OAuthStatusResult> {
    const conn = await this.prisma.metaConnection.findUnique({
      where: { workspaceId },
      select: { status: true, adAccountId: true },
    });

    if (conn?.adAccountId) {
      return {
        connected: conn.status === 'connected',
        status: conn.status || 'disconnected',
        accountId: conn.adAccountId,
      };
    }

    return {
      connected: conn?.status === 'connected',
      status: conn?.status || 'disconnected',
    };
  }

  async disconnect(workspaceId: string): Promise<DisconnectResult> {
    const conn = await this.prisma.metaConnection.findUnique({
      where: { workspaceId },
      select: { accessToken: true },
    });

    if (!conn) {
      return { status: 'already_disconnected' };
    }

    const resolvedToken = decryptMetaToken(conn.accessToken) || conn.accessToken;
    if (resolvedToken && resolvedToken !== conn.accessToken) {
      try {
        await this.metaSdk.graphApiDelete('me/permissions', resolvedToken);
        this.logger.log(`Meta permissions revoked for workspace ${workspaceId}`);
      } catch {
        this.logger.warn(
          `Failed to revoke Meta permissions for workspace ${workspaceId} (non-blocking)`,
        );
      }
    }

    await this.prisma.metaConnection.delete({
      where: { workspaceId },
    });

    this.logger.log(`Meta marketing disconnected for workspace ${workspaceId}`);

    return { status: 'disconnected' };
  }

  async refreshToken(workspaceId: string): Promise<RefreshTokenResult | null> {
    const conn = await this.prisma.metaConnection.findUnique({
      where: { workspaceId },
      select: { accessToken: true, tokenExpiresAt: true },
    });

    if (!conn?.accessToken) {
      return null;
    }

    const resolvedToken = decryptMetaToken(conn.accessToken) || conn.accessToken;

    try {
      const longLived = await this.metaSdk.exchangeToken(resolvedToken);
      const newAccessToken = longLived.access_token;
      const expiresIn = longLived.expires_in;

      if (!newAccessToken) {
        return null;
      }

      const encryptedToken = encryptMetaToken(newAccessToken);
      const tokenExpiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000)
        : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

      await this.prisma.metaConnection.update({
        where: { workspaceId },
        data: {
          accessToken: encryptedToken || newAccessToken,
          tokenExpiresAt,
          updatedAt: new Date(),
        },
      });

      this.logger.log(
        `Meta token refreshed for workspace ${workspaceId} expiresIn=${expiresIn ?? '60d'}`,
      );

      const result: RefreshTokenResult = { accessToken: newAccessToken };
      if (expiresIn !== undefined) {
        result.expiresIn = expiresIn;
      }
      return result;
    } catch (err) {
      this.logger.error(`Meta token refresh failed for workspace ${workspaceId}`, err);
      return null;
    }
  }

  async syncAccounts(workspaceId: string): Promise<SyncAccountsResult> {
    const conn = await this.prisma.metaConnection.findUnique({
      where: { workspaceId },
      select: { accessToken: true, adAccountId: true },
    });

    if (!conn?.accessToken || !conn?.adAccountId) {
      return { accounts: [] };
    }

    const resolvedToken = decryptMetaToken(conn.accessToken) || conn.accessToken;

    try {
      const response = await this.metaSdk.graphApiGet(
        `act_${conn.adAccountId}`,
        { fields: 'id,name,account_status' },
        resolvedToken,
      );

      const data = response as MetaAccountInfo;
      return {
        accounts: [
          {
            platform: 'meta',
            accountId: `act_${conn.adAccountId}`,
            accountName: data.name || `Meta Ad Account ${conn.adAccountId}`,
          },
        ],
      };
    } catch (err) {
      this.logger.error('Meta account sync failed', err);
      return { accounts: [] };
    }
  }

  async syncCampaigns(workspaceId: string): Promise<SyncCampaignsResult> {
    const conn = await this.prisma.metaConnection.findUnique({
      where: { workspaceId },
      select: { accessToken: true, adAccountId: true },
    });

    if (!conn?.accessToken || !conn?.adAccountId) {
      return { campaigns: [] };
    }

    const resolvedToken = decryptMetaToken(conn.accessToken) || conn.accessToken;

    try {
      const response = await this.metaAds.getCampaigns(conn.adAccountId, resolvedToken, {
        fields: 'id,name,status',
      });

      const campaigns = (response as MetaCampaignResponse).data || [];
      const result = await Promise.all(
        campaigns.map(async (c) => {
          const campaignId = String(c.id || '');
          let insights: Record<string, unknown> = {};
          try {
            insights = await this.metaAds.getCampaignInsights(
              campaignId,
              resolvedToken,
              '2024-01-01',
              '2099-12-31',
            );
          } catch {
            void 0;
          }
          const insightData = (insights as MetaInsightsResponse).data?.[0] || {};
          return {
            platform: 'meta' as const,
            accountId: `act_${conn.adAccountId}`,
            campaignId,
            campaignName: String(c.name || ''),
            status: String(c.status || 'PAUSED'),
            spend: Number(insightData.spend || 0),
            revenue: 0,
            roas: 0,
            conversions: Number(insightData.conversions || 0),
            impressions: Number(insightData.impressions || 0),
            clicks: Number(insightData.clicks || 0),
            ctr: Number(insightData.ctr || 0),
            cpc: Number(insightData.cpc || 0),
          };
        }),
      );
      return { campaigns: result };
    } catch (err) {
      this.logger.error('Meta campaigns sync failed', err);
      return { campaigns: [] };
    }
  }

  async syncInsights(workspaceId: string, since: Date, until: Date): Promise<SyncInsightsResult> {
    const conn = await this.prisma.metaConnection.findUnique({
      where: { workspaceId },
      select: { accessToken: true, adAccountId: true },
    });

    if (!conn?.accessToken || !conn?.adAccountId) {
      return { insights: [] };
    }

    const resolvedToken = decryptMetaToken(conn.accessToken) || conn.accessToken;

    try {
      const response = await this.metaAds.getAccountInsights(conn.adAccountId, resolvedToken, {
        since: since.toISOString().slice(0, 10),
        until: until.toISOString().slice(0, 10),
      });

      const data = (response as MetaInsightsResponse).data || [];
      return {
        insights: data.map((d) => ({
          platform: 'meta' as const,
          accountId: `act_${conn.adAccountId}`,
          date: since,
          spend: Number(d.spend || 0),
          revenue: 0,
          roas: 0,
          conversions: Number(d.conversions || d.actions || 0),
          impressions: Number(d.impressions || 0),
          clicks: Number(d.clicks || 0),
          ctr: Number(d.ctr || 0),
          cpc: Number(d.cpc || 0),
        })),
      };
    } catch (err) {
      this.logger.error('Meta insights sync failed', err);
      return { insights: [] };
    }
  }
}
