import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { MailboxProvider, MailboxStatus } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Metrics } from '../observability/metrics';
import { GOOGLE_AUTH_URL, GMAIL_SCOPES } from './mailbox-gmail-oauth/constants';
import {
  requireClientId,
  resolveRedirectUri,
  readStateSecret,
} from './mailbox-gmail-oauth/config-resolver';
import {
  normalizeReturnTo,
  signState,
  verifyState,
} from './mailbox-gmail-oauth/oauth-state';
import { GmailOAuthHandshakeService } from './mailbox-gmail-oauth/oauth-handshake.service';
import { GmailSyncService } from './mailbox-gmail-oauth/sync.service';
import { GmailSendService } from './mailbox-gmail-oauth/send.service';

@Injectable()
export class MailboxGmailOAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly handshake: GmailOAuthHandshakeService,
    private readonly syncService: GmailSyncService,
    private readonly sendService: GmailSendService,
  ) {}

  buildAuthUrl(workspaceId: string, returnTo?: string) {
    const clientId = requireClientId(this.config);
    const redirectUri = resolveRedirectUri(this.config);
    const state = signState(
      {
        workspaceId,
        returnTo: normalizeReturnTo(returnTo),
        ts: Date.now(),
      },
      readStateSecret(this.config),
    );

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
    const parsedState = verifyState(state, readStateSecret(this.config));
    if (!parsedState || parsedState.workspaceId !== workspaceId) {
      throw new BadRequestException('invalid_gmail_oauth_state');
    }

    return this.handshake.persistOAuthResult(parsedState, code);
  }

  async completeOAuthCallback(code: string, state: string) {
    const parsedState = verifyState(state, readStateSecret(this.config));
    if (!parsedState) {
      throw new BadRequestException('invalid_gmail_oauth_state');
    }

    return this.handshake.persistOAuthResult(parsedState, code);
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

    return this.syncService.syncLatestInbox(connection, requestedLimit);
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
    return this.sendService.sendMessageFromMailbox(workspaceId, input);
  }
}
