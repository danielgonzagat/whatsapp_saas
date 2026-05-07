import { Injectable, Logger } from '@nestjs/common';
import { OmnichannelService, type NormalizedMessage } from '../inbox/omnichannel.service';
import type { MessageAttachment } from '../inbox/omnichannel.helpers';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { ensureError } from '../inbox/omnichannel.helpers';

export interface InboundEmail {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: InboundEmailAttachment[];
  messageId?: string;
  timestamp?: number;
}

export interface InboundEmailAttachment {
  filename?: string;
  contentBase64?: string;
  mimeType?: string;
  url?: string;
}

function stripHtml(raw: string): string {
  let previous: string;
  let current = raw;
  do {
    previous = current;
    current = current.replace(/<[^>]*>/g, '');
  } while (current !== previous);
  return current
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function normalizeAttachments(attachments: InboundEmailAttachment[]): MessageAttachment[] {
  return attachments.map((att) => ({
    name: att.filename || 'attachment',
    mimeType: att.mimeType || 'application/octet-stream',
    base64: att.contentBase64,
    url: att.url,
  }));
}

function buildEmailContent(email: InboundEmail): string {
  const subjectLine = email.subject ? `Assunto: ${email.subject}` : 'Sem assunto';
  const body = email.bodyText || (email.bodyHtml ? stripHtml(email.bodyHtml) : '');
  if (!body) return subjectLine;
  return `${subjectLine}\n\n${body}`;
}

@Injectable()
export class EmailInboundService {
  private readonly logger = new Logger(EmailInboundService.name);

  constructor(
    private readonly omnichannel: OmnichannelService,
    private readonly inbox: InboxService,
    private readonly prisma: PrismaService,
  ) {}

  isConfigured(): boolean {
    return Boolean(process.env.EMAIL_INBOUND_SECRET?.trim());
  }

  getProvider(): string | null {
    return process.env.EMAIL_INBOUND_PROVIDER?.trim() || null;
  }

  async processInboundEmail(
    workspaceId: string,
    email: InboundEmail,
  ): Promise<{ status: string; messageId?: string }> {
    this.logger.log(`[EMAIL] Inbound from ${email.from} to ${email.to} — "${email.subject}"`);

    const content = buildEmailContent(email);
    const attachments = email.attachments?.length
      ? normalizeAttachments(email.attachments)
      : undefined;

    await this.ensureContactEmailSet(workspaceId, email.from, email.fromName);

    const normalized: NormalizedMessage = {
      workspaceId,
      channel: 'EMAIL',
      externalId: email.messageId || `email_${Date.now()}`,
      from: email.from,
      fromName: email.fromName,
      content,
      attachments,
      metadata: {
        subject: email.subject,
        to: email.to,
        messageId: email.messageId,
        timestamp: email.timestamp || Date.now(),
      },
    };

    try {
      const saved = await this.omnichannel.handleIncomingMessage(normalized);
      return { status: 'saved', messageId: saved.id };
    } catch (err: unknown) {
      const wrapped = ensureError(err);
      this.logger.error(`[EMAIL] Failed to process inbound email: ${wrapped.message}`);
      throw wrapped;
    }
  }

  private async ensureContactEmailSet(
    workspaceId: string,
    emailAddress: string,
    name?: string,
  ): Promise<void> {
    try {
      const existing = await this.prisma.contact.findUnique({
        where: { workspaceId_phone: { workspaceId, phone: emailAddress } },
        select: { id: true, email: true, name: true },
      });

      if (existing) {
        const updates: Record<string, unknown> = {};
        if (!existing.email) {
          updates.email = emailAddress;
        }
        if (!existing.name && name) {
          updates.name = name;
        }
        if (Object.keys(updates).length > 0) {
          await this.prisma.contact.update({
            where: { id: existing.id },
            data: updates,
          });
        }
      }
    } catch (err: unknown) {
      this.logger.warn(
        `[EMAIL] Failed to enrich contact ${emailAddress}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
    }
  }
}
