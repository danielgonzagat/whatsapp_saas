/**
 * EmailDispatchAdapter — implements `ChannelDispatchPort` for the Email
 * channel. Resolves the workspace's connected mailbox (Gmail / Microsoft
 * / IMAP-SMTP) and delegates to the matching `sendMessageFromMailbox`
 * implementation.
 *
 * Per ADR-0012 OmniCore Wave W1. The 3 mailbox services already implement
 * the same `sendMessageFromMailbox(workspaceId, input)` shape; this adapter
 * tries them in priority order (Gmail → Microsoft → IMAP-SMTP) and surfaces
 * the first successful send. Workspaces typically have a single mailbox
 * connection, so only one is invoked in practice.
 *
 * @cluster Marketing/Channels/Email
 * @see backend/src/common/channel-dispatch/channel-dispatch.port.ts
 * @see docs/adr/0012-kloel-omnicore-channel-unification.md
 */
import { Injectable, Optional } from '@nestjs/common';
import {
  ChannelDispatchPort,
  ChannelKind,
  ChannelSendInput,
  ChannelSendResult,
} from '../../../common/channel-dispatch/channel-dispatch.port';
import { MailboxGmailOAuthService } from '../../mailbox-gmail-oauth.service';
import { MailboxImapSmtpService } from '../../mailbox-imap-smtp.service';
import { MailboxMicrosoftOAuthService } from '../../mailbox-microsoft-oauth.service';

interface MailboxSendResult {
  ok?: boolean;
  status?: string;
  externalId?: string;
  messageId?: string;
  id?: string;
  error?: string;
  reason?: string;
}

@Injectable()
export class EmailDispatchAdapter implements ChannelDispatchPort {
  readonly channelKind = ChannelKind.EMAIL;

  constructor(
    @Optional() private readonly gmail: MailboxGmailOAuthService | null = null,
    @Optional() private readonly microsoft: MailboxMicrosoftOAuthService | null = null,
    @Optional() private readonly imapSmtp: MailboxImapSmtpService | null = null,
  ) {}

  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    if (input.channelKind !== ChannelKind.EMAIL) {
      return { success: false, error: 'wrong channel kind' };
    }
    const payload = {
      toEmail: input.toEmail,
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.html !== undefined ? { html: input.html } : {}),
      ...(input.proactive !== undefined ? { proactive: input.proactive } : {}),
    };

    for (const candidate of this.providersInOrder()) {
      const result = await this.tryProvider(candidate.label, candidate.send, input.workspaceId, payload);
      if (result) {return result;}
    }
    return {
      success: false,
      provider: 'email',
      error: 'no mailbox provider connected for workspace',
    };
  }

  isConfigured(): boolean {
    return Boolean(this.gmail || this.microsoft || this.imapSmtp);
  }

  private providersInOrder(): Array<{
    label: string;
    send: ((
      workspaceId: string,
      payload: { toEmail: string; subject?: string; html?: string; proactive?: boolean },
    ) => Promise<unknown>) | null;
  }> {
    return [
      {
        label: 'gmail',
        send: this.gmail
          ? (ws, p) => this.gmail!.sendMessageFromMailbox(ws, p)
          : null,
      },
      {
        label: 'microsoft',
        send: this.microsoft
          ? (ws, p) => this.microsoft!.sendMessageFromMailbox(ws, p)
          : null,
      },
      {
        label: 'imap-smtp',
        send: this.imapSmtp
          ? (ws, p) => this.imapSmtp!.sendMessageFromMailbox(ws, p)
          : null,
      },
    ];
  }

  private async tryProvider(
    label: string,
    send: ((
      workspaceId: string,
      payload: { toEmail: string; subject?: string; html?: string; proactive?: boolean },
    ) => Promise<unknown>) | null,
    workspaceId: string,
    payload: { toEmail: string; subject?: string; html?: string; proactive?: boolean },
  ): Promise<ChannelSendResult | null> {
    if (!send) {return null;}
    try {
      const raw = (await send(workspaceId, payload)) as MailboxSendResult | null;
      if (!raw) {
        return { success: false, provider: `email-${label}`, error: 'no_result' };
      }
      if (raw.status === 'not_connected') {
        return null;
      }
      if (raw.error || raw.ok === false) {
        return {
          success: false,
          provider: `email-${label}`,
          error: raw.error || raw.reason || 'send_failed',
        };
      }
      const messageId = raw.messageId || raw.externalId || raw.id;
      return {
        success: true,
        provider: `email-${label}`,
        delivery: 'direct',
        ...(messageId ? { messageId, externalId: messageId } : {}),
      };
    } catch (error) {
      return {
        success: false,
        provider: `email-${label}`,
        error: error instanceof Error ? error.message : 'email_send_failed',
      };
    }
  }
}
