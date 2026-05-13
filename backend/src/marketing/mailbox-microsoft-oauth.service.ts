import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { MailboxProvider, MailboxStatus, Prisma } from '@prisma/client';
import { Metrics } from '../observability/metrics';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildUnsubscribeFooterHtml,
  buildListUnsubscribeHeader,
} from '../common/utils/unsubscribe-footer.util';
import { decryptMailboxToken, encryptMailboxToken } from './mailbox-token-crypto';

const MICROSOFT_AUTH_BASE = 'https://login.microsoftonline.com';
const MICROSOFT_GRAPH_ME_URL = 'https://graph.microsoft.com/v1.0/me';
const MICROSOFT_GRAPH_SEND_URL = 'https://graph.microsoft.com/v1.0/me/sendMail';
const STATE_TTL_MS = 10 * 60 * 1000;

const MICROSOFT_MAILBOX_SCOPES = [
  'openid',
  'email',
  'profile',
  'offline_access',
  'User.Read',
  'Mail.Read',
  'Mail.Send',
  'Mail.ReadWrite',
];

interface SignedMicrosoftState {
  workspaceId: string;
  returnTo: string;
  ts: number;
}

interface MicrosoftTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface MicrosoftProfileResponse {
  id?: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
  error?: {
    message?: string;
  };
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
export class MailboxMicrosoftOAuthService {
  private readonly logger = new Logger(MailboxMicrosoftOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  buildAuthUrl(workspaceId: string, returnTo?: string) {
    const tenantId = this.resolveTenantId();
    const clientId = this.requireClientId();
    const redirectUri = this.resolveRedirectUri();
    const state = this.signState({
      workspaceId,
      returnTo: normalizeReturnTo(returnTo),
      ts: Date.now(),
    });

    const url = new URL(
      `${MICROSOFT_AUTH_BASE}/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize`,
    );
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('scope', MICROSOFT_MAILBOX_SCOPES.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'select_account');

    return {
      provider: 'microsoft',
      status: 'pending_oauth',
      authUrl: url.toString(),
      redirectUri,
      scopes: MICROSOFT_MAILBOX_SCOPES,
    };
  }

  async completeOAuth(workspaceId: string, code: string, state: string) {
    const parsedState = this.verifyState(state);
    if (!parsedState || parsedState.workspaceId !== workspaceId) {
      throw new BadRequestException('invalid_microsoft_oauth_state');
    }

    return this.persistOAuthResult(parsedState, code);
  }

  async completeOAuthCallback(code: string, state: string) {
    const parsedState = this.verifyState(state);
    if (!parsedState) {
      throw new BadRequestException('invalid_microsoft_oauth_state');
    }

    return this.persistOAuthResult(parsedState, code);
  }

  async getPrimaryMicrosoftStatus(workspaceId: string) {
    return this.prisma.mailboxConnection.findFirst({
      where: {
        workspaceId,
        provider: MailboxProvider.MICROSOFT,
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
  }

  private async persistOAuthResult(parsedState: SignedMicrosoftState, code: string) {
    const token = await this.exchangeCode(code);
    if (!token.access_token) {
      throw new BadRequestException('microsoft_token_exchange_failed');
    }
    if (!token.refresh_token) {
      throw new BadRequestException('microsoft_refresh_token_not_granted');
    }

    const profile = await this.fetchProfile(token.access_token);
    const email = String(profile.mail || profile.userPrincipalName || '')
      .trim()
      .toLowerCase();
    if (!email || !email.includes('@')) {
      throw new BadRequestException('microsoft_mailbox_email_not_found');
    }

    const connection = await this.prisma.mailboxConnection.upsert({
      where: {
        workspaceId_provider_email: {
          workspaceId: parsedState.workspaceId,
          provider: MailboxProvider.MICROSOFT,
          email,
        },
      },
      create: {
        workspaceId: parsedState.workspaceId,
        provider: MailboxProvider.MICROSOFT,
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

    Metrics.mailbox.connected('microsoft', { workspace_id: parsedState.workspaceId });

    return {
      connected: true,
      provider: 'microsoft',
      status: 'connected',
      email: connection.email,
      connectionId: connection.id,
      returnTo: parsedState.returnTo,
      expiresAt: connection.expiresAt,
    };
  }

  private async exchangeCode(code: string): Promise<MicrosoftTokenResponse> {
    const cleanCode = String(code || '').trim();
    if (!cleanCode) {
      throw new BadRequestException('microsoft_oauth_code_required');
    }

    const body = new URLSearchParams();
    body.set('client_id', this.requireClientId());
    body.set('client_secret', this.requireClientSecret());
    body.set('code', cleanCode);
    body.set('grant_type', 'authorization_code');
    body.set('redirect_uri', this.resolveRedirectUri());

    const response = await fetch(this.resolveTokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(30000),
    });
    const payload = (await response.json().catch(() => ({}))) as MicrosoftTokenResponse;
    if (!response.ok) {
      this.logger.warn(
        `Microsoft OAuth token exchange failed: status=${response.status} error=${payload.error || 'unknown'}`,
      );
      throw new BadRequestException('microsoft_token_exchange_failed');
    }

    return payload;
  }

  private async fetchProfile(accessToken: string): Promise<MicrosoftProfileResponse> {
    const response = await fetch(MICROSOFT_GRAPH_ME_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    const payload = (await response.json().catch(() => ({}))) as MicrosoftProfileResponse;
    if (!response.ok) {
      this.logger.warn(
        `Microsoft profile lookup failed: status=${response.status} message=${payload.error?.message || 'unknown'}`,
      );
      throw new BadRequestException('microsoft_profile_lookup_failed');
    }
    return payload;
  }

  private buildMetadata(token: MicrosoftTokenResponse, profile: MicrosoftProfileResponse) {
    return {
      scope: token.scope || MICROSOFT_MAILBOX_SCOPES.join(' '),
      tokenType: token.token_type || 'Bearer',
      displayName: profile.displayName || null,
      provider: 'microsoft',
      updatedAt: new Date().toISOString(),
    } satisfies Prisma.InputJsonObject;
  }

  private resolveRedirectUri(): string {
    const explicit = readConfiguredValue(this.config, ['MICROSOFT_MAILBOX_REDIRECT_URI']);
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
    return `${backendUrl.replace(/\/+$/, '')}/marketing/connect/email/microsoft/callback`;
  }

  private resolveTenantId(): string {
    return readConfiguredValue(this.config, ['MICROSOFT_TENANT_ID']) || 'common';
  }

  private resolveTokenUrl(): string {
    return `${MICROSOFT_AUTH_BASE}/${encodeURIComponent(this.resolveTenantId())}/oauth2/v2.0/token`;
  }

  private requireClientId(): string {
    const value = readConfiguredValue(this.config, [
      'MICROSOFT_MAILBOX_CLIENT_ID',
      'MICROSOFT_CLIENT_ID',
    ]);
    if (!value) {
      throw new ServiceUnavailableException('microsoft_mailbox_client_id_not_configured');
    }
    return value;
  }

  private requireClientSecret(): string {
    const value = readConfiguredValue(this.config, [
      'MICROSOFT_MAILBOX_CLIENT_SECRET',
      'MICROSOFT_CLIENT_SECRET',
    ]);
    if (!value) {
      throw new ServiceUnavailableException('microsoft_mailbox_client_secret_not_configured');
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

  private signState(payload: SignedMicrosoftState): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.readStateSecret())
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${signature}`;
  }

  private verifyState(rawState: string): SignedMicrosoftState | null {
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
      throw new BadRequestException('microsoft_recipient_required');
    }
    if (input.proactive !== false && (await this.isSuppressedRecipient(workspaceId, toEmail))) {
      Metrics.mailbox.sendSuppressed('microsoft', { workspace_id: workspaceId });
      return {
        provider: 'microsoft',
        status: 'suppressed',
        sent: false,
        toEmail,
        reason: 'recipient_unsubscribed',
      };
    }

    const connection = await this.getActiveMicrosoftConnection(workspaceId);
    if (!connection) {
      Metrics.mailbox.sendFailed('microsoft', 'not_connected', {
        workspace_id: workspaceId,
      });
      return { provider: 'microsoft', status: 'not_connected', sent: false };
    }

    const accessToken = await this.resolveMicrosoftAccessToken(connection);
    const subject = String(input.subject || 'Kloel CIA - mensagem de teste')
      .trim()
      .slice(0, 160);
    const baseHtml =
      input.html ||
      '<p>Esta mensagem foi enviada pela CIA usando a caixa Microsoft conectada ao workspace.</p>';
    const html =
      input.proactive === false
        ? baseHtml
        : `${baseHtml}${buildUnsubscribeFooterHtml({ email: toEmail })}`;
    const proactive = input.proactive !== false;

    const messagePayload: Record<string, unknown> = {
      subject,
      body: { contentType: 'HTML', content: html },
      toRecipients: [{ emailAddress: { address: toEmail } }],
    };

    if (proactive) {
      const listUnsubscribe = buildListUnsubscribeHeader({ email: toEmail });
      messagePayload.internetMessageHeaders = [
        { name: 'List-Unsubscribe', value: listUnsubscribe },
      ];
    }

    const response = await fetch(MICROSOFT_GRAPH_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: messagePayload,
        saveToSentItems: true,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      this.logger.warn(
        `Microsoft sendMail failed: status=${response.status} body=${errorBody.slice(0, 200)}`,
      );
      await this.prisma.mailboxConnection.update({
        where: { id: connection.id },
        data: {
          lastErrorAt: new Date(),
          lastError: 'microsoft_send_failed',
        },
      });
      Metrics.mailbox.sendFailed('microsoft', 'microsoft_send_failed', {
        workspace_id: workspaceId,
      });
      throw new BadRequestException('microsoft_send_failed');
    }

    Metrics.mailbox.sendCompleted('microsoft', { workspace_id: workspaceId });
    return {
      provider: 'microsoft',
      status: 'sent',
      sent: true,
      email: connection.email,
      toEmail,
      messageId: `graph:${Date.now()}`,
    };
  }

  private async getActiveMicrosoftConnection(workspaceId: string) {
    return this.prisma.mailboxConnection.findFirst({
      where: {
        workspaceId,
        provider: MailboxProvider.MICROSOFT,
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

  private async resolveMicrosoftAccessToken(
    connection: NonNullable<
      Awaited<ReturnType<MailboxMicrosoftOAuthService['getActiveMicrosoftConnection']>>
    >,
  ): Promise<string> {
    const currentAccessToken = decryptMailboxToken(connection.accessToken);
    if (currentAccessToken && this.tokenStillUsable(connection.expiresAt)) {
      return currentAccessToken;
    }

    const refreshToken = decryptMailboxToken(connection.refreshToken);
    if (!refreshToken) {
      throw new BadRequestException('microsoft_refresh_token_missing');
    }

    const body = new URLSearchParams();
    body.set('client_id', this.requireClientId());
    body.set('client_secret', this.requireClientSecret());
    body.set('refresh_token', refreshToken);
    body.set('grant_type', 'refresh_token');

    const response = await fetch(this.resolveTokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(30000),
    });
    const payload = (await response.json().catch(() => ({}))) as MicrosoftTokenResponse;
    if (!response.ok || !payload.access_token) {
      await this.prisma.mailboxConnection.update({
        where: { id: connection.id },
        data: {
          status: MailboxStatus.ERROR,
          lastErrorAt: new Date(),
          lastError: 'microsoft_refresh_failed',
        },
      });
      throw new BadRequestException('microsoft_refresh_failed');
    }

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

  private tokenStillUsable(expiresAt: Date | null): boolean {
    if (!expiresAt) {
      return true;
    }
    return expiresAt.getTime() - Date.now() > 60_000;
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
}
