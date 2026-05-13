import { BadRequestException, Injectable } from '@nestjs/common';
import { MailboxProvider, MailboxStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { Metrics } from '../../observability/metrics';
import { PrismaService } from '../../prisma/prisma.service';
import { buildUnsubscribeFooterHtml } from '../../common/utils/unsubscribe-footer.util';
import { GmailClientService } from './gmail-client.service';
import { buildRawMimeMessage } from './mime-builder';
import { GMAIL_API_BASE } from './constants';
import type { GmailMailboxRecord, GmailSendResponse } from './types';

@Injectable()
export class GmailSendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly gmailClient: GmailClientService,
  ) {}

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
    if (
      input.proactive !== false &&
      (await this.isSuppressedRecipient(workspaceId, toEmail))
    ) {
      Metrics.mailbox.sendSuppressed('gmail', { workspace_id: workspaceId });
      return {
        provider: 'gmail',
        status: 'suppressed',
        sent: false,
        toEmail,
        reason: 'recipient_unsubscribed',
      };
    }

    const connection =
      await this.getActiveGmailConnection(workspaceId);
    if (!connection) {
      Metrics.mailbox.sendFailed('gmail', 'not_connected', {
        workspace_id: workspaceId,
      });
      return { provider: 'gmail', status: 'not_connected', sent: false };
    }

    const accessToken =
      await this.gmailClient.resolveAccessToken(connection);
    const subject = String(
      input.subject || 'Kloel CIA - mensagem de teste',
    )
      .trim()
      .slice(0, 160);
    const baseHtml =
      input.html ||
      '<p>Esta mensagem foi enviada pela CIA usando a caixa Gmail conectada ao workspace.</p>';
    const html =
      input.proactive === false
        ? baseHtml
        : `${baseHtml}${buildUnsubscribeFooterHtml({ email: toEmail })}`;
    const raw = buildRawMimeMessage(
      {
        fromEmail: connection.email,
        toEmail,
        subject,
        html,
        proactive: input.proactive !== false,
      },
      this.config,
    );

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
      Metrics.mailbox.sendFailed('gmail', 'gmail_send_failed', {
        workspace_id: workspaceId,
      });
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

  private async getActiveGmailConnection(
    workspaceId: string,
  ): Promise<GmailMailboxRecord | null> {
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

  private async isSuppressedRecipient(
    workspaceId: string,
    email: string,
  ): Promise<boolean> {
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
