/**
 * @deprecated DUPLICATE of {@link ../email/email-inbound.controller.ts EmailInboundController}.
 *
 * Status: this file is the **forward-canonical target per ADR-0012**
 * (OmniCore — email is a channel under marketing/). But today it is NOT
 * registered in any NestJS module — the wired controller is in
 * `backend/src/email/email.module.ts`. Until the OmniCore move executes
 * (Wave W3 of ADR-0012), the **live canonical is `email/`**, not this file.
 *
 * Migration path (inverted): in Wave W3 of ADR-0012, the `email/` controller
 * is MOVED here, NestJS module wiring is transferred to a new
 * `marketing/email/email.module.ts`, and this @deprecated banner is REMOVED.
 * Until then, this file remains as a draft of the post-migration shape and
 * MUST NOT be wired into any module.
 *
 * @cluster Marketing/Email
 * @canonical backend/src/email/email-inbound.controller.ts (today)
 * @future-canonical THIS file (after ADR-0012 Wave W3)
 * @see docs/adr/0012-kloel-omnicore-channel-unification.md
 * @see docs/architecture/DEPRECATION_MAP.md#cross-cutting-duplications row 36
 */
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
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import { PrismaService } from '../prisma/prisma.service';
import { EmailInboundService, type InboundEmail } from '../email/email-inbound.service';
import { ensureError } from '../inbox/omnichannel.helpers';

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&lt;/g, String.fromCharCode(60))
    .replace(/&gt;/g, String.fromCharCode(62))
    .replace(/&quot;/g, String.fromCharCode(34))
    .replace(/&#39;/g, String.fromCharCode(39))
    .replace(/&amp;/g, '&');
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
    private readonly prisma: PrismaService,
    @Optional() private readonly emailInbound?: EmailInboundService,
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
        message: 'Recebimento de email ainda nao esta habilitado neste ambiente.',
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

    // Idempotency: dedup by Message-ID header
    const rawMessageId = bodyString(req, 'message_id', 'Message-Id');
    if (rawMessageId) {
      try {
        await this.prisma.webhookEvent.create({
          data: {
            provider: 'email-inbound',
            externalId: rawMessageId,
            eventType: 'email_received',
            payload: toPrismaJsonValue(body),
          },
        });
      } catch (err: unknown) {
        if ((err as { code?: string }).code === 'P2002') {
          this.logger.log(`Duplicate inbound email: ${rawMessageId}`);
          return { received: true, duplicate: true };
        }
        throw err;
      }
    }

    const { from, to, subject, content, messageId, inReplyTo } = parseForwardedEmailHeaders(req);

    if (!from || !content) {
      return { received: true, skipped: true, reason: 'empty_email' };
    }

    if (!this.emailInbound) {
      return { received: true, skipped: true, reason: 'email_inbound_not_available' };
    }

    const workspaceId = await this.emailInbound.resolveWorkspaceIdForRecipient(to);
    if (!workspaceId) {
      return { received: true, skipped: true, reason: 'workspace_not_found' };
    }

    const email: InboundEmail = {
      from,
      fromName: from.split('<')[0]?.trim() || from,
      to,
      subject,
      bodyText: content,
      messageId: messageId || `email:${randomUUID()}`,
      timestamp: Date.now(),
    };

    try {
      const result = await this.emailInbound.processInboundEmail(workspaceId, email);
      this.logger.log({
        operation: 'email.inbound.webhook',
        status: 'processed',
        workspaceId,
        provider: 'sendgrid',
        metadata: {
          inReplyTo: Boolean(inReplyTo),
          ...safeMetadataSummary(body),
        },
      });
      return { received: true, messageId: result.messageId };
    } catch (err: unknown) {
      const wrapped = ensureError(err);
      this.logger.error({
        operation: 'email.inbound.webhook',
        status: 'failed',
        provider: 'sendgrid',
        errorCode: wrapped.name,
      });
      return { received: true, error: 'processing_failed' };
    }
  }
}
