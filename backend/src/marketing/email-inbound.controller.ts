import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Optional,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { OmnichannelService } from '../inbox/omnichannel.service';
import { ensureError, type NormalizedMessage } from '../inbox/omnichannel.helpers';
import { PrismaService } from '../prisma/prisma.service';

function parseForwardedEmailHeaders(req: Request) {
  const from = String(req.body?.from || req.body?.sender || '').trim();
  const to = String(req.body?.to || req.body?.recipient || '').trim();
  const subject = String(req.body?.subject || '').trim();
  const textBody = String(req.body?.text || req.body?.plain || '').trim();
  const htmlBody = String(req.body?.html || '').trim();
  const messageId = String(req.body?.message_id || req.body?.['Message-Id'] || '').trim();
  const inReplyTo = String(req.body?.in_reply_to || req.body?.['In-Reply-To'] || '').trim();

  const content =
    textBody ||
    htmlBody
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  return { from, to, subject, content, messageId, inReplyTo };
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

    const { from, to, subject, content, messageId, inReplyTo } = parseForwardedEmailHeaders(req);

    if (!from || !content) {
      return { received: true, skipped: true, reason: 'empty_email' };
    }

    const resolved = resolveWorkspaceFromRecipient(to);
    if (!resolved) {
      this.logger.warn(`Email inbound: cannot resolve workspace from recipient ${to}`);
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
        this.logger.warn(`Email inbound: workspace not found for ${resolved.username}`);
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
      externalId: messageId || `email:${from}:${Date.now()}`,
      from,
      fromName: from.split('<')[0]?.trim() || from,
      content: subject ? `[${subject}] ${content}` : content,
      metadata: {
        to,
        subject,
        messageId,
        inReplyTo,
        raw: body,
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
