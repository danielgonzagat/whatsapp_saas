import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { OmnichannelService, type NormalizedMessage } from '../inbox/omnichannel.service';
import type { MessageAttachment } from '../inbox/omnichannel.helpers';
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

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripHtml(raw: string): string {
  let text = '';
  let insideTag = false;
  for (const char of raw) {
    if (char === '<') {
      insideTag = true;
      continue;
    }
    if (char === '>') {
      insideTag = false;
      continue;
    }
    if (!insideTag) {
      text += char;
    }
  }
  return decodeHtmlEntities(text).trim();
}

function normalizeAttachments(attachments: InboundEmailAttachment[]): MessageAttachment[] {
  return attachments.map((att) => ({
    name: att.filename || 'attachment',
    mimeType: att.mimeType || 'application/octet-stream',
    ...(att.contentBase64 !== undefined ? { base64: att.contentBase64 } : {}),
    ...(att.url !== undefined ? { url: att.url } : {}),
  }));
}

function buildEmailContent(email: InboundEmail): string {
  const subjectLine = email.subject ? `Assunto: ${email.subject}` : 'Sem assunto';
  const body = email.bodyText || (email.bodyHtml ? stripHtml(email.bodyHtml) : '');
  if (!body) return subjectLine;
  return `${subjectLine}\n\n${body}`;
}

function maskEmail(value?: string): string | undefined {
  if (!value) {
    return value;
  }
  const parts = value.split('@');
  const local = parts[0];
  const domain = parts[1];
  if (!local || !domain) {
    return '***';
  }
  return `${local.slice(0, 2)}***@${domain}`;
}

function resolveWorkspaceAlias(to: string): { workspaceId: string; username: string } | null {
  const matched = to.match(/^inbox(?:\+([a-zA-Z0-9_-]+))?@/);
  if (!matched) return null;
  const username = matched[1] || 'default';
  return { workspaceId: username, username };
}

@Injectable()
export class EmailInboundService {
  private readonly logger = new Logger(EmailInboundService.name);

  constructor(
    private readonly omnichannel: OmnichannelService,
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
    this.logger.log({
      operation: 'email.inbound.process',
      status: 'started',
      workspaceId,
      provider: this.getProvider(),
      externalId: email.messageId ?? null,
      from: maskEmail(email.from),
      to: maskEmail(email.to),
    });

    const content = buildEmailContent(email);
    const attachments = email.attachments?.length
      ? normalizeAttachments(email.attachments)
      : undefined;

    await this.ensureContactEmailSet(workspaceId, email.from, email.fromName);

    const normalized: NormalizedMessage = {
      workspaceId,
      channel: 'EMAIL',
      externalId: email.messageId?.trim() || `email_${randomUUID()}`,
      from: email.from,
      ...(email.fromName !== undefined ? { fromName: email.fromName } : {}),
      content,
      ...(attachments !== undefined ? { attachments } : {}),
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
      this.logger.error({
        operation: 'email.inbound.process',
        status: 'failed',
        workspaceId,
        provider: this.getProvider(),
        errorCode: wrapped.name,
      });
      throw wrapped;
    }
  }

  async resolveWorkspaceIdForRecipient(to: string): Promise<string | null> {
    const resolved = resolveWorkspaceAlias(to);
    if (!resolved) {
      this.logger.warn({
        operation: 'email.inbound.resolve',
        status: 'failed',
        reason: 'unknown_workspace',
        recipient: maskEmail(to),
      });
      return null;
    }

    const domain = to.split('@')[1] || '';
    try {
      const match = await this.prisma.workspace.findFirst({
        where: {
          OR: [{ ...(domain ? { customDomain: domain } : {}) }, { id: resolved.workspaceId }],
        },
        select: { id: true },
      });

      if (match) {
        return match.id;
      }

      if (resolved.username === 'default') {
        return resolved.workspaceId;
      }

      this.logger.warn({
        operation: 'email.inbound.lookup',
        status: 'failed',
        reason: 'workspace_not_found',
        username: resolved.username,
      });
      return null;
    } catch (err: unknown) {
      this.logger.warn({
        operation: 'email.inbound.lookup',
        status: 'failed',
        reason: 'workspace_lookup_failed',
        errorCode: err instanceof Error ? err.name : 'unknown',
      });
      return null;
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
        const updates: Prisma.ContactUpdateManyMutationInput = {};
        if (!existing.email) {
          updates.email = emailAddress;
        }
        if (!existing.name && name) {
          updates.name = name;
        }
        if (Object.keys(updates).length > 0) {
          await this.prisma.contact.updateMany({
            where: { id: existing.id, workspaceId },
            data: updates,
          });
        }
      }
    } catch (err: unknown) {
      this.logger.warn({
        operation: 'email.inbound.enrich_contact',
        status: 'failed',
        contact: maskEmail(emailAddress),
        errorCode: err instanceof Error ? err.message : 'unknown',
      });
    }
  }
}
