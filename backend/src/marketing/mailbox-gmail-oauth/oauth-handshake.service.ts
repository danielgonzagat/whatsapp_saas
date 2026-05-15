import { BadRequestException, Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { MailboxProvider, MailboxStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Metrics } from '../../observability/metrics';
import { encryptMailboxToken } from '../mailbox-token-crypto';
import { GmailClientService } from './gmail-client.service';
import { buildMetadata } from './metadata-helpers';
import { expiresAtFromSeconds } from './oauth-state';
import type { SignedGmailState } from './types';

@Injectable()
export class GmailOAuthHandshakeService {
  private readonly logger = StructuredLogger.from(GmailOAuthHandshakeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gmailClient: GmailClientService,
  ) {
    this.logger.debug?.(`GmailOAuthHandshakeService initialized`);
  }

  async persistOAuthResult(parsedState: SignedGmailState, code: string) {
    const token = await this.gmailClient.exchangeCode(code);
    if (!token.access_token) {
      throw new BadRequestException('gmail_token_exchange_failed');
    }
    if (!token.refresh_token) {
      throw new BadRequestException('gmail_refresh_token_not_granted');
    }

    const profile = await this.gmailClient.fetchUserInfo(token.access_token);
    const email = String(profile.email || '')
      .trim()
      .toLowerCase();
    if (!email || profile.verified_email === false) {
      throw new BadRequestException('gmail_email_not_verified');
    }

    const connectionData = {
      status: MailboxStatus.ACTIVE,
      providerAccountId: profile.id || null,
      accessToken: encryptMailboxToken(token.access_token) ?? null,
      refreshToken: encryptMailboxToken(token.refresh_token) ?? null,
      expiresAt: expiresAtFromSeconds(token.expires_in),
      connectedAt: new Date(),
      disconnectedAt: null as Date | null,
      lastErrorAt: null as Date | null,
      lastError: null as string | null,
      metadata: buildMetadata(token, profile),
    };

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
        ...connectionData,
      },
      update: connectionData,
      select: {
        id: true,
        provider: true,
        email: true,
        status: true,
        connectedAt: true,
        expiresAt: true,
      },
    });

    Metrics.mailbox.connected('gmail', {
      workspace_id: parsedState.workspaceId,
    });

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
}
