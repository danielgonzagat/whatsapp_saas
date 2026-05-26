import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { decryptMetaToken, encryptMetaToken } from '../meta/meta-token-crypto';
import { PrismaService } from '../prisma/prisma.service';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ADS_BASE_URL = 'https://googleads.googleapis.com';
const STATE_TTL_MS = 10 * 60 * 1000;

type GoogleAdsTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type SignedStatePayload = {
  workspaceId: string;
  ts: number;
};

function readOptionalEnv(keys: string[]): string {
  return keys.map((key) => String(process.env[key] || '').trim()).find(Boolean) || '';
}

function readRequiredEnv(keys: string[], label: string): string {
  const value = readOptionalEnv(keys);
  if (!value) {
    throw new Error(`${label}_not_configured`);
  }
  return value;
}

function signPayload(payload: SignedStatePayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyState(rawState: unknown, secret: string): SignedStatePayload | null {
  const state = typeof rawState === 'string' ? rawState.trim() : '';
  const [encoded, signature] = state.split('.');
  if (!encoded || !signature) {
    return null;
  }

  const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const payload = parsed as { workspaceId?: unknown; ts?: unknown };
    const workspaceId = readString(payload.workspaceId) ?? '';
    const ts =
      typeof payload.ts === 'number' || typeof payload.ts === 'string' ? Number(payload.ts) : 0;
    if (!workspaceId || !Number.isFinite(ts) || Date.now() - ts > STATE_TTL_MS) {
      return null;
    }
    return { workspaceId, ts };
  } catch {
    return null;
  }
}

function expiresAtFromSeconds(seconds: unknown) {
  const expiresIn = Number(seconds || 0);
  return expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
}

function normalizeCustomerId(input: unknown): string {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return String(input).replace(/\D/g, '');
  }
  if (typeof input !== 'string') {
    return '';
  }
  return input.replace(/\D/g, '');
}

function readString(input: unknown): string | null {
  const value = typeof input === 'string' ? input.trim() : '';
  return value || null;
}

function readStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input.map((item) => readString(item)).filter((item): item is string => Boolean(item));
}

