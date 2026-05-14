import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { MailboxStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { StructuredLogger } from '../../logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptMailboxToken, encryptMailboxToken } from '../mailbox-token-crypto';
import { expiresAtFromSeconds } from './oauth-state';
import {
  requireClientId,
  requireClientSecret,
  resolveRedirectUri,
} from './config-resolver';
import { GOOGLE_TOKEN_URL, GOOGLE_USERINFO_URL, GMAIL_API_BASE } from './constants';
import type {
  GmailMailboxRecord,
  GmailListResponse,
  GmailMessageResponse,
  GoogleTokenResponse,
  GoogleUserInfoResponse,
} from './types';

@Injectable()
export class GmailClientService {
  private readonly logger = StructuredLogger.from(GmailClientService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async exchangeCode(code: string): Promise<GoogleTokenResponse> {
    const cleanCode = String(code || '').trim();
    if (!cleanCode) {
      throw new BadRequestException('gmail_oauth_code_required');
    }

    const body = new URLSearchParams();
    body.set('client_id', requireClientId(this.config));
    body.set('client_secret', requireClientSecret(this.config));
    body.set('code', cleanCode);
    body.set('grant_type', 'authorization_code');
    body.set('redirect_uri', resolveRedirectUri(this.config));

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(30000),
    });

    const payload = (await response.json().catch(() => ({}))) as GoogleTokenResponse;
    if (!response.ok) {
      this.logger.warn(
        `Gmail OAuth token exchange failed: status=${response.status} error=${payload.error || 'unknown'}`,
      );
      throw new BadRequestException('gmail_token_exchange_failed');
    }

    return payload;
  }

  async fetchUserInfo(
    accessToken: string,
  ): Promise<GoogleUserInfoResponse> {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    const payload = (await response.json().catch(() => ({}))) as GoogleUserInfoResponse;
    if (!response.ok) {
      this.logger.warn(
        `Gmail userinfo lookup failed: status=${response.status} message=${payload.error?.message || 'unknown'}`,
      );
      throw new BadRequestException('gmail_profile_lookup_failed');
    }
    return payload;
  }

  async resolveAccessToken(
    connection: GmailMailboxRecord,
  ): Promise<string> {
    const currentAccessToken = decryptMailboxToken(connection.accessToken);
    if (currentAccessToken && this.tokenStillUsable(connection.expiresAt)) {
      return currentAccessToken;
    }

    const refreshToken = decryptMailboxToken(connection.refreshToken);
    if (!refreshToken) {
      throw new BadRequestException('gmail_refresh_token_missing');
    }

    const body = new URLSearchParams();
    body.set('client_id', requireClientId(this.config));
    body.set('client_secret', requireClientSecret(this.config));
    body.set('refresh_token', refreshToken);
    body.set('grant_type', 'refresh_token');

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(30000),
    });
    const payload = (await response.json().catch(() => ({}))) as GoogleTokenResponse;
    if (!response.ok || !payload.access_token) {
      // @AllowCrossWorkspace: mailboxConnection.update is scoped by a non-workspace unique identifier, provider callback key, admin session owner, or platform worker claim.
      await this.prisma.mailboxConnection.update({
        where: { id: connection.id },
        data: {
          status: MailboxStatus.ERROR,
          lastErrorAt: new Date(),
          lastError: 'gmail_refresh_failed',
        },
      });
      throw new BadRequestException('gmail_refresh_failed');
    }

    // @AllowCrossWorkspace: mailboxConnection.update is scoped by a non-workspace unique identifier, provider callback key, admin session owner, or platform worker claim.
    await this.prisma.mailboxConnection.update({
      where: { id: connection.id },
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

  tokenStillUsable(expiresAt: Date | null): boolean {
    if (!expiresAt) {
      return true;
    }
    return expiresAt.getTime() - Date.now() > 60_000;
  }

  async listMessages(
    accessToken: string,
    limit: number,
  ): Promise<GmailListResponse> {
    const url = new URL(`${GMAIL_API_BASE}/messages`);
    url.searchParams.set('maxResults', String(limit));
    url.searchParams.set('q', 'newer_than:7d -from:me');
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30000),
    });
    const payload = (await response.json().catch(() => ({}))) as GmailListResponse;
    if (!response.ok) {
      throw new BadRequestException('gmail_list_failed');
    }
    return payload;
  }

  async getMessage(
    accessToken: string,
    messageId: string,
  ): Promise<GmailMessageResponse> {
    const url = new URL(
      `${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}`,
    );
    url.searchParams.set('format', 'full');
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30000),
    });
    const payload = (await response.json().catch(() => ({}))) as GmailMessageResponse;
    if (!response.ok) {
      throw new BadRequestException('gmail_message_fetch_failed');
    }
    return payload;
  }
}
