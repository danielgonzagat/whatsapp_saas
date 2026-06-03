import { ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

// Canonical trim→null primitive (backend/src/common/parse.ts). The prior
// local `readString` had an identical contract (trim, return null on empty);
// re-exported here to preserve the public surface for importing services.
import { readStringOrNull as readString } from '../common/parse';

export { readString };

export const CREATOR_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
export const CREATOR_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
export const CREATOR_USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/';
export const ADVERTISER_AUTH_URL = 'https://business-api.tiktok.com/portal/auth';
export const ADVERTISER_TOKEN_URL =
  'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/';
export const BUSINESS_API_BASE_URL = 'https://business-api.tiktok.com/open_api/v1.3';
export const STATE_TTL_MS = 10 * 60 * 1000;

export const TIKTOK_CREATOR_SCOPES = [
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
];

export const TIKTOK_CREATOR_PROFILE_FIELDS = [
  'open_id',
  'union_id',
  'avatar_url',
  'display_name',
  'username',
  'follower_count',
  'following_count',
  'likes_count',
  'video_count',
];

export const TIKTOK_CLIENT_KEY_ENV_KEYS = [
  'TIKTOK_CLIENT_KEY',
  'TIKTOK_APP_ID',
  'TIKTOK_CLIENT_ID',
  'NEXT_PUBLIC_TIKTOK_CLIENT_KEY',
  'NEXT_PUBLIC_TIKTOK_APP_ID',
];

export const TIKTOK_SECRET_ENV_KEYS = ['TIKTOK_CLIENT_SECRET', 'TIKTOK_APP_SECRET'];

export const TIKTOK_STATE_SECRET_ENV_KEYS = [
  'TIKTOK_STATE_SECRET',
  'JWT_SECRET',
  'TIKTOK_CLIENT_SECRET',
  'TIKTOK_APP_SECRET',
];

export type TikTokKind = 'creator' | 'advertiser';

export interface TikTokTokenPayload {
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

export interface SignedStatePayload {
  workspaceId: string;
  kind: TikTokKind;
  ts: number;
}

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

export function resolveKind(raw: unknown): TikTokKind {
  return raw === 'advertiser' ? 'advertiser' : 'creator';
}

export function readRequiredEnv(keys: string[], label: string): string {
  const value = keys.map((key) => String(process.env[key] || '').trim()).find(Boolean);
  if (!value) {
    throw new ServiceUnavailableException(`${label}_not_configured`);
  }
  return value;
}

export function tryReadEnv(keys: string[]): string {
  return keys.map((key) => String(process.env[key] || '').trim()).find(Boolean) || '';
}

export function expiresAtFromSeconds(seconds: unknown): string | null {
  const expiresIn = Number(seconds || 0);
  return expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => readString(item)).filter((item): item is string => Boolean(item));
}

export function signPayload(payload: SignedStatePayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyState(rawState: unknown, secret: string): SignedStatePayload | null {
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
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    > | null;
    const rawWorkspaceId = parsed?.workspaceId;
    const workspaceId = typeof rawWorkspaceId === 'string' ? rawWorkspaceId.trim() : '';
    const kind = resolveKind(parsed?.kind);
    const rawTs = parsed?.ts;
    const ts = typeof rawTs === 'number' ? rawTs : Number(rawTs ?? 0);
    if (!workspaceId || !Number.isFinite(ts) || Date.now() - ts > STATE_TTL_MS) {
      return null;
    }
    return { workspaceId, kind, ts };
  } catch {
    return null;
  }
}

export function resolveRedirectUri(kind: TikTokKind, explicit?: string): string {
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

export function resolveAdvertiserId(
  settings: Record<string, unknown>,
  rawAdvertiserId?: string,
): string {
  const explicit = readString(rawAdvertiserId);
  if (explicit) {
    return explicit.replace(/\D/g, '');
  }
  const advertiserIds = readStringArray(settings.advertiserIds);
  return advertiserIds[0]?.replace(/\D/g, '') || '';
}

export interface BuildAuthUrlInput {
  kind: TikTokKind;
  clientKey: string;
  state: string;
  redirectUri: string;
}

export interface BuildAuthUrlResult {
  url: string;
  kind: TikTokKind;
  redirectUri: string;
}

export function buildAuthUrl(input: BuildAuthUrlInput): BuildAuthUrlResult {
  const { kind, clientKey, state, redirectUri } = input;
  if (kind === 'advertiser') {
    const url = new URL(ADVERTISER_AUTH_URL);
    url.searchParams.set('app_id', clientKey);
    url.searchParams.set('state', state);
    url.searchParams.set('redirect_uri', redirectUri);
    return { url: url.toString(), kind, redirectUri };
  }

  const url = new URL(CREATOR_AUTH_URL);
  url.searchParams.set('client_key', clientKey);
  url.searchParams.set('scope', TIKTOK_CREATOR_SCOPES.join(','));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  return { url: url.toString(), kind, redirectUri };
}

export interface ResolveStatusInput {
  tiktok: TikTokProviderSubsettings;
  clientConfigured: boolean;
  secretConfigured: boolean;
}

export interface ResolveStatusResult {
  connected: boolean;
  status: string;
  kind: string | null;
  openId: string | null;
  advertiserIds: string[];
  expiresAt: string | null;
  expired: boolean;
  clientConfigured: boolean;
  secretConfigured: boolean;
  configReady: boolean;
}

export function resolveStatus(input: ResolveStatusInput): ResolveStatusResult {
  const { tiktok, clientConfigured, secretConfigured } = input;
  const expiresAt = typeof tiktok.expiresAt === 'string' ? tiktok.expiresAt : null;
  const expired = expiresAt ? new Date(expiresAt).getTime() < Date.now() : false;

  const connected = Boolean(tiktok.connected) && !expired;
  const status =
    !clientConfigured || !secretConfigured
      ? 'config_missing'
      : connected
        ? 'connected'
        : expired && tiktok.connected
          ? 'expired'
          : 'disconnected';

  return {
    connected,
    status,
    kind: typeof tiktok.kind === 'string' ? tiktok.kind : null,
    openId: typeof tiktok.openId === 'string' ? tiktok.openId : null,
    advertiserIds: Array.isArray(tiktok.advertiserIds) ? tiktok.advertiserIds : [],
    expiresAt,
    expired,
    clientConfigured,
    secretConfigured,
    configReady: clientConfigured && secretConfigured,
  };
}
