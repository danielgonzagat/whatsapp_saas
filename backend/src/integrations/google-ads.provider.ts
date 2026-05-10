import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GoogleAdsApi, enums } from 'google-ads-api';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AdProvider,
  OAuthConnectResult,
  OAuthStatusResult,
  SyncAccountsResult,
  SyncCampaignsResult,
  SyncInsightsResult,
} from './ad-provider.interface';
import { asProviderSettings } from '../whatsapp/provider-settings.types';
import { NotConfiguredException } from './exceptions/not-configured.exception';

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  [key: string]: unknown;
}

interface GoogleSubsettings {
  connected?: boolean;
  status?: string;
  accessToken?: string;
  refreshToken?: string | null;
  loginCustomerId?: string | null;
  connectedAt?: string;
  [key: string]: unknown;
}

const PLATFORM = 'google';
const GOOGLE_ADS_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_ADS_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';

function resolveEnv(name: string): string {
  return String(process.env[name] || '').trim();
}

function readGoogleSubsettings(workspaceProviderSettings: unknown): GoogleSubsettings {
  const settings = asProviderSettings(workspaceProviderSettings);
  return (settings.google || {}) as GoogleSubsettings;
}

@Injectable()
export class GoogleAdsProvider implements AdProvider {
  readonly platform = PLATFORM;
  private readonly logger = new Logger(GoogleAdsProvider.name);

  constructor(private readonly prisma: PrismaService) {}

  private buildClientParams() {
    const clientId = resolveEnv('GOOGLE_ADS_CLIENT_ID');
    const clientSecret = resolveEnv('GOOGLE_ADS_CLIENT_SECRET');
    const developerToken = resolveEnv('GOOGLE_ADS_DEVELOPER_TOKEN');

    const missing: string[] = [];
    if (!clientId) missing.push('GOOGLE_ADS_CLIENT_ID');
    if (!clientSecret) missing.push('GOOGLE_ADS_CLIENT_SECRET');
    if (!developerToken) missing.push('GOOGLE_ADS_DEVELOPER_TOKEN');

    if (missing.length > 0) {
      throw new NotConfiguredException(
        `Google Ads provider not configured: missing ${missing.join(', ')}`,
        PLATFORM,
        missing,
      );
    }

    return new GoogleAdsApi({
      client_id: clientId,
      client_secret: clientSecret,
      developer_token: developerToken,
    });
  }

  private async getTokens(
    workspaceId: string,
  ): Promise<{ refreshToken: string; accessToken: string }> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const google = readGoogleSubsettings(workspace?.providerSettings);

    if (!google.connected || !google.refreshToken) {
      throw new NotConfiguredException(
        'Google Ads workspace not connected — OAuth tokens missing',
        PLATFORM,
        ['refreshToken'],
      );
    }

