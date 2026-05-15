import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { MailboxStatus, Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { decryptMailboxToken, encryptMailboxToken } from './mailbox-token-crypto';

export const MICROSOFT_AUTH_BASE = 'https://login.microsoftonline.com';
export const MICROSOFT_GRAPH_ME_URL = 'https://graph.microsoft.com/v1.0/me';
export const MICROSOFT_GRAPH_SEND_URL = 'https://graph.microsoft.com/v1.0/me/sendMail';
const STATE_TTL_MS = 10 * 60 * 1000;

export const MICROSOFT_MAILBOX_SCOPES = [
  'openid',
  'email',
  'profile',
  'offline_access',
  'User.Read',
  'Mail.Read',
  'Mail.Send',
  'Mail.ReadWrite',
];

export interface SignedMicrosoftState {
  workspaceId: string;
  returnTo: string;
  ts: number;
}

export interface MicrosoftTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export interface MicrosoftProfileResponse {
  id?: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
  error?: {
    message?: string;
  };
}

export function readConfiguredValue(config: ConfigService, keys: string[]): string | null {
  for (const key of keys) {
    const value = String(config.get<string>(key) || process.env[key] || '').trim();
    if (value) {
      return value;
    }
  }
  return null;
}

export function normalizeReturnTo(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return '/marketing/email';
  }
  return raw.slice(0, 200);
}

export function expiresAtFromSeconds(seconds: unknown): Date | null {
  const parsed = Number(seconds || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return new Date(Date.now() + parsed * 1000);
}

export function readMicrosoftStateSecret(config: ConfigService): string {
  const explicit = readConfiguredValue(config, [
    'EMAIL_OAUTH_STATE_SECRET',
    'EMAIL_TOKEN_ENCRYPTION_KEY',
    'JWT_SECRET',
  ]);
  if (!explicit) {
    throw new ServiceUnavailableException('email_oauth_state_secret_not_configured');
  }
  return explicit;
}

export function signMicrosoftState(payload: SignedMicrosoftState, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyMicrosoftState(
  rawState: string,
  secret: string,
): SignedMicrosoftState | null {
  const [encoded, signature] = String(rawState || '').split('.');
  if (!encoded || !signature) {
    return null;
  }
  const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Partial<SignedMicrosoftState>;
    const workspaceId = String(parsed.workspaceId || '').trim();
    const returnTo = normalizeReturnTo(parsed.returnTo);
    const ts = Number(parsed.ts || 0);
    if (!workspaceId || !Number.isFinite(ts) || Date.now() - ts > STATE_TTL_MS) {
      return null;
    }
    return { workspaceId, returnTo, ts };
  } catch {
    return null;
  }
}

export function resolveMicrosoftRedirectUri(config: ConfigService): string {
  const explicit = readConfiguredValue(config, ['MICROSOFT_MAILBOX_REDIRECT_URI']);
  if (explicit) {
    return explicit;
  }
  const backendUrl = readConfiguredValue(config, [
    'BACKEND_PUBLIC_URL',
    'PUBLIC_API_URL',
    'API_PUBLIC_URL',
  ]);
  if (!backendUrl) {
    throw new ServiceUnavailableException('backend_public_url_not_configured');
  }
  return `${backendUrl.replace(/\/+$/, '')}/marketing/connect/email/microsoft/callback`;
}

export function resolveMicrosoftTenantId(config: ConfigService): string {
  return readConfiguredValue(config, ['MICROSOFT_TENANT_ID']) || 'common';
}

export function requireMicrosoftClientId(config: ConfigService): string {
  const value = readConfiguredValue(config, ['MICROSOFT_MAILBOX_CLIENT_ID', 'MICROSOFT_CLIENT_ID']);
  if (!value) {
    throw new ServiceUnavailableException('microsoft_mailbox_client_id_not_configured');
  }
  return value;
}

export function requireMicrosoftClientSecret(config: ConfigService): string {
  const value = readConfiguredValue(config, [
    'MICROSOFT_MAILBOX_CLIENT_SECRET',
    'MICROSOFT_CLIENT_SECRET',
  ]);
  if (!value) {
    throw new ServiceUnavailableException('microsoft_mailbox_client_secret_not_configured');
  }
  return value;
}

export function buildMicrosoftMailboxMetadata(
  token: MicrosoftTokenResponse,
  profile: MicrosoftProfileResponse,
) {
  return {
    scope: token.scope || MICROSOFT_MAILBOX_SCOPES.join(' '),
    tokenType: token.token_type || 'Bearer',
    displayName: profile.displayName || null,
    provider: 'microsoft',
    updatedAt: new Date().toISOString(),
  } satisfies Prisma.InputJsonObject;
}

interface MicrosoftTokenConnection {
  id: string;
  workspaceId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
}

interface MicrosoftTokenPrisma {
  mailboxConnection: {
    update(input: {
      where: { id: string; workspaceId: string };
      data: {
        accessToken?: string | null;
        expiresAt?: Date | null;
        status?: MailboxStatus;
        lastErrorAt: Date | null;
        lastError: string | null;
      };
    }): Promise<unknown>;
  };
}

function tokenStillUsable(expiresAt: Date | null): boolean {
  if (!expiresAt) {
    return true;
  }
  return expiresAt.getTime() - Date.now() > 60_000;
}

export async function resolveMicrosoftAccessToken(input: {
  connection: MicrosoftTokenConnection;
  prisma: MicrosoftTokenPrisma;
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
}): Promise<string> {
  const currentAccessToken = decryptMailboxToken(input.connection.accessToken);
  if (currentAccessToken && tokenStillUsable(input.connection.expiresAt)) {
    return currentAccessToken;
  }
  const refreshToken = decryptMailboxToken(input.connection.refreshToken);
  if (!refreshToken) {
    throw new BadRequestException('microsoft_refresh_token_missing');
  }
  const body = new URLSearchParams();
  body.set('client_id', input.clientId);
  body.set('client_secret', input.clientSecret);
  body.set('refresh_token', refreshToken);
  body.set('grant_type', 'refresh_token');
  const response = await fetch(input.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(30000),
  });
  const payload = (await response.json().catch(() => ({}))) as MicrosoftTokenResponse;
  if (!response.ok || !payload.access_token) {
    await input.prisma.mailboxConnection.update({
      where: { id: input.connection.id, workspaceId: input.connection.workspaceId },
      data: {
        status: MailboxStatus.ERROR,
        lastErrorAt: new Date(),
        lastError: 'microsoft_refresh_failed',
      },
    });
    throw new BadRequestException('microsoft_refresh_failed');
  }
  await input.prisma.mailboxConnection.update({
    where: { id: input.connection.id, workspaceId: input.connection.workspaceId },
    data: {
      accessToken: encryptMailboxToken(payload.access_token) ?? null,
      expiresAt: expiresAtFromSeconds(payload.expires_in),
      status: MailboxStatus.ACTIVE,
      lastErrorAt: null,
      lastError: null,
    },
  });
  return payload.access_token;
}
