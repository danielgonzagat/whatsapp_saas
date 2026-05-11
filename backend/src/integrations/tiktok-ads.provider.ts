import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TikTokAdsService } from '../marketing/tiktok-ads.service';
import { encryptTikTokToken, decryptTikTokToken } from './tiktok-token-crypto';
import { asProviderSettings } from '../whatsapp/provider-settings.types';
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

interface TikTokProviderSubsettings {
  connected?: boolean;
  status?: string;
  kind?: string;
  accessToken?: string;
  refreshToken?: string | null;
  openId?: string | null;
  advertiserIds?: string[];
  scope?: string | null;
  expiresAt?: string | null;
  connectedAt?: string;
  [key: string]: unknown;
}

interface TikTokTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  advertiser_ids?: string[];
  data?: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    advertiser_ids?: string[];
  };
  message?: string;
  error?: string;
}

const PLATFORM = 'tiktok';
const ADVERTISER_AUTH_URL = 'https://business-api.tiktok.com/portal/auth';
const ADVERTISER_TOKEN_URL = 'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/';
const REVOKE_URL = 'https://business-api.tiktok.com/open_api/v1.3/oauth2/revoke/';

function maskToken(token: string): string {
  if (!token || token.length < 8) return '****';
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

function resolveEnv(name: string): string {
  return String(process.env[name] || '').trim();
}

function readTikTokSubsettings(workspaceProviderSettings: unknown): TikTokProviderSubsettings {
  const settings = asProviderSettings(workspaceProviderSettings);
  return (settings.tiktok || {}) as TikTokProviderSubsettings;
}

@Injectable()
export class TikTokAdsProvider implements AdProvider {
  readonly platform = PLATFORM;
  private readonly logger = new Logger(TikTokAdsProvider.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tiktokAds: TikTokAdsService,
  ) {}

  private resolveRedirectUri(explicit?: string): string {
    if (explicit) return explicit;
    const frontendUrl = resolveEnv('FRONTEND_URL') || 'https://app.kloel.com';
    return `${frontendUrl.replace(/\/+$/, '')}/integrations/tiktok/callback`;
  }

  private async resolveAccessToken(
    workspaceId: string,
  ): Promise<{ accessToken: string; advertiserIds: string[] }> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = asProviderSettings(workspace?.providerSettings);
    const tiktok = (settings.tiktok || {}) as TikTokProviderSubsettings;

    const encrypted = tiktok.accessToken;
    const accessToken = decryptTikTokToken(encrypted) || encrypted;
    const advertiserIds = Array.isArray(tiktok.advertiserIds) ? tiktok.advertiserIds : [];

    if (!accessToken) {
      throw new Error(
        'tiktok_ads_not_configured: no access token found — complete OAuth via TikTok Business Center first',
      );
    }

    if (!advertiserIds.length) {
      throw new Error(
        'tiktok_ads_not_configured: no advertiser IDs found — grant advertiser access in TikTok Business Center',
      );
    }

    return { accessToken: String(accessToken), advertiserIds };
  }

  // ── OAuth Connect ──────────────────────────────────────────────────

  async connect(workspaceId: string, redirectUri: string): Promise<OAuthConnectResult> {
    const appId = resolveEnv('TIKTOK_CLIENT_KEY') || resolveEnv('NEXT_PUBLIC_TIKTOK_CLIENT_KEY');
    if (!appId) {
      return { connected: false, status: 'tiktok_app_id_not_configured' };
    }

    const state = Buffer.from(JSON.stringify({ workspaceId, ts: Date.now() })).toString(
      'base64url',
    );

    const url = new URL(ADVERTISER_AUTH_URL);
    url.searchParams.set('app_id', appId);
    url.searchParams.set('state', state);
    url.searchParams.set('redirect_uri', this.resolveRedirectUri(redirectUri));

    return { connected: false, status: 'pending_oauth', authUrl: url.toString() };
  }

  async completeOAuth(
    workspaceId: string,
    code: string,
    redirectUri: string,
  ): Promise<OAuthConnectResult> {
    const appId = resolveEnv('TIKTOK_CLIENT_KEY') || resolveEnv('NEXT_PUBLIC_TIKTOK_CLIENT_KEY');
    const appSecret = resolveEnv('TIKTOK_CLIENT_SECRET');

    if (!appId || !appSecret) {
      return { connected: false, status: 'tiktok_credentials_not_configured' };
    }

    try {
      const response = await fetch(ADVERTISER_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          secret: appSecret,
          auth_code: code,
          redirect_uri: this.resolveRedirectUri(redirectUri),
        }),
        signal: AbortSignal.timeout(30000),
      });

      const tokenData = (await response.json()) as TikTokTokenResponse;
      const inner = tokenData.data || tokenData;
      const accessToken = inner.access_token;
      const refreshToken = inner.refresh_token || null;
      const advertiserIds = Array.isArray(inner.advertiser_ids) ? inner.advertiser_ids : [];

      if (!accessToken) {
        const providerMsg = tokenData.message || tokenData.error;
        const result: OAuthConnectResult = {
          connected: false,
          status: 'token_exchange_failed',
        };
        if (providerMsg) {
          result.providerMessage = providerMsg;
        }
        return result;
      }

      this.logger.log(
        `TikTok Ads OAuth token obtained: ${maskToken(accessToken)} workspace=${workspaceId}`,
      );

      const encryptedAccessToken = encryptTikTokToken(accessToken);
      const encryptedRefreshToken = refreshToken ? encryptTikTokToken(refreshToken) : null;
      const expiresIn = Number(inner.expires_in || 0);
      const expiresAt =
        expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      });
      const current = asProviderSettings(workspace?.providerSettings);
      const nextSettings = {
        ...current,
        tiktok: {
          connected: true,
          status: 'connected',
          kind: 'advertiser',
          accessToken: encryptedAccessToken || accessToken,
          refreshToken: encryptedRefreshToken,
          advertiserIds,
          expiresAt,
          connectedAt: new Date().toISOString(),
        },
      };

      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          providerSettings: JSON.parse(JSON.stringify(nextSettings)) as Prisma.InputJsonObject,
        },
      });

      this.logger.log(
        `TikTok Ads OAuth complete for workspace ${workspaceId} advertisers=${advertiserIds.length}`,
      );

      return { connected: true, status: 'connected' };
    } catch (err) {
      this.logger.error('TikTok Ads OAuth completion failed', err);
      return { connected: false, status: 'oauth_error', providerMessage: String(err) };
    }
  }

  // ── Status ─────────────────────────────────────────────────────────

  async getStatus(workspaceId: string): Promise<OAuthStatusResult> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const tiktok = readTikTokSubsettings(workspace?.providerSettings);

    return {
      connected: Boolean(tiktok.connected),
      status: tiktok.connected ? 'connected' : 'disconnected',
      accountId: tiktok.advertiserIds?.[0],
    };
  }

  // ── Disconnect ─────────────────────────────────────────────────────

  async disconnect(workspaceId: string): Promise<DisconnectResult> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const tiktok = readTikTokSubsettings(workspace?.providerSettings);

    if (!tiktok.connected) {
      return { status: 'already_disconnected' };
    }

    const resolvedToken = decryptTikTokToken(tiktok.accessToken) || tiktok.accessToken;

    if (resolvedToken && resolvedToken !== tiktok.accessToken) {
      const appId = resolveEnv('TIKTOK_CLIENT_KEY') || resolveEnv('NEXT_PUBLIC_TIKTOK_CLIENT_KEY');
      const appSecret = resolveEnv('TIKTOK_CLIENT_SECRET');

      if (appId && appSecret) {
        try {
          await fetch(REVOKE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              app_id: appId,
              secret: appSecret,
              token: resolvedToken,
            }),
            signal: AbortSignal.timeout(15000),
          });
          this.logger.log(`TikTok token revoked for workspace ${workspaceId}`);
        } catch {
          this.logger.warn(
            `Failed to revoke TikTok token for workspace ${workspaceId} (non-blocking)`,
          );
        }
      }
    }

    const current = asProviderSettings(workspace?.providerSettings);
    const nextSettings = {
      ...current,
      tiktok: {} as Record<string, never>,
    };

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: JSON.parse(JSON.stringify(nextSettings)) as Prisma.InputJsonObject,
      },
    });

    this.logger.log(`TikTok Ads disconnected for workspace ${workspaceId}`);

    return { status: 'disconnected' };
  }

  // ── Token Refresh ──────────────────────────────────────────────────

  async refreshToken(workspaceId: string): Promise<RefreshTokenResult | null> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const tiktok = readTikTokSubsettings(workspace?.providerSettings);

    if (!tiktok.connected || !tiktok.refreshToken) {
      return null;
    }

    const appId = resolveEnv('TIKTOK_CLIENT_KEY') || resolveEnv('NEXT_PUBLIC_TIKTOK_CLIENT_KEY');
    const appSecret = resolveEnv('TIKTOK_CLIENT_SECRET');

    if (!appId || !appSecret) {
      this.logger.warn(
        `TikTok token refresh skipped — credentials not configured for workspace ${workspaceId}`,
      );
      return null;
    }

    const resolvedRefreshToken = decryptTikTokToken(tiktok.refreshToken) || tiktok.refreshToken;

    try {
      const response = await fetch(ADVERTISER_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          secret: appSecret,
          grant_type: 'refresh_token',
          refresh_token: resolvedRefreshToken,
        }),
        signal: AbortSignal.timeout(30000),
      });

      const tokenData = (await response.json()) as TikTokTokenResponse;
      const inner = tokenData.data || tokenData;
      const newAccessToken = inner.access_token;
      const newRefreshToken = inner.refresh_token || null;
      const expiresIn = Number(inner.expires_in || 0);

      if (!newAccessToken) {
        this.logger.error(
          `TikTok token refresh failed for workspace ${workspaceId}: ${tokenData.message || tokenData.error || 'no access token returned'}`,
        );
        return null;
      }

      const encryptedAccessToken = encryptTikTokToken(newAccessToken);
      const encryptedRefreshToken = newRefreshToken
        ? encryptTikTokToken(newRefreshToken)
        : tiktok.refreshToken;
      const expiresAt =
        expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

      const current = asProviderSettings(workspace?.providerSettings);
      const nextSettings = {
        ...current,
        tiktok: {
          ...tiktok,
          accessToken: encryptedAccessToken || newAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt,
        },
      };

      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          providerSettings: JSON.parse(JSON.stringify(nextSettings)) as Prisma.InputJsonObject,
        },
      });

      this.logger.log(
        `TikTok token refreshed for workspace ${workspaceId} expiresIn=${expiresIn || 'unknown'}`,
      );

      const result: RefreshTokenResult = { accessToken: newAccessToken };
      if (expiresIn) {
        result.expiresIn = expiresIn;
      }
      return result;
    } catch (err) {
      this.logger.error(`TikTok token refresh failed for workspace ${workspaceId}`, err);
      return null;
    }
  }

  // ── Sync Accounts ──────────────────────────────────────────────────

  async syncAccounts(workspaceId: string): Promise<SyncAccountsResult> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const tiktok = readTikTokSubsettings(workspace?.providerSettings);

    if (!tiktok.connected || !tiktok.advertiserIds?.length) {
      return { accounts: [] };
    }

    const accounts = tiktok.advertiserIds.map((id) => ({
      platform: PLATFORM,
      accountId: id,
      accountName: `TikTok Ads Account ${id}`,
    }));

    return { accounts };
  }

  // ── Sync Campaigns ─────────────────────────────────────────────────

  async syncCampaigns(workspaceId: string): Promise<SyncCampaignsResult> {
    let auth: { accessToken: string; advertiserIds: string[] };

    try {
      auth = await this.resolveAccessToken(workspaceId);
    } catch (err) {
      this.logger.error('TikTok syncCampaigns — authentication failed', err);
      return { campaigns: [] };
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
            platform: PLATFORM,
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
      }
    }

    this.logger.log(
      `TikTok syncCampaigns done — ${campaigns.length} campaigns across ${auth.advertiserIds.length} advertisers`,
    );
    return { campaigns };
  }

  // ── Sync Insights ──────────────────────────────────────────────────

  async syncInsights(workspaceId: string, since: Date, until: Date): Promise<SyncInsightsResult> {
    let auth: { accessToken: string; advertiserIds: string[] };

    try {
      auth = await this.resolveAccessToken(workspaceId);
    } catch (err) {
      this.logger.error('TikTok syncInsights — authentication failed', err);
      return { insights: [] };
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
            platform: PLATFORM,
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
      }
    }

    this.logger.log(
      `TikTok syncInsights done — ${insights.length} report rows across ${auth.advertiserIds.length} advertisers`,
    );
    return { insights };
  }
}
