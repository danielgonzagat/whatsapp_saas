import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailboxProvider, MailboxStatus } from '@prisma/client';
import { Metrics } from '../observability/metrics';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildUnsubscribeFooterHtml,
  buildListUnsubscribeHeader,
} from '../common/utils/unsubscribe-footer.util';
import {
  expiresAtFromSeconds,
  MICROSOFT_AUTH_BASE,
  MICROSOFT_GRAPH_ME_URL,
  MICROSOFT_GRAPH_SEND_URL,
  MICROSOFT_MAILBOX_SCOPES,
  MicrosoftProfileResponse,
  MicrosoftTokenResponse,
  buildMicrosoftMailboxMetadata,
  normalizeReturnTo,
  readMicrosoftStateSecret,
  requireMicrosoftClientId,
  requireMicrosoftClientSecret,
  resolveMicrosoftAccessToken,
  resolveMicrosoftRedirectUri,
  resolveMicrosoftTenantId,
  SignedMicrosoftState,
  signMicrosoftState,
  verifyMicrosoftState,
} from './mailbox-microsoft-oauth.helpers';
import { encryptMailboxToken } from './mailbox-token-crypto';

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
        metadata: buildMicrosoftMailboxMetadata(token, profile),
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
        metadata: buildMicrosoftMailboxMetadata(token, profile),
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

  private resolveRedirectUri(): string {
    return resolveMicrosoftRedirectUri(this.config);
  }

  private resolveTenantId(): string {
    return resolveMicrosoftTenantId(this.config);
  }

  private resolveTokenUrl(): string {
    return `${MICROSOFT_AUTH_BASE}/${encodeURIComponent(this.resolveTenantId())}/oauth2/v2.0/token`;
  }

  private requireClientId(): string {
    return requireMicrosoftClientId(this.config);
  }

  private requireClientSecret(): string {
    return requireMicrosoftClientSecret(this.config);
  }

  private readStateSecret(): string {
    return readMicrosoftStateSecret(this.config);
  }

  private signState(payload: SignedMicrosoftState): string {
    return signMicrosoftState(payload, this.readStateSecret());
  }

  private verifyState(rawState: string): SignedMicrosoftState | null {
    return verifyMicrosoftState(rawState, this.readStateSecret());
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

    const accessToken = await resolveMicrosoftAccessToken({
      connection,
      prisma: this.prisma,
      clientId: this.requireClientId(),
      clientSecret: this.requireClientSecret(),
      tokenUrl: this.resolveTokenUrl(),
    });
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
