import { PrismaService } from '../prisma/prisma.service';
import { decryptTikTokToken } from './tiktok-token-crypto';
import { asProviderSettings } from '../whatsapp/provider-settings.types';
import type {
  AdCampaignSyncResult,
  AdInsightSyncResult,
  OAuthStatusResult,
  SyncAccountsResult,
} from './ad-provider.interface';
import type {
  FetchedTikTokCampaign,
  FetchedTikTokReportRow,
} from '../marketing/tiktok-ads.service';

export interface TikTokProviderSubsettings {
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

export interface TikTokTokenResponse {
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

export const TIKTOK_ADS_PLATFORM = 'tiktok';
export const TIKTOK_ADVERTISER_AUTH_URL = 'https://business-api.tiktok.com/portal/auth';
export const TIKTOK_ADVERTISER_TOKEN_URL =
  'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/';
export const TIKTOK_REVOKE_URL = 'https://business-api.tiktok.com/open_api/v1.3/oauth2/revoke/';

export function maskTikTokToken(token: string): string {
  if (!token || token.length < 8) {
    return '****';
  }
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

export function resolveTikTokEnv(name: string): string {
  return String(process.env[name] || '').trim();
}

export function readTikTokSubsettings(
  workspaceProviderSettings: unknown,
): TikTokProviderSubsettings {
  const settings = asProviderSettings(workspaceProviderSettings);
  return (settings.tiktok || {}) as TikTokProviderSubsettings;
}

export function resolveTikTokRedirectUri(explicit?: string): string {
  if (explicit) {
    return explicit;
  }
  const frontendUrl = resolveTikTokEnv('FRONTEND_URL') || 'https://app.kloel.com';
  return `${frontendUrl.replace(/\/+$/, '')}/integrations/tiktok/callback`;
}

export async function resolveTikTokAccessToken(
  prisma: PrismaService,
  workspaceId: string,
): Promise<{ accessToken: string; advertiserIds: string[] }> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { providerSettings: true },
  });
  const tiktok = readTikTokSubsettings(workspace?.providerSettings);

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

export async function readTikTokStatus(
  prisma: PrismaService,
  workspaceId: string,
): Promise<OAuthStatusResult> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { providerSettings: true },
  });
  const tiktok = readTikTokSubsettings(workspace?.providerSettings);
  const result: OAuthStatusResult = {
    connected: Boolean(tiktok.connected),
    status: tiktok.connected ? 'connected' : 'disconnected',
  };
  if (tiktok.advertiserIds?.[0]) {
    result.accountId = tiktok.advertiserIds[0];
  }
  return result;
}

export async function syncTikTokAccountsFromSettings(
  prisma: PrismaService,
  workspaceId: string,
): Promise<SyncAccountsResult> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { providerSettings: true },
  });
  const tiktok = readTikTokSubsettings(workspace?.providerSettings);
  if (!tiktok.connected || !tiktok.advertiserIds?.length) {
    return { accounts: [] };
  }
  return {
    accounts: tiktok.advertiserIds.map((id) => ({
      platform: TIKTOK_ADS_PLATFORM,
      accountId: id,
      accountName: `TikTok Ads Account ${id}`,
    })),
  };
}

export function mapTikTokCampaign(campaign: FetchedTikTokCampaign): AdCampaignSyncResult {
  return {
    platform: TIKTOK_ADS_PLATFORM,
    accountId: campaign.advertiserId,
    campaignId: campaign.campaignId,
    campaignName: campaign.campaignName,
    status: campaign.status,
    spend: 0,
    revenue: 0,
    roas: 0,
    conversions: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
  };
}

export function mapTikTokInsight(row: FetchedTikTokReportRow): AdInsightSyncResult {
  return {
    platform: TIKTOK_ADS_PLATFORM,
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
  };
}
