import { Body, Controller, Get, Headers, HttpCode, Logger, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { safeCompareStrings } from '../common/utils/crypto-compare.util';
import { EmailInboundService, type InboundEmail } from './email-inbound.service';

interface EmailWebhookPayload {
  workspaceId?: string;
  from?: string;
  fromName?: string;
  to?: string;
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename?: string;
    contentBase64?: string;
    content?: string;
    mimeType?: string;
    type?: string;
    url?: string;
  }>;
  messageId?: string;
  timestamp?: number;
}

@Controller('email-inbound')
@UseGuards(ThrottlerGuard)
export class EmailInboundController {
  private readonly logger = new Logger(EmailInboundController.name);

  constructor(private readonly emailInbound: EmailInboundService) {}

  @Public()
  @Get('status')
  status() {
    const configured = this.emailInbound.isConfigured();
    const provider = this.emailInbound.getProvider();
    return {
      configured,
      provider: provider || 'none',
      message: configured
        ? 'Email inbound webhook is active'
        : 'setup-required: configure EMAIL_INBOUND_SECRET to enable email inbound reception',
      endpoint: configured ? '/api/email-inbound/receive' : null,
    };
  }

  @Public()
  @Post('receive')
  @Throttle({ default: { limit: 200, ttl: 60000 } })
  @HttpCode(200)
  async receive(
    @Body() body: EmailWebhookPayload,
    @Headers('x-email-inbound-secret') headerSecret?: string,
  ) {
    if (!this.emailInbound.isConfigured()) {
      return {
        status: 'setup_required',
        reason:
          'EMAIL_INBOUND_SECRET is not configured. Set this env var to enable email inbound reception.',
      };
    }

    const expected = String(process.env.EMAIL_INBOUND_SECRET || '').trim();

    function readSecret(val: unknown): string {
      return typeof val === 'string' ? val.trim() : '';
    }

    const provided =
      readSecret(headerSecret) ||
      (typeof body === 'object' && body !== null
        ? readSecret((body as Record<string, unknown>).secret)
        : '');

    if (!expected || !provided || !safeCompareStrings(provided, expected)) {
      this.logger.warn('Email inbound webhook rejected: invalid or missing secret');
      return { status: 'forbidden', reason: 'Invalid webhook secret' };
    }

    const workspaceId = body.workspaceId || process.env.EMAIL_INBOUND_WORKSPACE_ID;
    if (!workspaceId) {
      return {
        status: 'bad_request',
        reason:
          'workspaceId is required — provide it in the payload or set EMAIL_INBOUND_WORKSPACE_ID',
      };
    }

    const attachments = body.attachments?.map((att) => ({
      ...(att.filename !== undefined ? { filename: att.filename } : {}),
      ...((att.contentBase64 || att.content) !== undefined
        ? { contentBase64: att.contentBase64 || att.content }
        : {}),
      ...((att.mimeType || att.type) !== undefined ? { mimeType: att.mimeType || att.type } : {}),
      ...(att.url !== undefined ? { url: att.url } : {}),
    }));
    const email: InboundEmail = {
      from: body.from || '',
      ...(body.fromName !== undefined ? { fromName: body.fromName } : {}),
      to: body.to || '',
      subject: body.subject || 'Sem assunto',
      ...(body.bodyText || body.text ? { bodyText: body.bodyText || body.text } : {}),
      ...(body.bodyHtml || body.html ? { bodyHtml: body.bodyHtml || body.html } : {}),
      ...(attachments !== undefined ? { attachments } : {}),
      ...(body.messageId !== undefined ? { messageId: body.messageId } : {}),
      ...(body.timestamp !== undefined ? { timestamp: body.timestamp } : {}),
    };

    if (!email.from) {
      return { status: 'bad_request', reason: 'from (sender email) is required' };
    }

    try {
      const result = await this.emailInbound.processInboundEmail(workspaceId, email);
      return { status: 'ok', messageId: result.messageId };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown_error';
      this.logger.error(`[EMAIL] Webhook processing failed: ${message}`);
      return { status: 'error', reason: message };
    }
  }
}
