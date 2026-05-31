import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { decryptMetaToken, encryptMetaToken } from '../meta/meta-token-crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  asProviderSettings,
  type ProviderSettings,
} from './channels/whatsapp/provider-settings.types';
import {
  ADVERTISER_TOKEN_URL,
  BUSINESS_API_BASE_URL,
  CREATOR_TOKEN_URL,
  CREATOR_USER_INFO_URL,
  TIKTOK_CLIENT_KEY_ENV_KEYS,
  TIKTOK_CREATOR_PROFILE_FIELDS,
  TIKTOK_SECRET_ENV_KEYS,
  TIKTOK_STATE_SECRET_ENV_KEYS,
  type TikTokKind,
  type TikTokProviderSubsettings,
  type TikTokTokenPayload,
  buildAuthUrl,
  expiresAtFromSeconds,
  readRequiredEnv,
  readString,
  resolveAdvertiserId,
  resolveKind,
  resolveRedirectUri,
  resolveStatus,
  signPayload,
  tryReadEnv,
  verifyState,
} from './tiktok-marketing.helpers';

export interface TikTokCompleteBody {
  code?: string;
  auth_code?: string;
  kind?: TikTokKind;
  redirectUri?: string;
  state?: string;
}

@Injectable()
export class TikTokMarketingService {
  private readonly logger = new Logger(TikTokMarketingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getStatus(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = asProviderSettings(workspace?.providerSettings);
    const tiktok = (settings.tiktok || {}) as TikTokProviderSubsettings;

    return resolveStatus({
      tiktok,
      clientConfigured: Boolean(tryReadEnv(TIKTOK_CLIENT_KEY_ENV_KEYS)),
      secretConfigured: Boolean(tryReadEnv(TIKTOK_SECRET_ENV_KEYS)),
    });
  }

  generateAuthUrl(workspaceId: string, rawKind?: TikTokKind) {
    const kind = resolveKind(rawKind);
    const clientKey = readRequiredEnv(TIKTOK_CLIENT_KEY_ENV_KEYS, 'tiktok_client_key');
    const state = signPayload(
      { workspaceId, kind, ts: Date.now() },
      readRequiredEnv(TIKTOK_STATE_SECRET_ENV_KEYS, 'tiktok_state_secret'),
    );
    const redirectUri = resolveRedirectUri(kind);
    return buildAuthUrl({ kind, clientKey, state, redirectUri });
  }

  async completeOAuth(workspaceId: string, body: TikTokCompleteBody) {
    const kind = resolveKind(body.kind);
    const code = String(body.code || body.auth_code || '').trim();
    const state = verifyState(
      body.state,
      readRequiredEnv(TIKTOK_STATE_SECRET_ENV_KEYS, 'tiktok_state_secret'),
    );

    if (!code) {
      return { connected: false, status: 'missing_code' };
    }
    if (!state || state.workspaceId !== workspaceId || state.kind !== kind) {
      return { connected: false, status: 'invalid_state' };
    }

    let clientKey = '';
    let secret = '';
    try {
      clientKey = readRequiredEnv(TIKTOK_CLIENT_KEY_ENV_KEYS, 'tiktok_client_key');
      secret = readRequiredEnv(TIKTOK_SECRET_ENV_KEYS, 'tiktok_client_secret');
    } catch (error) {
      this.logger.error(
        'Failed to read TikTok client credentials',
        error instanceof Error ? error.message : String(error),
        { context: 'TikTokMarketingService.completeOAuth' },
      );
      return { connected: false, status: 'server_not_configured' };
    }

    const redirectUri = resolveRedirectUri(kind, body.redirectUri);
    const token = await this.exchangeToken({ kind, code, clientKey, secret, redirectUri });
    const tokenData = token.data || token;
    const accessToken = tokenData.access_token || token.access_token || '';
    const refreshToken = tokenData.refresh_token || token.refresh_token || '';
    const advertiserIds = Array.isArray(tokenData.advertiser_ids) ? tokenData.advertiser_ids : [];

    if (!accessToken) {
      return {
        connected: false,
        status: 'token_exchange_failed',
        providerMessage: token.message || token.error || null,
      };
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const currentSettings = asProviderSettings(workspace?.providerSettings);
    const nextSettings = {
      ...currentSettings,
      tiktok: {
        connected: true,
        status: 'connected',
        kind,
        accessToken: encryptMetaToken(accessToken),
        refreshToken: refreshToken ? encryptMetaToken(refreshToken) : null,
        openId: token.open_id || null,
        advertiserIds,
        scope: token.scope || null,
        expiresAt: expiresAtFromSeconds(tokenData.expires_in || token.expires_in),
        connectedAt: new Date().toISOString(),
      },
    } satisfies ProviderSettings;

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: JSON.parse(JSON.stringify(nextSettings)) as Prisma.InputJsonObject,
      },
    });

