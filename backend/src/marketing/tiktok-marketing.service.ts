import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { encryptMetaToken } from '../meta/meta-token-crypto';
import { PrismaService } from '../prisma/prisma.service';
import { asProviderSettings, type ProviderSettings } from '../whatsapp/provider-settings.types';

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

const CREATOR_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const CREATOR_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const ADVERTISER_AUTH_URL = 'https://business-api.tiktok.com/portal/auth';
const ADVERTISER_TOKEN_URL = 'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/';
const STATE_TTL_MS = 10 * 60 * 1000;

type TikTokKind = 'creator' | 'advertiser';

export interface TikTokCompleteBody {
  code?: string;
  auth_code?: string;
  kind?: TikTokKind;
  redirectUri?: string;
  state?: string;
}

interface TikTokTokenPayload {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  open_id?: string;
  scope?: string;
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

interface SignedStatePayload {
  workspaceId: string;
  kind: TikTokKind;
  ts: number;
}

function resolveKind(raw: unknown): TikTokKind {
  return raw === 'advertiser' ? 'advertiser' : 'creator';
}

function readRequiredEnv(keys: string[], label: string): string {
  const value = keys.map((key) => String(process.env[key] || '').trim()).find(Boolean);
  if (!value) {
    throw new Error(`${label}_not_configured`);
  }
  return value;
}

function expiresAtFromSeconds(seconds: unknown) {
  const expiresIn = Number(seconds || 0);
  return expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
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
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const workspaceId = String(parsed?.workspaceId || '').trim();
    const kind = resolveKind(parsed?.kind);
    const ts = Number(parsed?.ts || 0);
    if (!workspaceId || !Number.isFinite(ts) || Date.now() - ts > STATE_TTL_MS) {
      return null;
    }
    return { workspaceId, kind, ts };
  } catch {
    return null;
  }
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

    return {
      connected: Boolean(tiktok.connected),
      status: tiktok.connected ? 'connected' : 'disconnected',
      kind: typeof tiktok.kind === 'string' ? tiktok.kind : null,
      openId: typeof tiktok.openId === 'string' ? tiktok.openId : null,
      advertiserIds: Array.isArray(tiktok.advertiserIds) ? tiktok.advertiserIds : [],
      expiresAt: typeof tiktok.expiresAt === 'string' ? tiktok.expiresAt : null,
      clientConfigured: Boolean(this.tryReadTikTokClientKey()),
      secretConfigured: Boolean(this.tryReadTikTokSecret()),
    };
  }

  generateAuthUrl(workspaceId: string, rawKind?: TikTokKind) {
    const kind = resolveKind(rawKind);
    const clientKey = this.readTikTokClientKey();
    const state = signPayload({ workspaceId, kind, ts: Date.now() }, this.readStateSecret());
    const redirectUri = this.resolveRedirectUri(kind);

    if (kind === 'advertiser') {
      const url = new URL(ADVERTISER_AUTH_URL);
      url.searchParams.set('app_id', clientKey);
      url.searchParams.set('state', state);
      url.searchParams.set('redirect_uri', redirectUri);
      return { url: url.toString(), kind, redirectUri };
    }

    const url = new URL(CREATOR_AUTH_URL);
    url.searchParams.set('client_key', clientKey);
    url.searchParams.set(
      'scope',
      [
        'user.info.basic',
        'user.info.username',
        'user.info.stats',
        'user.info.profile',
        'user.account.type',
        'user.insights',
        'biz.brand.insights',
        'video.list',
        'video.insights',
        'comment.list',
        'comment.list.manage',
        'video.publish',
        'video.upload',
        'biz.spark.auth',
        'discovery.search.words',
        'biz.ads.recommend',
        'biz.creator.info',
        'biz.creator.insights',
        'tto.campaign.link',
      ].join(','),
    );
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    return { url: url.toString(), kind, redirectUri };
  }

  async completeOAuth(workspaceId: string, body: TikTokCompleteBody) {
    const kind = resolveKind(body.kind);
    const code = String(body.code || body.auth_code || '').trim();
    const state = verifyState(body.state, this.readStateSecret());

    if (!code) {
      return { connected: false, status: 'missing_code' };
    }
    if (!state || state.workspaceId !== workspaceId || state.kind !== kind) {
      return { connected: false, status: 'invalid_state' };
    }

    let clientKey = '';
    let secret = '';
    try {
      clientKey = this.readTikTokClientKey();
      secret = this.readTikTokSecret();
    } catch (error) {
      this.logger.error('Failed to read TikTok client credentials', error instanceof Error ? error.message : String(error), { context: 'TikTokMarketingService.completeOAuth' });
      return { connected: false, status: 'server_not_configured' };
    }

    const redirectUri = this.resolveRedirectUri(kind, body.redirectUri);
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
      data: { providerSettings: JSON.parse(JSON.stringify(nextSettings)) as Prisma.InputJsonObject },
    });

    return { connected: true, status: 'connected', kind, advertiserIds };
  }

  private tryReadTikTokClientKey() {
    return (
      String(process.env.TIKTOK_CLIENT_KEY || '').trim() ||
      String(process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY || '').trim()
    );
  }

  private tryReadTikTokSecret() {
    return String(process.env.TIKTOK_CLIENT_SECRET || '').trim();
  }

  private readTikTokClientKey() {
    return readRequiredEnv(
      ['TIKTOK_CLIENT_KEY', 'NEXT_PUBLIC_TIKTOK_CLIENT_KEY'],
      'tiktok_client_key',
    );
  }

  private readTikTokSecret() {
    return readRequiredEnv(['TIKTOK_CLIENT_SECRET'], 'tiktok_client_secret');
  }

  private readStateSecret() {
    return readRequiredEnv(
      ['TIKTOK_STATE_SECRET', 'JWT_SECRET', 'TIKTOK_CLIENT_SECRET'],
      'tiktok_state_secret',
    );
  }

  private resolveRedirectUri(kind: TikTokKind, explicit?: string) {
    if (explicit) {
      return explicit;
    }
    const frontendUrl = String(process.env.FRONTEND_URL || 'https://app.kloel.com').replace(
      /\/+$/,
      '',
    );
    return kind === 'advertiser'
      ? `${frontendUrl}/integrations/tiktok/callback`
      : `${frontendUrl}/integrations/tiktok/auth/callback`;
  }

  private async exchangeToken(input: {
    kind: TikTokKind;
    code: string;
    clientKey: string;
    secret: string;
    redirectUri: string;
  }): Promise<TikTokTokenPayload> {
    this.logger.log('Calling TikTok API', { context: 'TikTokMarketingService.exchangeToken', kind: input.kind });
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
      this.logger.error('Failed to parse TikTok token response', error instanceof Error ? error.message : String(error), { context: 'TikTokMarketingService.exchangeToken' });
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
