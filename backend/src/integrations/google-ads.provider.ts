import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AdProvider,
  OAuthConnectResult,
  OAuthStatusResult,
  SyncAccountsResult,
  SyncCampaignsResult,
  SyncInsightsResult,
} from './ad-provider.interface';

const GOOGLE_ADS_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_ADS_TOKEN_URL = 'https://oauth2.googleapis.com/token';

@Injectable()
export class GoogleAdsProvider implements AdProvider {
  readonly platform = 'google';
  private readonly logger = new Logger(GoogleAdsProvider.name);

  constructor(private readonly prisma: PrismaService) {}

  async connect(_workspaceId: string, redirectUri: string): Promise<OAuthConnectResult> {
    const clientId = String(process.env.GOOGLE_ADS_CLIENT_ID || '').trim();
    if (!clientId) {
      return { connected: false, status: 'google_ads_client_id_not_configured' };
    }
    const url = new URL(GOOGLE_ADS_AUTH_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'https://www.googleapis.com/auth/adwords');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', _workspaceId);
    return { connected: false, status: 'pending_oauth', authUrl: url.toString() };
  }

  async completeOAuth(workspaceId: string, code: string, redirectUri: string): Promise<OAuthConnectResult> {
    const clientId = String(process.env.GOOGLE_ADS_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.GOOGLE_ADS_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) {
      return { connected: false, status: 'google_ads_credentials_not_configured' };
    }
    try {
      const body = new URLSearchParams();
      body.set('client_id', clientId);
      body.set('client_secret', clientSecret);
      body.set('code', code);
      body.set('grant_type', 'authorization_code');
      body.set('redirect_uri', redirectUri);

      const res = await fetch(GOOGLE_ADS_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        return { connected: false, status: 'token_exchange_failed' };
      }
      const tokenData = (await res.json()) as Record<string, unknown>;
      const accessToken = tokenData.access_token as string | undefined;
      const refreshToken = tokenData.refresh_token as string | undefined;
      if (!accessToken) {
        return { connected: false, status: 'token_exchange_failed' };
      }

      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      });
      const current = (workspace?.providerSettings as Record<string, unknown>) || {};
      const nextSettings = {
        ...current,
        google: {
          connected: true,
          status: 'connected',
          accessToken,
          refreshToken: refreshToken || null,
          connectedAt: new Date().toISOString(),
        },
      };
      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: { providerSettings: nextSettings },
      });

      return { connected: true, status: 'connected' };
    } catch (err) {
      this.logger.error('Google Ads OAuth completion failed', err);
      return { connected: false, status: 'oauth_error', providerMessage: String(err) };
    }
  }

  async getStatus(workspaceId: string): Promise<OAuthStatusResult> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const google = (settings.google || {}) as Record<string, unknown>;
    return {
      connected: Boolean(google.connected),
      status: google.connected ? 'connected' : 'disconnected',
    };
  }

  async syncAccounts(_workspaceId: string): Promise<SyncAccountsResult> {
    this.logger.warn('Google Ads syncAccounts scaffold — requires google-ads-api client library');
    return { accounts: [] };
  }

  async syncCampaigns(_workspaceId: string): Promise<SyncCampaignsResult> {
    this.logger.warn('Google Ads syncCampaigns scaffold — requires google-ads-api client library');
    return { campaigns: [] };
  }

  async syncInsights(_workspaceId: string, _since: Date, _until: Date): Promise<SyncInsightsResult> {
    this.logger.warn('Google Ads syncInsights scaffold — requires google-ads-api client library');
    return { insights: [] };
  }
}