    return {
      refreshToken: google.refreshToken,
      accessToken: google.accessToken || '',
    };
  }

  private async buildCustomer(
    client: GoogleAdsApi,
    workspaceId: string,
    customerId: string,
    loginCustomerId?: string | null,
  ) {
    const { refreshToken } = await this.getTokens(workspaceId);
    return client.Customer({
      customer_id: customerId,
      refresh_token: refreshToken,
      ...(loginCustomerId ? { login_customer_id: loginCustomerId } : {}),
    });
  }

  async connect(_workspaceId: string, redirectUri: string): Promise<OAuthConnectResult> {
    const clientId = resolveEnv('GOOGLE_ADS_CLIENT_ID');
    if (!clientId) {
      return { connected: false, status: 'google_ads_client_id_not_configured' };
    }
    const url = new URL(GOOGLE_ADS_AUTH_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', ADS_SCOPE);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', _workspaceId);
    return { connected: false, status: 'pending_oauth', authUrl: url.toString() };
  }

  async completeOAuth(
    workspaceId: string,
    code: string,
    redirectUri: string,
  ): Promise<OAuthConnectResult> {
    const clientId = resolveEnv('GOOGLE_ADS_CLIENT_ID');
    const clientSecret = resolveEnv('GOOGLE_ADS_CLIENT_SECRET');
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
      const tokenData = (await res.json()) as GoogleTokenResponse;
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;
      if (!accessToken) {
        return { connected: false, status: 'token_exchange_failed' };
      }

      let loginCustomerId: string | null = null;
      try {
        const developerToken = resolveEnv('GOOGLE_ADS_DEVELOPER_TOKEN');
        if (refreshToken && developerToken) {
          const client = new GoogleAdsApi({
            client_id: clientId,
            client_secret: clientSecret,
            developer_token: developerToken,
          });
          const accessible = await client.listAccessibleCustomers(refreshToken);
          const resourceNames = (accessible as { resource_names?: string[] }).resource_names || [];
          const ids = resourceNames.map((rn) => rn.replace('customers/', ''));
          if (ids.length > 0) {
            loginCustomerId = ids[0] ?? null;
          }
        }
      } catch {
        this.logger.warn(
          'Could not resolve login customer id during OAuth — will discover on first sync',
        );
      }

      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      });
      const current = asProviderSettings(workspace?.providerSettings);
      const nextSettings = {
        ...current,
        google: {
          connected: true,
          status: 'connected',
          accessToken,
          refreshToken: refreshToken || null,
          loginCustomerId,
          connectedAt: new Date().toISOString(),
        },
      };
      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          providerSettings: JSON.parse(JSON.stringify(nextSettings)) as Prisma.InputJsonObject,
        },
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
    const google = readGoogleSubsettings(workspace?.providerSettings);
    return {
      connected: Boolean(google.connected),
      status: google.connected ? 'connected' : 'disconnected',
    };
  }

  async syncAccounts(workspaceId: string): Promise<SyncAccountsResult> {
    const { refreshToken } = await this.getTokens(workspaceId);
    const client = this.buildClientParams();

    const accessible = await client.listAccessibleCustomers(refreshToken);
    const resourceNames = (accessible as { resource_names?: string[] }).resource_names || [];
    const customerIds = resourceNames.map((rn) => rn.replace('customers/', ''));
    if (customerIds.length === 0) {
      return { accounts: [] };
    }

    const accounts: SyncAccountsResult['accounts'] = [];
    const loginCustomerId = customerIds.length > 1 ? customerIds[0] : null;

    for (const customerId of customerIds) {
      try {
        const customer = await this.buildCustomer(client, workspaceId, customerId, loginCustomerId);
        const rows = await customer.query(
          `SELECT customer_client.descriptive_name FROM customer_client WHERE customer_client.id = '${customerId}'`,
        );
        const data = Array.isArray(rows) ? rows[0] : undefined;
        const cdata = (data as Record<string, unknown> | undefined)?.customer_client as
          | { descriptive_name?: string }
          | undefined;
        accounts.push({
          platform: PLATFORM,
          accountId: customerId,
          accountName: cdata?.descriptive_name || `Google Ads Account ${customerId}`,
        });
      } catch (err) {
        this.logger.error(`Failed to fetch account details for ${customerId}`, err);
        accounts.push({
          platform: PLATFORM,
          accountId: customerId,
          accountName: `Google Ads Account ${customerId}`,
        });
      }
    }

    if (loginCustomerId) {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      });
      const current = asProviderSettings(workspace?.providerSettings);
      const google = (current.google || {}) as Record<string, unknown>;
      const updatedSettings = {
        ...current,
        google: { ...google, loginCustomerId },
      };
      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          providerSettings: JSON.parse(JSON.stringify(updatedSettings)) as Prisma.InputJsonObject,
        },
      });
    }

    return { accounts };
  }

  async syncCampaigns(workspaceId: string): Promise<SyncCampaignsResult> {
    const dbAccounts = await this.prisma.adAccount.findMany({
      where: { workspaceId, platform: PLATFORM },
      select: { accountId: true },
    });
    if (dbAccounts.length === 0) {
      return { campaigns: [] };
    }

    const client = this.buildClientParams();

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const google = readGoogleSubsettings(workspace?.providerSettings);
    const loginCustomerId: string | null | undefined =
      google.loginCustomerId || (dbAccounts.length > 1 ? dbAccounts[0]?.accountId : null);

    const campaigns: SyncCampaignsResult['campaigns'] = [];

    for (const account of dbAccounts) {
      try {
        const customer = await this.buildCustomer(
          client,
          workspaceId,
          account.accountId,
          loginCustomerId,
        );
        const rows = await customer.report({
          entity: 'campaign',
          attributes: ['campaign.id', 'campaign.name', 'campaign.status'],
          metrics: [
            'metrics.cost_micros',
            'metrics.impressions',
            'metrics.clicks',
            'metrics.conversions',
            'metrics.ctr',
            'metrics.average_cpc',
            'metrics.conversions_value',
          ],
          constraints: {
            'campaign.status': enums.CampaignStatus.ENABLED,
          },
          date_constant: 'LAST_30_DAYS',
        });

        const data = (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[];
        for (const row of data) {
          const c = (row.campaign as Record<string, unknown>) || {};
          const m = (row.metrics as Record<string, unknown>) || {};
          const costMicros = Number(m.cost_micros || 0);
          const spend = costMicros / 1_000_000;
          const conversionsValue = Number(m.conversions_value || 0);
          const revenue = conversionsValue;
          const roas = spend > 0 ? revenue / spend : 0;
          const impressions = Number(m.impressions || 0);
          const clicks = Number(m.clicks || 0);
          const ctr = Number(m.ctr || 0);
          const averageCpc = Number(m.average_cpc || 0);
          const cpc = averageCpc / 1_000_000;
          const conversions = Number(m.conversions || 0);

          campaigns.push({
            platform: PLATFORM,
            accountId: account.accountId,
            campaignId: String(c.id || ''),
            campaignName: String(c.name || ''),
            status: String(c.status || 'UNKNOWN'),
            spend,
            revenue,
            roas,
            conversions,
            impressions,
            clicks,
            ctr,
            cpc,
          });
        }
      } catch (err) {
        this.logger.error(`Failed to sync campaigns for account ${account.accountId}`, err);
      }
    }

    return { campaigns };
  }

  async syncInsights(workspaceId: string, since: Date, until: Date): Promise<SyncInsightsResult> {
    const dbAccounts = await this.prisma.adAccount.findMany({
      where: { workspaceId, platform: PLATFORM },
      select: { accountId: true },
    });
    if (dbAccounts.length === 0) {
      return { insights: [] };
    }

    const client = this.buildClientParams();

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const google = readGoogleSubsettings(workspace?.providerSettings);
    const loginCustomerId: string | null | undefined =
      google.loginCustomerId || (dbAccounts.length > 1 ? dbAccounts[0]?.accountId : null);

    const fromDate = since.toISOString().slice(0, 10);
    const toDate = until.toISOString().slice(0, 10);
    const insights: SyncInsightsResult['insights'] = [];

    for (const account of dbAccounts) {
      try {
        const customer = await this.buildCustomer(
          client,
          workspaceId,
          account.accountId,
          loginCustomerId,
        );
        const rows = await customer.report({
          entity: 'campaign',
          attributes: ['campaign.id', 'campaign.name'],
          metrics: [
            'metrics.cost_micros',
            'metrics.impressions',
            'metrics.clicks',
            'metrics.conversions',
            'metrics.ctr',
            'metrics.average_cpc',
            'metrics.conversions_value',
          ],
          segments: ['segments.date'],
          from_date: fromDate,
          to_date: toDate,
        });

        const data = (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[];
        const dateBuckets = new Map<
          string,
          {
            spend: number;
            revenue: number;
            conversions: number;
            impressions: number;
            clicks: number;
          }
        >();

        for (const row of data) {
          const m = (row.metrics as Record<string, unknown>) || {};
          const seg = (row.segments as Record<string, unknown>) || {};
          const dateKey = String(seg.date || '');
          if (!dateKey) continue;

          const costMicros = Number(m.cost_micros || 0);
          const spend = costMicros / 1_000_000;
          const conversionsValue = Number(m.conversions_value || 0);
          const bucket = dateBuckets.get(dateKey) || {
            spend: 0,
            revenue: 0,
            conversions: 0,
            impressions: 0,
            clicks: 0,
          };
          bucket.spend += spend;
          bucket.revenue += conversionsValue;
          bucket.conversions += Number(m.conversions || 0);
          bucket.impressions += Number(m.impressions || 0);
          bucket.clicks += Number(m.clicks || 0);
          dateBuckets.set(dateKey, bucket);
        }

        for (const [dateKey, bucket] of dateBuckets) {
          const date = new Date(dateKey);
          const roas = bucket.spend > 0 ? bucket.revenue / bucket.spend : 0;
          const ctr = bucket.impressions > 0 ? bucket.clicks / bucket.impressions : 0;
          const cpc = bucket.clicks > 0 ? bucket.spend / bucket.clicks : 0;

          insights.push({
            platform: PLATFORM,
            accountId: account.accountId,
            date,
            spend: bucket.spend,
            revenue: bucket.revenue,
            roas,
            conversions: bucket.conversions,
            impressions: bucket.impressions,
            clicks: bucket.clicks,
            ctr,
            cpc,
          });
        }
      } catch (err) {
        this.logger.error(`Failed to sync insights for account ${account.accountId}`, err);
      }
    }

    return { insights };
  }
}