    return { connected: true, status: 'connected', kind, advertiserIds };
  }

  async getCreatorProfile(workspaceId: string) {
    const settings = await this.readTikTokSettings(workspaceId);
    const accessToken = decryptMetaToken(readString(settings.accessToken));
    if (!accessToken) {
      return { status: 'not_connected', profile: null };
    }

    const url = new URL(CREATOR_USER_INFO_URL);
    url.searchParams.set('fields', TIKTOK_CREATOR_PROFILE_FIELDS.join(','));
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30000),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      data?: { user?: Record<string, unknown> };
      error?: { code?: string; message?: string };
    };
    if (!response.ok || payload.error?.code === 'access_token_invalid') {
      return {
        status: 'provider_error',
        httpStatus: response.status,
        providerMessage: payload.error?.message || payload.error?.code || null,
        profile: null,
      };
    }
    return { status: 'ok', profile: payload.data?.user || null };
  }

  async listAdvertiserCampaigns(workspaceId: string, rawAdvertiserId?: string) {
    const settings = await this.readTikTokSettings(workspaceId);
    const accessToken = decryptMetaToken(readString(settings.accessToken));
    if (!accessToken) {
      return { status: 'not_connected', campaigns: [] };
    }
    const advertiserId = resolveAdvertiserId(settings, rawAdvertiserId);
    if (!advertiserId) {
      return { status: 'missing_advertiser_id', campaigns: [] };
    }

    const url = new URL(`${BUSINESS_API_BASE_URL}/campaign/get/`);
    url.searchParams.set('advertiser_id', advertiserId);
    url.searchParams.set('page', '1');
    url.searchParams.set('page_size', '50');
    const response = await fetch(url, {
      headers: { 'Access-Token': accessToken, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      code?: number;
      message?: string;
      data?: { list?: Array<Record<string, unknown>> };
    };
    if (!response.ok || (typeof payload.code === 'number' && payload.code !== 0)) {
      return {
        status: 'provider_error',
        httpStatus: response.status,
        providerMessage: payload.message || null,
        campaigns: [],
      };
    }
    return { status: 'ok', advertiserId, campaigns: payload.data?.list || [] };
  }

  async disconnect(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const currentSettings = asProviderSettings(workspace?.providerSettings);
    const nextSettings = {
      ...currentSettings,
      tiktok: {} as Record<string, never>,
    } satisfies ProviderSettings;

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: JSON.parse(JSON.stringify(nextSettings)) as Prisma.InputJsonObject,
      },
    });

    this.logger.log(`TikTok disconnected for workspace ${workspaceId}`);

    return { status: 'disconnected' };
  }

  private async readTikTokSettings(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = asProviderSettings(workspace?.providerSettings);
    return (settings.tiktok || {}) as Record<string, unknown>;
  }

  private async exchangeToken(input: {
    kind: TikTokKind;
    code: string;
    clientKey: string;
    secret: string;
    redirectUri: string;
  }): Promise<TikTokTokenPayload> {
    this.logger.log('Calling TikTok API', {
      context: 'TikTokMarketingService.exchangeToken',
      kind: input.kind,
    });
    const response =
      input.kind === 'advertiser'
        ? await fetch(ADVERTISER_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              app_id: input.clientKey,
              secret: input.secret,
              auth_code: input.code,
            }),
            signal: AbortSignal.timeout(30000),
          })
        : await this.exchangeCreatorToken(input);

    try {
      return (await response.json()) as TikTokTokenPayload;
    } catch (error) {
      this.logger.error(
        'Failed to parse TikTok token response',
        error instanceof Error ? error.message : String(error),
        { context: 'TikTokMarketingService.exchangeToken' },
      );
      return { error: 'invalid_token_response' };
    }
  }

  private exchangeCreatorToken(input: {
    code: string;
    clientKey: string;
    secret: string;
    redirectUri: string;
  }) {
    const body = new URLSearchParams();
    body.set('client_key', input.clientKey);
    body.set('client_secret', input.secret);
    body.set('code', input.code);
    body.set('grant_type', 'authorization_code');
    body.set('redirect_uri', input.redirectUri);

    return fetch(CREATOR_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(30000),
    });
  }
}
