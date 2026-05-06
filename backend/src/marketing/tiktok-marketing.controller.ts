import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { encryptMetaToken } from '../meta/meta-token-crypto';
import { PrismaService } from '../prisma/prisma.service';

const CREATOR_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const CREATOR_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const ADVERTISER_AUTH_URL = 'https://business-api.tiktok.com/portal/auth';
const ADVERTISER_TOKEN_URL = 'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/';
const DEFAULT_TIKTOK_CLIENT_KEY = '7632164959169806353';

type TikTokKind = 'creator' | 'advertiser';

interface TikTokCompleteBody {
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

function readTikTokClientKey() {
  return (
    String(process.env.TIKTOK_CLIENT_KEY || '').trim() ||
    String(process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY || '').trim() ||
    DEFAULT_TIKTOK_CLIENT_KEY
  );
}

function readTikTokSecret() {
  return String(process.env.TIKTOK_CLIENT_SECRET || '').trim();
}

function encodeState(workspaceId: string, kind: TikTokKind) {
  return Buffer.from(JSON.stringify({ workspaceId, kind, ts: Date.now() })).toString('base64url');
}

function decodeState(rawState: unknown): { workspaceId: string; kind: TikTokKind } | null {
  const state = typeof rawState === 'string' ? rawState.trim() : '';
  if (!state) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    const workspaceId = String(parsed?.workspaceId || '').trim();
    const kind = resolveKind(parsed?.kind);
    return workspaceId ? { workspaceId, kind } : null;
  } catch {
    return null;
  }
}

function resolveKind(raw: unknown): TikTokKind {
  return raw === 'advertiser' ? 'advertiser' : 'creator';
}

function resolveRedirectUri(kind: TikTokKind, explicit?: string) {
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

function expiresAtFromSeconds(seconds: unknown) {
  const expiresIn = Number(seconds || 0);
  return expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
}

@Controller('marketing/connect/tiktok')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class TikTokMarketingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('status')
  async status(@Request() req: { user: { workspaceId: string } }) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: req.user.workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const tiktok = (settings.tiktok || {}) as Record<string, unknown>;

    return {
      connected: Boolean(tiktok.connected),
      status: tiktok.connected ? 'connected' : 'disconnected',
      kind: typeof tiktok.kind === 'string' ? tiktok.kind : null,
      openId: typeof tiktok.openId === 'string' ? tiktok.openId : null,
      advertiserIds: Array.isArray(tiktok.advertiserIds) ? tiktok.advertiserIds : [],
      expiresAt: typeof tiktok.expiresAt === 'string' ? tiktok.expiresAt : null,
      clientConfigured: Boolean(readTikTokClientKey()),
      secretConfigured: Boolean(readTikTokSecret()),
    };
  }

  @Get('url')
  url(@Request() req: { user: { workspaceId: string } }, @Query('kind') rawKind?: TikTokKind) {
    const kind = resolveKind(rawKind);
    const clientKey = readTikTokClientKey();
    const state = encodeState(req.user.workspaceId, kind);
    const redirectUri = resolveRedirectUri(kind);

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

  @Post('complete')
  async complete(
    @Request() req: { user: { workspaceId: string } },
    @Body() body: TikTokCompleteBody,
  ) {
    const kind = resolveKind(body.kind);
    const code = String(body.code || body.auth_code || '').trim();
    const clientKey = readTikTokClientKey();
    const secret = readTikTokSecret();
    const redirectUri = resolveRedirectUri(kind, body.redirectUri);
    const state = decodeState(body.state);

    if (!code) {
      return { connected: false, status: 'missing_code' };
    }
    if (!state || state.workspaceId !== req.user.workspaceId || state.kind !== kind) {
      return { connected: false, status: 'invalid_state' };
    }
    if (!clientKey || !secret) {
      return { connected: false, status: 'server_not_configured' };
    }

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
      where: { id: req.user.workspaceId },
      select: { providerSettings: true },
    });
    const currentSettings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const nextSettings = {
      ...currentSettings,
      tiktok: {
        connected: true,
        status: 'connected',
        kind,
        accessToken: encryptMetaToken(accessToken),
        refreshToken: encryptMetaToken(refreshToken),
        openId: token.open_id || null,
        advertiserIds,
        scope: token.scope || null,
        expiresAt: expiresAtFromSeconds(tokenData.expires_in || token.expires_in),
        connectedAt: new Date().toISOString(),
      },
    } satisfies Record<string, unknown>;

    await this.prisma.workspace.update({
      where: { id: req.user.workspaceId },
      data: { providerSettings: nextSettings },
    });

    return { connected: true, status: 'connected', kind, advertiserIds };
  }

  private async exchangeToken(input: {
    kind: TikTokKind;
    code: string;
    clientKey: string;
    secret: string;
    redirectUri: string;
  }): Promise<TikTokTokenPayload> {
    if (input.kind === 'advertiser') {
      const response = await fetch(ADVERTISER_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: input.clientKey,
          secret: input.secret,
          auth_code: input.code,
        }),
        signal: AbortSignal.timeout(30000),
      });
      return (await response.json().catch(() => ({}))) as TikTokTokenPayload;
    }

    const body = new URLSearchParams();
    body.set('client_key', input.clientKey);
    body.set('client_secret', input.secret);
    body.set('code', input.code);
    body.set('grant_type', 'authorization_code');
    body.set('redirect_uri', input.redirectUri);

    const response = await fetch(CREATOR_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(30000),
    });
    return (await response.json().catch(() => ({}))) as TikTokTokenPayload;
  }
}
