import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { GoogleAdsApi, enums } from 'google-ads-api';
import { PrismaService } from '../prisma/prisma.service';
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
import { encryptGoogleAdsToken, decryptGoogleAdsToken } from './google-ads-token-crypto';
import { NotConfiguredException } from './exceptions/not-configured.exception';

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  [key: string]: unknown;
}

const PLATFORM = 'google';
const GOOGLE_ADS_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_ADS_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ADS_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';
const CURRENT_KEY_VERSION = 1;

function resolveEnv(name: string): string {
  return String(process.env[name] || '').trim();
}

function maskToken(token: string): string {
  if (!token || token.length < 8) return '****';
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(64).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
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

    return { clientId, clientSecret, developerToken };
  }

  private async getCredential(workspaceId: string) {
    const cred = await this.prisma.integrationCredential.findUnique({
      where: { workspaceId },
    });

    if (!cred || !cred.refreshToken || cred.status !== 'connected') {
      throw new NotConfiguredException(
        'Google Ads workspace not connected — OAuth tokens missing',
        PLATFORM,
        ['refreshToken'],
      );
    }

    const accessToken = decryptGoogleAdsToken(cred.accessToken) || cred.accessToken;
    const refreshToken = decryptGoogleAdsToken(cred.refreshToken) || cred.refreshToken;

    return {
      credential: cred,
      refreshToken,
      accessToken,
    };
  }

  async connect(workspaceId: string, redirectUri: string): Promise<OAuthConnectResult> {
    const clientId = resolveEnv('GOOGLE_ADS_CLIENT_ID');
    if (!clientId) {
      return { connected: false, status: 'google_ads_client_id_not_configured' };
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    await this.prisma.integrationCredential.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        platform: PLATFORM,
        accessToken: encryptGoogleAdsToken(codeVerifier) || codeVerifier,
        keyVersion: CURRENT_KEY_VERSION,
        status: 'pending_oauth',
      },
      update: {
        accessToken: encryptGoogleAdsToken(codeVerifier) || codeVerifier,
        keyVersion: CURRENT_KEY_VERSION,
        status: 'pending_oauth',
        updatedAt: new Date(),
      },
    });

    const url = new URL(GOOGLE_ADS_AUTH_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', ADS_SCOPE);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', workspaceId);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

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

    const pending = await this.prisma.integrationCredential.findUnique({
      where: { workspaceId },
      select: { accessToken: true },
    });

    const codeVerifier =
      decryptGoogleAdsToken(pending?.accessToken || '') || pending?.accessToken || '';

    try {
      const body = new URLSearchParams();
      body.set('client_id', clientId);
      body.set('client_secret', clientSecret);
      body.set('code', code);
      body.set('grant_type', 'authorization_code');
      body.set('redirect_uri', redirectUri);
      body.set('code_verifier', codeVerifier);

      const res = await fetch(GOOGLE_ADS_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        this.logger.error(
          `Google Ads OAuth token exchange failed: status=${res.status} workspace=${workspaceId}`,
        );
        return { connected: false, status: 'token_exchange_failed' };
      }

      const tokenData = (await res.json()) as GoogleTokenResponse;
      const accessToken = tokenData.access_token;
      const refreshTokenInResponse = tokenData.refresh_token;
      const expiresIn = tokenData.expires_in;

      if (!accessToken) {
        return { connected: false, status: 'token_exchange_failed' };
      }

      this.logger.log(
        `Google Ads OAuth token obtained: access=${maskToken(accessToken)} refresh=${maskToken(refreshTokenInResponse || 'none')} workspace=${workspaceId}`,
      );

      const encryptedAccess = encryptGoogleAdsToken(accessToken) || accessToken;
      const encryptedRefresh =
        encryptGoogleAdsToken(refreshTokenInResponse) || refreshTokenInResponse;

      let loginCustomerId: string | null = null;
      const developerToken = resolveEnv('GOOGLE_ADS_DEVELOPER_TOKEN');
      const effectiveRefresh = refreshTokenInResponse || refreshTokenInResponse;

      if (effectiveRefresh && developerToken) {
        try {
          const tempClient = new GoogleAdsApi({
            client_id: clientId,
            client_secret: clientSecret,
            developer_token: developerToken,
          });
          const accessible = await tempClient.listAccessibleCustomers(effectiveRefresh);
          const resourceNames = (accessible as { resource_names?: string[] }).resource_names || [];
          const ids = resourceNames.map((rn) => rn.replace('customers/', ''));
          if (ids.length > 0) {
            loginCustomerId = ids[0] ?? null;
          }
        } catch {
          this.logger.warn(
            'Could not resolve login customer id during OAuth — will discover on first sync',
          );
        }
      }

      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000)
        : new Date(Date.now() + 60 * 60 * 1000);

      await this.prisma.integrationCredential.upsert({
        where: { workspaceId },
        create: {
          workspaceId,
          platform: PLATFORM,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh || null,
          expiresAt,
          keyVersion: CURRENT_KEY_VERSION,
          loginCustomerId,
          status: 'connected',
        },
        update: {
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh || null,
          expiresAt,
          keyVersion: CURRENT_KEY_VERSION,
          loginCustomerId,
          status: 'connected',
          updatedAt: new Date(),
        },
      });

      return { connected: true, status: 'connected' };
    } catch (err) {
      this.logger.error('Google Ads OAuth completion failed', err);
      return { connected: false, status: 'oauth_error', providerMessage: String(err) };
    }
  }

  async getStatus(workspaceId: string): Promise<OAuthStatusResult> {
    const cred = await this.prisma.integrationCredential.findUnique({
      where: { workspaceId },
      select: { status: true, loginCustomerId: true },
    });

    const connected = cred?.status === 'connected';
    const loginCustomerId = cred?.loginCustomerId;

    const result: OAuthStatusResult = {
      connected,
      status: cred?.status || 'disconnected',
    };

    if (loginCustomerId) {
      result.accountId = loginCustomerId;
    }

    return result;
  }

  async disconnect(workspaceId: string): Promise<DisconnectResult> {
    const cred = await this.prisma.integrationCredential.findUnique({
      where: { workspaceId },
      select: { accessToken: true },
    });

    if (!cred) {
      return { status: 'already_disconnected' };
    }

    const resolvedToken = decryptGoogleAdsToken(cred.accessToken) || cred.accessToken;
    if (resolvedToken && resolvedToken !== cred.accessToken) {
      try {
        await fetch(GOOGLE_ADS_REVOKE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: resolvedToken }),
          signal: AbortSignal.timeout(15000),
        });
        this.logger.log(`Google Ads token revoked for workspace ${workspaceId}`);
      } catch {
        this.logger.warn(
          `Failed to revoke Google Ads token for workspace ${workspaceId} (non-blocking)`,
        );
      }
    }

    await this.prisma.integrationCredential.delete({
      where: { workspaceId },
    });

    this.logger.log(`Google Ads disconnected for workspace ${workspaceId}`);
    return { status: 'disconnected' };
  }

  async refreshToken(workspaceId: string): Promise<RefreshTokenResult | null> {
    try {
      const cred = await this.prisma.integrationCredential.findUnique({
        where: { workspaceId },
        select: { refreshToken: true },
      });

      if (!cred?.refreshToken) {
        return null;
      }

      const refreshToken = decryptGoogleAdsToken(cred.refreshToken) || cred.refreshToken;

      const clientId = resolveEnv('GOOGLE_ADS_CLIENT_ID');
      const clientSecret = resolveEnv('GOOGLE_ADS_CLIENT_SECRET');

      if (!clientId || !clientSecret) {
        this.logger.warn(
          `Google Ads token refresh skipped — credentials not configured workspace=${workspaceId}`,
        );
        return null;
      }

      const body = new URLSearchParams();
      body.set('client_id', clientId);
      body.set('client_secret', clientSecret);
      body.set('refresh_token', refreshToken);
      body.set('grant_type', 'refresh_token');

      const res = await fetch(GOOGLE_ADS_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        this.logger.error(
          `Google Ads token refresh failed: status=${res.status} workspace=${workspaceId}`,
        );
        return null;
      }

      const tokenData = (await res.json()) as GoogleTokenResponse;
      const newAccessToken = tokenData.access_token;
      const expiresIn = tokenData.expires_in;

      if (!newAccessToken) {
        return null;
      }

      const encryptedAccess = encryptGoogleAdsToken(newAccessToken) || newAccessToken;
      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000)
        : new Date(Date.now() + 60 * 60 * 1000);

      await this.prisma.integrationCredential.update({
        where: { workspaceId },
        data: {
          accessToken: encryptedAccess,
          expiresAt,
          keyVersion: CURRENT_KEY_VERSION,
          updatedAt: new Date(),
        },
      });

      this.logger.log(
        `Google Ads token refreshed for workspace ${workspaceId} expiresIn=${expiresIn ?? '1h'}`,
      );

      const result: RefreshTokenResult = { accessToken: newAccessToken };
      if (expiresIn !== undefined) {
        result.expiresIn = expiresIn;
      }
      return result;
    } catch (err) {
      this.logger.error(`Google Ads token refresh failed for workspace ${workspaceId}`, err);
      return null;
    }
  }

  async syncAccounts(workspaceId: string): Promise<SyncAccountsResult> {
    const { refreshToken, credential } = await this.getCredential(workspaceId);
    const { clientId, clientSecret, developerToken } = this.buildClientParams();

    const client = new GoogleAdsApi({
      client_id: clientId,
      client_secret: clientSecret,
      developer_token: developerToken,
    });

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
        const customer = client.Customer({
          customer_id: customerId,
          refresh_token: refreshToken,
          ...(loginCustomerId ? { login_customer_id: loginCustomerId } : {}),
        });
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

    if (loginCustomerId && loginCustomerId !== credential.loginCustomerId) {
      await this.prisma.integrationCredential.update({
        where: { workspaceId },
        data: { loginCustomerId, updatedAt: new Date() },
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

    const { refreshToken, credential } = await this.getCredential(workspaceId);
    const { clientId, clientSecret, developerToken } = this.buildClientParams();

    const client = new GoogleAdsApi({
      client_id: clientId,
      client_secret: clientSecret,
      developer_token: developerToken,
    });

    const loginCustomerId: string | null | undefined =
      credential.loginCustomerId || (dbAccounts.length > 1 ? dbAccounts[0]?.accountId : null);

    const campaigns: SyncCampaignsResult['campaigns'] = [];

    for (const account of dbAccounts) {
      try {
        const customer = client.Customer({
          customer_id: account.accountId,
          refresh_token: refreshToken,
          ...(loginCustomerId ? { login_customer_id: loginCustomerId } : {}),
        });
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

    const { refreshToken, credential } = await this.getCredential(workspaceId);
    const { clientId, clientSecret, developerToken } = this.buildClientParams();

    const client = new GoogleAdsApi({
      client_id: clientId,
      client_secret: clientSecret,
      developer_token: developerToken,
    });

    const loginCustomerId: string | null | undefined =
      credential.loginCustomerId || (dbAccounts.length > 1 ? dbAccounts[0]?.accountId : null);

    const fromDate = since.toISOString().slice(0, 10);
    const toDate = until.toISOString().slice(0, 10);
    const insights: SyncInsightsResult['insights'] = [];

    for (const account of dbAccounts) {
      try {
        const customer = client.Customer({
          customer_id: account.accountId,
          refresh_token: refreshToken,
          ...(loginCustomerId ? { login_customer_id: loginCustomerId } : {}),
        });
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
