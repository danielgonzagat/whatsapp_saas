import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { MailboxProvider, MailboxStatus, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { OmnichannelService } from '../inbox/omnichannel.service';
import type { NormalizedMessage } from '../inbox/omnichannel.helpers';
import { PrismaService } from '../prisma/prisma.service';
import { buildUnsubscribeFooterHtml } from '../common/utils/unsubscribe-footer.util';
import { Metrics } from '../observability/metrics';
import { decryptMailboxToken, encryptMailboxToken } from './mailbox-token-crypto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const STATE_TTL_MS = 10 * 60 * 1000;

const GMAIL_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

interface SignedGmailState {
  workspaceId: string;
  returnTo: string;
  ts: number;
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfoResponse {
  id?: string;
  email?: string;
  verified_email?: boolean;
  name?: string;
  picture?: string;
  error?: {
    message?: string;
  };
}

interface GmailMailboxRecord {
  id: string;
  workspaceId: string;
  email: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  metadata: Prisma.JsonValue | null;
}

interface GmailListResponse {
  messages?: Array<{ id?: string; threadId?: string }>;
  resultSizeEstimate?: number;
}

interface GmailMessagePart {
  mimeType?: string;
  filename?: string;
  body?: {
    data?: string;
  };
  parts?: GmailMessagePart[];
}

interface GmailMessageResponse {
  id?: string;
  threadId?: string;
  historyId?: string;
  snippet?: string;
  payload?: GmailMessagePart & {
    headers?: Array<{
      name?: string;
      value?: string;
    }>;
  };
}

interface GmailSendResponse {
  id?: string;
  threadId?: string;
  labelIds?: string[];
}

function readConfiguredValue(config: ConfigService, keys: string[]): string | null {
  for (const key of keys) {
    const value = String(config.get<string>(key) || process.env[key] || '').trim();
    if (value) {
      return value;
    }
  }
  return null;
}

function normalizeReturnTo(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return '/marketing/email';
  }
  return raw.slice(0, 200);
}

function expiresAtFromSeconds(seconds: unknown): Date | null {
  const parsed = Number(seconds || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return new Date(Date.now() + parsed * 1000);
}

@Injectable()
export class MailboxGmailOAuthService {
  private readonly logger = new Logger(MailboxGmailOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly omnichannel: OmnichannelService,
  ) {}

  buildAuthUrl(workspaceId: string, returnTo?: string) {
    const clientId = this.requireClientId();
    const redirectUri = this.resolveRedirectUri();
    const state = this.signState({
      workspaceId,
      returnTo: normalizeReturnTo(returnTo),
      ts: Date.now(),
    });

    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GMAIL_SCOPES.join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('state', state);

    return {
      provider: 'gmail',
      status: 'pending_oauth',
      authUrl: url.toString(),
      redirectUri,
      scopes: GMAIL_SCOPES,
    };
  }

  async completeOAuth(workspaceId: string, code: string, state: string) {
    const parsedState = this.verifyState(state);
    if (!parsedState || parsedState.workspaceId !== workspaceId) {
      throw new BadRequestException('invalid_gmail_oauth_state');
    }

    return this.persistOAuthResult(parsedState, code);
  }

  async completeOAuthCallback(code: string, state: string) {
    const parsedState = this.verifyState(state);
    if (!parsedState) {
      throw new BadRequestException('invalid_gmail_oauth_state');
    }

    return this.persistOAuthResult(parsedState, code);
  }

  private async persistOAuthResult(parsedState: SignedGmailState, code: string) {
    const token = await this.exchangeCode(code);
    if (!token.access_token) {
      throw new BadRequestException('gmail_token_exchange_failed');
    }
    if (!token.refresh_token) {
      throw new BadRequestException('gmail_refresh_token_not_granted');
    }

    const profile = await this.fetchUserInfo(token.access_token);
    const email = String(profile.email || '')
      .trim()
      .toLowerCase();
    if (!email || profile.verified_email === false) {
      throw new BadRequestException('gmail_email_not_verified');
    }

    const connection = await this.prisma.mailboxConnection.upsert({
      where: {
        workspaceId_provider_email: {
          workspaceId: parsedState.workspaceId,
          provider: MailboxProvider.GMAIL,
          email,
        },
      },
      create: {
        workspaceId: parsedState.workspaceId,
        provider: MailboxProvider.GMAIL,
        email,
        status: MailboxStatus.ACTIVE,
        providerAccountId: profile.id || null,
        accessToken: encryptMailboxToken(token.access_token) ?? null,
        refreshToken: encryptMailboxToken(token.refresh_token) ?? null,
        expiresAt: expiresAtFromSeconds(token.expires_in),
        connectedAt: new Date(),
        disconnectedAt: null,
        lastErrorAt: null,
        lastError: null,
        metadata: this.buildMetadata(token, profile),
      },
      update: {
        status: MailboxStatus.ACTIVE,
        providerAccountId: profile.id || null,
        accessToken: encryptMailboxToken(token.access_token) ?? null,
        refreshToken: encryptMailboxToken(token.refresh_token) ?? null,
        expiresAt: expiresAtFromSeconds(token.expires_in),
        connectedAt: new Date(),
        disconnectedAt: null,
        lastErrorAt: null,
        lastError: null,
        metadata: this.buildMetadata(token, profile),
      },
      select: {
        id: true,
        provider: true,
        email: true,
        status: true,
        connectedAt: true,
        expiresAt: true,
      },
    });

    Metrics.mailbox.connected('gmail', { workspace_id: parsedState.workspaceId });

    return {
      connected: true,
      provider: 'gmail',
      status: 'connected',
      email: connection.email,
      connectionId: connection.id,
      returnTo: parsedState.returnTo,
      expiresAt: connection.expiresAt,
    };
  }

  async getPrimaryGmailStatus(workspaceId: string) {
    const connection = await this.prisma.mailboxConnection.findFirst({
      where: {
        workspaceId,
        provider: MailboxProvider.GMAIL,
        status: MailboxStatus.ACTIVE,
      },
      orderBy: { connectedAt: 'desc' },
      select: {
        id: true,
        email: true,
        provider: true,
        status: true,
        connectedAt: true,
        lastSyncAt: true,
        lastErrorAt: true,
        lastError: true,
      },
    });

    return connection;
  }

  async syncLatestInbox(workspaceId: string, requestedLimit?: number) {
    const connection = await this.prisma.mailboxConnection.findFirst({
      where: {
        workspaceId,
        provider: MailboxProvider.GMAIL,
        status: MailboxStatus.ACTIVE,
      },
      orderBy: { connectedAt: 'desc' },
      select: {
        id: true,
        workspaceId: true,
        email: true,
        accessToken: true,
        refreshToken: true,
        expiresAt: true,
        metadata: true,
      },
    });

    if (!connection) {
      Metrics.mailbox.syncCompleted('gmail', 0, 0, {
        workspace_id: workspaceId,
        status: 'not_connected',
      });
      return { provider: 'gmail', status: 'not_connected', imported: 0 };
    }

    try {
      const accessToken = await this.resolveAccessToken(connection);
      const limit = Math.min(25, Math.max(1, Number(requestedLimit || 10) || 10));
      const list = await this.listMessages(accessToken, limit);
      const syncedIds = this.readSyncedMessageIds(connection.metadata);
      const nextSyncedIds = new Set(syncedIds);
      let imported = 0;

      for (const item of list.messages || []) {
        const messageId = String(item.id || '').trim();
        if (!messageId || nextSyncedIds.has(messageId)) {
          continue;
        }

        const message = await this.getMessage(accessToken, messageId);
        const normalized = this.normalizeGmailMessage(connection, message);
        if (!normalized.content || normalized.from === connection.email) {
          nextSyncedIds.add(messageId);
          continue;
        }

        await this.omnichannel.handleIncomingMessage(normalized);
        nextSyncedIds.add(messageId);
        imported += 1;
      }

      await this.prisma.mailboxConnection.update({
        where: { id: connection.id },
        data: {
          lastSyncAt: new Date(),
          lastErrorAt: null,
          lastError: null,
          metadata: this.mergeSyncMetadata(connection.metadata, Array.from(nextSyncedIds)),
        },
      });

      const seen = list.messages?.length || 0;
      Metrics.mailbox.syncCompleted('gmail', imported, seen, {
        workspace_id: workspaceId,
        status: 'synced',
      });
      return {
        provider: 'gmail',
        status: 'synced',
        email: connection.email,
        imported,
        seen,
      };
    } catch (error: unknown) {
      Metrics.mailbox.syncFailed('gmail', this.metricReason(error), {
        workspace_id: workspaceId,
      });
      throw error;
    }
  }

  async sendMessageFromMailbox(
    workspaceId: string,
    input: {
      toEmail: string;
      subject?: string;
      html?: string;
      proactive?: boolean;
    },
  ) {
    const toEmail = String(input.toEmail || '')
      .trim()
      .toLowerCase();
    if (!toEmail || !toEmail.includes('@')) {
      throw new BadRequestException('gmail_recipient_required');
    }
    if (input.proactive !== false && (await this.isSuppressedRecipient(workspaceId, toEmail))) {
      Metrics.mailbox.sendSuppressed('gmail', { workspace_id: workspaceId });
      return {
        provider: 'gmail',
        status: 'suppressed',
        sent: false,
        toEmail,
        reason: 'recipient_unsubscribed',
      };
    }

    const connection = await this.getActiveGmailConnection(workspaceId);
    if (!connection) {
      Metrics.mailbox.sendFailed('gmail', 'not_connected', { workspace_id: workspaceId });
      return { provider: 'gmail', status: 'not_connected', sent: false };
    }

    const accessToken = await this.resolveAccessToken(connection);
    const subject = String(input.subject || 'Kloel CIA - mensagem de teste')
      .trim()
      .slice(0, 160);
    const baseHtml =
      input.html ||
      '<p>Esta mensagem foi enviada pela CIA usando a caixa Gmail conectada ao workspace.</p>';
    const html =
      input.proactive === false
        ? baseHtml
        : `${baseHtml}${buildUnsubscribeFooterHtml({ email: toEmail })}`;
    const raw = this.buildRawMimeMessage({
      fromEmail: connection.email,
      toEmail,
      subject,
      html,
      proactive: input.proactive !== false,
    });

    const response = await fetch(`${GMAIL_API_BASE}/messages/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(30000),
    });
    const payload = (await response.json().catch(() => ({}))) as GmailSendResponse;
    if (!response.ok || !payload.id) {
      await this.prisma.mailboxConnection.update({
        where: { id: connection.id },
        data: {
          lastErrorAt: new Date(),
          lastError: 'gmail_send_failed',
        },
      });
      Metrics.mailbox.sendFailed('gmail', 'gmail_send_failed', { workspace_id: workspaceId });
      throw new BadRequestException('gmail_send_failed');
    }

    Metrics.mailbox.sendCompleted('gmail', { workspace_id: workspaceId });
    return {
      provider: 'gmail',
      status: 'sent',
      sent: true,
      email: connection.email,
      toEmail,
      messageId: payload.id,
      threadId: payload.threadId || null,
    };
  }

  private metricReason(error: unknown): string {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      if (response && typeof response === 'object' && 'message' in response) {
        const message = response.message;
        return Array.isArray(message) ? String(message[0] || 'bad_request') : String(message);
      }
      return 'bad_request';
    }
    return error instanceof Error ? error.message.slice(0, 80) : 'unknown';
  }

  private async exchangeCode(code: string): Promise<GoogleTokenResponse> {
    const cleanCode = String(code || '').trim();
    if (!cleanCode) {
      throw new BadRequestException('gmail_oauth_code_required');
    }

    const body = new URLSearchParams();
    body.set('client_id', this.requireClientId());
    body.set('client_secret', this.requireClientSecret());
    body.set('code', cleanCode);
    body.set('grant_type', 'authorization_code');
    body.set('redirect_uri', this.resolveRedirectUri());

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

  private async resolveAccessToken(connection: GmailMailboxRecord): Promise<string> {
    const currentAccessToken = decryptMailboxToken(connection.accessToken);
    if (currentAccessToken && this.tokenStillUsable(connection.expiresAt)) {
      return currentAccessToken;
    }

    const refreshToken = decryptMailboxToken(connection.refreshToken);
    if (!refreshToken) {
      throw new BadRequestException('gmail_refresh_token_missing');
    }

    const body = new URLSearchParams();
    body.set('client_id', this.requireClientId());
    body.set('client_secret', this.requireClientSecret());
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

    await this.prisma.mailboxConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: encryptMailboxToken(payload.access_token) ?? null,
        expiresAt: expiresAtFromSeconds(payload.expires_in),
        status: MailboxStatus.ACTIVE,
        lastErrorAt: null as Date | null,
        lastError: null as string | null,
      },
    });

    return payload.access_token;
  }

  private async getActiveGmailConnection(workspaceId: string): Promise<GmailMailboxRecord | null> {
    return this.prisma.mailboxConnection.findFirst({
      where: {
        workspaceId,
        provider: MailboxProvider.GMAIL,
        status: MailboxStatus.ACTIVE,
      },
      orderBy: { connectedAt: 'desc' },
      select: {
        id: true,
        workspaceId: true,
        email: true,
        accessToken: true,
        refreshToken: true,
        expiresAt: true,
        metadata: true,
      },
    });
  }

  private async isSuppressedRecipient(workspaceId: string, email: string): Promise<boolean> {
    const contact = await this.prisma.contact.findFirst({
      where: {
        workspaceId,
        email: { equals: email, mode: 'insensitive' },
        optIn: false,
      },
      select: { id: true, optedOutAt: true },
    });
    return Boolean(contact);
  }

  private tokenStillUsable(expiresAt: Date | null): boolean {
    if (!expiresAt) {
      return true;
    }
    return expiresAt.getTime() - Date.now() > 60_000;
  }

  private async listMessages(accessToken: string, limit: number): Promise<GmailListResponse> {
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

  private async getMessage(accessToken: string, messageId: string): Promise<GmailMessageResponse> {
    const url = new URL(`${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}`);
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

  private normalizeGmailMessage(connection: GmailMailboxRecord, message: GmailMessageResponse) {
    const headers = message.payload?.headers || [];
    const fromRaw = this.readHeader(headers, 'from');
    const subject = this.readHeader(headers, 'subject');
    const parsedFrom = this.parseFromHeader(fromRaw);
    const bodyText = this.extractTextBody(message.payload) || message.snippet || '';

    const externalId = `gmail:${message.id || message.threadId || message.historyId || 'unknown'}`;
    const normalized: NormalizedMessage = {
      workspaceId: connection.workspaceId,
      channel: 'EMAIL' as const,
      externalId,
      from: parsedFrom.email || fromRaw || 'unknown-email',
      content: subject ? `Assunto: ${subject}\n\n${bodyText}` : bodyText,
      metadata: {
        provider: 'gmail',
        mailboxConnectionId: connection.id,
        mailboxEmail: connection.email,
        messageId: message.id || null,
        threadId: message.threadId || null,
        historyId: message.historyId || null,
        subject: subject || null,
      },
    };
    const fromNameVal = parsedFrom.name || parsedFrom.email || fromRaw || undefined;
    if (fromNameVal) {
      normalized.fromName = fromNameVal;
    }
    return normalized;
  }

  private readHeader(headers: Array<{ name?: string; value?: string }>, wanted: string): string {
    const header = headers.find((item) => item.name?.toLowerCase() === wanted.toLowerCase());
    return String(header?.value || '').trim();
  }

  private parseFromHeader(raw: string) {
    const match = raw.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);
    if (match) {
      return {
        name: String(match[1] || '').trim() || null,
        email: String(match[2] || '')
          .trim()
          .toLowerCase(),
      };
    }
    const emailOnly = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return {
      name: null,
      email: emailOnly ? emailOnly[0].toLowerCase() : '',
    };
  }

  private extractTextBody(part: GmailMessagePart | undefined): string {
    if (!part) {
      return '';
    }
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return this.decodeGmailBody(part.body.data);
    }
    for (const child of part.parts || []) {
      const text = this.extractTextBody(child);
      if (text) {
        return text;
      }
    }
    if (part.mimeType === 'text/html' && part.body?.data) {
      return this.decodeGmailBody(part.body.data)
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    return '';
  }

  private decodeGmailBody(data: string): string {
    const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(normalized, 'base64').toString('utf8').trim();
  }

  private buildRawMimeMessage(input: {
    fromEmail: string;
    toEmail: string;
    subject: string;
    html: string;
    proactive: boolean;
  }): string {
    const unsubscribeUrl = `${this.resolveFrontendUrl()}/email/unsubscribe?email=${encodeURIComponent(
      input.toEmail,
    )}`;
    const headers = [
      `From: ${input.fromEmail}`,
      `To: ${input.toEmail}`,
      `Subject: ${this.encodeHeader(input.subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
    ];
    if (input.proactive) {
      headers.push(`List-Unsubscribe: <${unsubscribeUrl}>`);
    }

    return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${input.html}`, 'utf8')
      .toString('base64url')
      .replace(/=+$/, '');
  }

  private encodeHeader(value: string): string {
    if (/^[\x20-\x7E]*$/.test(value)) {
      return value;
    }
    return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
  }

  private resolveFrontendUrl(): string {
    return (
      readConfiguredValue(this.config, ['FRONTEND_URL', 'NEXT_PUBLIC_APP_URL']) ||
      'http://localhost:3000'
    ).replace(/\/+$/, '');
  }

  private readSyncedMessageIds(metadata: Prisma.JsonValue | null): string[] {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return [];
    }
    const ids = metadata.syncedMessageIds;
    if (!Array.isArray(ids)) {
      return [];
    }
    return ids
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 500);
  }

  private mergeSyncMetadata(metadata: Prisma.JsonValue | null, syncedMessageIds: string[]) {
    const base =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
    return {
      ...base,
      syncedMessageIds: syncedMessageIds.slice(-500),
      lastSyncAt: new Date().toISOString(),
    } satisfies Prisma.InputJsonObject;
  }

  private async fetchUserInfo(accessToken: string): Promise<GoogleUserInfoResponse> {
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

  private buildMetadata(token: GoogleTokenResponse, profile: GoogleUserInfoResponse) {
    return {
      scope: token.scope || GMAIL_SCOPES.join(' '),
      tokenType: token.token_type || 'Bearer',
      name: profile.name || null,
      picture: profile.picture || null,
      provider: 'gmail',
      updatedAt: new Date().toISOString(),
    } satisfies Prisma.InputJsonObject;
  }

  private resolveRedirectUri(): string {
    const explicit = readConfiguredValue(this.config, ['GOOGLE_MAILBOX_REDIRECT_URI']);
    if (explicit) {
      return explicit;
    }

    const backendUrl = readConfiguredValue(this.config, [
      'BACKEND_PUBLIC_URL',
      'PUBLIC_API_URL',
      'API_PUBLIC_URL',
    ]);
    if (!backendUrl) {
      throw new ServiceUnavailableException('backend_public_url_not_configured');
    }
    return `${backendUrl.replace(/\/+$/, '')}/marketing/connect/email/gmail/callback`;
  }

  private requireClientId(): string {
    const value = readConfiguredValue(this.config, [
      'GOOGLE_MAILBOX_CLIENT_ID',
      'GOOGLE_CLIENT_ID',
    ]);
    if (!value) {
      throw new ServiceUnavailableException('google_mailbox_client_id_not_configured');
    }
    return value;
  }

  private requireClientSecret(): string {
    const value = readConfiguredValue(this.config, [
      'GOOGLE_MAILBOX_CLIENT_SECRET',
      'GOOGLE_CLIENT_SECRET',
    ]);
    if (!value) {
      throw new ServiceUnavailableException('google_mailbox_client_secret_not_configured');
    }
    return value;
  }

  private readStateSecret(): string {
    const explicit = readConfiguredValue(this.config, [
      'EMAIL_OAUTH_STATE_SECRET',
      'EMAIL_TOKEN_ENCRYPTION_KEY',
      'JWT_SECRET',
    ]);
    if (!explicit) {
      throw new ServiceUnavailableException('email_oauth_state_secret_not_configured');
    }
    return explicit;
  }

  private signState(payload: SignedGmailState): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.readStateSecret())
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${signature}`;
  }

  private verifyState(rawState: string): SignedGmailState | null {
    const [encoded, signature] = String(rawState || '').split('.');
    if (!encoded || !signature) {
      return null;
    }

    const expected = createHmac('sha256', this.readStateSecret())
      .update(encoded)
      .digest('base64url');
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
      ) as Partial<SignedGmailState>;
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
}