@Injectable()
export class GoogleAdsMarketingService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(workspaceId: string) {
    const googleAds = await this.readGoogleAdsSettings(workspaceId);
    return {
      connected: Boolean(googleAds.connected),
      status: googleAds.connected ? 'connected' : 'disconnected',
      customerIds: Array.isArray(googleAds.customerIds) ? googleAds.customerIds : [],
      loginCustomerId:
        typeof googleAds.loginCustomerId === 'string' ? googleAds.loginCustomerId : null,
      expiresAt: typeof googleAds.expiresAt === 'string' ? googleAds.expiresAt : null,
      clientConfigured: Boolean(this.tryReadClientId()),
      secretConfigured: Boolean(this.tryReadClientSecret()),
      developerTokenConfigured: Boolean(this.tryReadDeveloperToken()),
      apiVersion: this.readApiVersion(),
    };
  }

  generateAuthUrl(workspaceId: string) {
    const clientId = this.readClientId();
    const state = signPayload({ workspaceId, ts: Date.now() }, this.readStateSecret());
    const redirectUri = this.resolveRedirectUri();
    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('scope', 'https://www.googleapis.com/auth/adwords');
    url.searchParams.set('state', state);
    return { url: url.toString(), redirectUri };
  }

  async completeOAuth(
    workspaceId: string,
    body: { code?: string; state?: string; redirectUri?: string },
  ) {
    const code = String(body.code || '').trim();
    const state = verifyState(body.state, this.readStateSecret());
    if (!code) {
      return { connected: false, status: 'missing_code' };
    }
    if (!state || state.workspaceId !== workspaceId) {
      return { connected: false, status: 'invalid_state' };
    }

    let token: GoogleAdsTokenResponse;
    try {
      token = await this.exchangeCode(code, body.redirectUri);
    } catch (error) {
      return {
        connected: false,
        status: 'token_exchange_failed',
        providerMessage: error instanceof Error ? error.message : 'unknown_error',
      };
    }

    if (!token.access_token) {
      return {
        connected: false,
        status: 'token_exchange_failed',
        providerMessage: token.error_description || token.error || null,
      };
    }

    const currentSettings = await this.readWorkspaceProviderSettings(workspaceId);
    const nextGoogleAds = {
      connected: true,
      status: 'connected',
      accessToken: encryptMetaToken(token.access_token),
      refreshToken: token.refresh_token
        ? encryptMetaToken(token.refresh_token)
        : readString(currentSettings.googleAds?.refreshToken),
      scope: token.scope || 'https://www.googleapis.com/auth/adwords',
      expiresAt: expiresAtFromSeconds(token.expires_in),
      connectedAt: new Date().toISOString(),
      customerIds: readStringArray(currentSettings.googleAds?.customerIds),
      loginCustomerId: readString(currentSettings.googleAds?.loginCustomerId),
    };

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...currentSettings,
          googleAds: nextGoogleAds,
        } satisfies Prisma.InputJsonValue,
      },
    });

    return { connected: true, status: 'connected' };
  }

  async listAccessibleCustomers(workspaceId: string) {
    const accessToken = await this.resolveAccessToken(workspaceId);
    const response = await this.googleAdsFetch('/customers:listAccessibleCustomers', accessToken);
    const payload = (await response.json().catch(() => ({}))) as { resourceNames?: string[] };
    if (!response.ok) {
      return { status: 'provider_error', httpStatus: response.status, customers: [] };
    }

    const customers = (payload.resourceNames || [])
      .map((resourceName) => normalizeCustomerId(resourceName))
      .filter(Boolean);
    const settings = await this.readWorkspaceProviderSettings(workspaceId);
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...settings,
          googleAds: {
            ...(settings.googleAds || {}),
            customerIds: customers,
            lastCustomersSyncAt: new Date().toISOString(),
          },
        } satisfies Prisma.InputJsonValue,
      },
    });
    return { status: 'ok', customers };
  }

  async listCampaigns(workspaceId: string, rawCustomerId: string) {
    const customerId = normalizeCustomerId(rawCustomerId);
    if (!customerId) {
      return { status: 'missing_customer_id', campaigns: [] };
    }

    const accessToken = await this.resolveAccessToken(workspaceId);
    const response = await this.googleAdsFetch(
      `/customers/${customerId}/googleAds:searchStream`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          query: [
            'SELECT',
            'campaign.id, campaign.name, campaign.status,',
            'metrics.impressions, metrics.clicks, metrics.cost_micros',
            'FROM campaign',
            'ORDER BY campaign.id',
            'LIMIT 50',
          ].join(' '),
        }),
      },
    );
    const payload = (await response.json().catch(() => [])) as Array<{
      results?: Array<{
        campaign?: { id?: string; name?: string; status?: string };
        metrics?: { impressions?: string; clicks?: string; costMicros?: string };
      }>;
    }>;
    if (!response.ok) {
      return { status: 'provider_error', httpStatus: response.status, campaigns: [] };
    }

    const campaigns = payload.flatMap((chunk) =>
      (chunk.results || []).map((row) => ({
        id: row.campaign?.id || null,
        name: row.campaign?.name || null,
        status: row.campaign?.status || null,
        impressions: Number(row.metrics?.impressions || 0),
        clicks: Number(row.metrics?.clicks || 0),
        costMicros: Number(row.metrics?.costMicros || 0),
      })),
    );
    return { status: 'ok', campaigns };
  }

  private async readWorkspaceProviderSettings(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    return ((workspace?.providerSettings as Record<string, unknown>) || {}) as Record<
      string,
      unknown
    > & { googleAds?: Record<string, unknown> };
  }

  private async readGoogleAdsSettings(workspaceId: string) {
    const settings = await this.readWorkspaceProviderSettings(workspaceId);
    return settings.googleAds || {};
  }

  private async resolveAccessToken(workspaceId: string) {
    const settings = await this.readGoogleAdsSettings(workspaceId);
    const accessToken = decryptMetaToken(readString(settings.accessToken));
    if (!accessToken) {
      throw new Error('google_ads_not_connected');
    }
    return accessToken;
  }

  private async googleAdsFetch(path: string, accessToken: string, init?: RequestInit) {
    const developerToken = this.readDeveloperToken();
    const loginCustomerId = normalizeCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    };
    if (loginCustomerId) {
      headers['login-customer-id'] = loginCustomerId;
    }
    return fetch(`${GOOGLE_ADS_BASE_URL}/${this.readApiVersion()}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(30000),
    });
  }

  private async exchangeCode(code: string, explicitRedirectUri?: string) {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.readClientId(),
        client_secret: this.readClientSecret(),
        redirect_uri: this.resolveRedirectUri(explicitRedirectUri),
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(30000),
    });
    return (await response.json().catch(() => ({}))) as GoogleAdsTokenResponse;
  }

  private tryReadClientId() {
    return readOptionalEnv(['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_CLIENT_ID']);
  }

  private tryReadClientSecret() {
    return readOptionalEnv(['GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET']);
  }

  private tryReadDeveloperToken() {
    return readOptionalEnv(['GOOGLE_ADS_DEVELOPER_TOKEN']);
  }

  private readClientId() {
    return readRequiredEnv(['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_CLIENT_ID'], 'google_ads_client_id');
  }

  private readClientSecret() {
    return readRequiredEnv(
      ['GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET'],
      'google_ads_client_secret',
    );
  }

  private readDeveloperToken() {
    return readRequiredEnv(['GOOGLE_ADS_DEVELOPER_TOKEN'], 'google_ads_developer_token');
  }

  private readStateSecret() {
    return readRequiredEnv(
      ['GOOGLE_ADS_STATE_SECRET', 'GOOGLE_ADS_CLIENT_SECRET', 'JWT_SECRET'],
      'google_ads_state_secret',
    );
  }

  private resolveRedirectUri(explicit?: string) {
    const explicitValue = String(explicit || '').trim();
    if (explicitValue) {
      return explicitValue;
    }
    return (
      process.env.GOOGLE_ADS_REDIRECT_URI?.trim() ||
      `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.kloel.com'}/integrations/google-ads/callback`
    );
  }

  private readApiVersion() {
    const version = String(process.env.GOOGLE_ADS_API_VERSION || 'v24').trim();
    return /^v\d+(?:_\d+)?$/.test(version) ? version : 'v24';
  }
}
