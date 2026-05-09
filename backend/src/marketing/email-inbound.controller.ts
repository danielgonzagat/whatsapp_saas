import {
  Body,
  Controller,
  Get,
  HttpCode,
  ForbiddenException,
  Logger,
  Optional,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { OmnichannelService } from '../inbox/omnichannel.service';
import { ensureError, type NormalizedMessage } from '../inbox/omnichannel.helpers';
import { PrismaService } from '../prisma/prisma.service';

function decodeHtmlEntities(raw: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&#39;': "'",
    '&gt;': '>',
    '&lt;': '<',
    '&quot;': '"',
  };
  return raw.replace(/&(amp|gt|lt|quot|#39);/g, (entity) => entities[entity] ?? entity);
}

function stripHtml(raw: string): string {
  let text = '';
  let insideTag = false;
  let lastWasWhitespace = false;
  for (const char of raw) {
    if (char === '<') {
      insideTag = true;
      continue;
    }
    if (char === '>') {
      insideTag = false;
      continue;
    }
    if (insideTag) {
      continue;
    }
    const isWhitespace = char === ' ' || char === '\n' || char === '\r' || char === '\t';
    if (isWhitespace) {
      if (!lastWasWhitespace) {
        text += ' ';
      }
      lastWasWhitespace = true;
      continue;
    }
    text += char;
    lastWasWhitespace = false;
  }
  return decodeHtmlEntities(text).trim();
}

function redactEmailAddress(value: string): string {
  const [local, domain] = value.trim().split('@');
  if (!local || !domain) {
    return '***';
  }
  return `${local.slice(0, 2)}***@${domain}`;
}

function verifyEmailInboundSecret(req: Request): boolean {
  const expected = process.env.EMAIL_INBOUND_SECRET?.trim();
  if (!expected) {
    return false;
  }
  const header = req.headers['x-email-inbound-secret'];
  const actual = Array.isArray(header) ? header[0] : header;
  if (!actual) {
    return false;
  }
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function safeMetadataSummary(body: Record<string, unknown>): Record<string, unknown> {
  return {
    hasHtml: typeof body.html === 'string' && body.html.length > 0,
    hasText:
      (typeof body.text === 'string' && body.text.length > 0) ||
      (typeof body.plain === 'string' && body.plain.length > 0),
    hasAttachments: Object.keys(body).some((key) => key.toLowerCase().includes('attachment')),
    providerFields: Object.keys(body)
      .filter((key) =>
        ['from', 'to', 'recipient', 'sender', 'subject', 'message_id', 'Message-Id'].includes(key),
      )
      .sort(),
  };
}

function bodyString(req: Request, ...keys: string[]): string {
  for (const key of keys) {
    const value = req.body?.[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function parseForwardedEmailHeaders(req: Request) {
  const textBody = decodeHtmlEntities(bodyString(req, 'text', 'plain'));
  const htmlBody = bodyString(req, 'html');

  return {
    from: bodyString(req, 'from', 'sender'),
    to: bodyString(req, 'to', 'recipient'),
    subject: bodyString(req, 'subject'),
    content: textBody || stripHtml(htmlBody),
    messageId: bodyString(req, 'message_id', 'Message-Id'),
    inReplyTo: bodyString(req, 'in_reply_to', 'In-Reply-To'),
  };
}

function resolveWorkspaceFromRecipient(
  to: string,
): { workspaceId: string; username: string } | null {
  const matched = to.match(/^inbox(?:\+([a-zA-Z0-9_-]+))?@/);
  if (!matched) return null;
  const username = matched[1] || 'default';
  return { workspaceId: username, username };
}

/**
 * Email inbound webhook — compatible with SendGrid Inbound Parse.
 *
 * Production path requires:
 *   1. `EMAIL_INBOUND_ENABLED=true` env var
 *   2. MX record pointing to SendGrid Inbound Parse
 *   3. SendGrid configured with this webhook URL
 *
 * Without these, returns an honest `setup_required` status.
 */
@Controller('webhooks/email-inbound')
@UseGuards(ThrottlerGuard)
export class EmailInboundController {
  private readonly logger = new Logger(EmailInboundController.name);

  constructor(
    @Optional() private readonly omnichannel?: OmnichannelService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  @Public()
  @Get()
  getStatus() {
    return {
      ok: true,
      provider: 'email',
      callbackUrl: '/webhooks/email-inbound',
      accepts: 'POST (multipart/form-data, SendGrid Inbound Parse format)',
      enabled: process.env.EMAIL_INBOUND_ENABLED === 'true',
    };
  }

  @Public()
  @Post()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @HttpCode(200)
  async handleInbound(@Body() body: Record<string, unknown>, @Req() req: Request) {
    if (process.env.EMAIL_INBOUND_ENABLED !== 'true') {
      return {
        received: true,
        setup_required: true,
        message:
          'Email inbound is not enabled. Set EMAIL_INBOUND_ENABLED=true and configure SendGrid Inbound Parse MX records.',
      };
    }

    if (!verifyEmailInboundSecret(req)) {
      this.logger.warn({
        operation: 'email.inbound.auth',
        status: 'failed',
        reason: 'invalid_secret',
      });
      throw new ForbiddenException('email_inbound_forbidden');
    }

    const { from, to, subject, content, messageId, inReplyTo } = parseForwardedEmailHeaders(req);

    if (!from || !content) {
      return { received: true, skipped: true, reason: 'empty_email' };
    }

    const resolved = resolveWorkspaceFromRecipient(to);
    if (!resolved) {
      this.logger.warn({
        operation: 'email.inbound.resolve',
        status: 'failed',
        reason: 'unknown_workspace',
        recipient: redactEmailAddress(to),
      });
      return { received: true, skipped: true, reason: 'unknown_workspace' };
    }

    let workspaceId = resolved.workspaceId;

    try {
      const domain = to.split('@')[1] || '';
      const match = await this.prisma?.workspace.findFirst({
        where: {
          OR: [{ customDomain: domain || undefined }],
        },
        select: { id: true },
      });

      if (!match && resolved.username !== 'default') {
        this.logger.warn({
          operation: 'email.inbound.lookup',
          status: 'failed',
          reason: 'workspace_not_found',
          username: resolved.username,
        });
        return { received: true, skipped: true, reason: 'workspace_not_found' };
      }

      if (match) {
        workspaceId = match.id;
      }
    } catch {
      return { received: true, skipped: true, reason: 'workspace_lookup_failed' };
    }

    const normalized: NormalizedMessage = {
      workspaceId,
      channel: 'EMAIL',
      externalId: messageId || `email:${randomUUID()}`,
      from,
      fromName: from.split('<')[0]?.trim() || from,
      content: subject ? `[${subject}] ${content}` : content,
      metadata: {
        to: redactEmailAddress(to),
        subject,
        messageId,
        inReplyTo,
        raw: safeMetadataSummary(body),
      },
    };

    try {
      const result = await this.omnichannel?.handleIncomingMessage(normalized);
      return { received: true, messageId: (result as { id?: string })?.id };
    } catch (err: unknown) {
      const wrapped = ensureError(err);
      this.logger.error(`Email inbound processing failed: ${wrapped.message}`);
      return { received: true, error: 'processing_failed' };
    }
  }
}
