import * as crypto from 'node:crypto';
import { createHmac } from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { safeCompareStrings } from '../common/utils/crypto-compare.util';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { type WebhookEvent } from '@prisma/client';
import type { Redis } from 'ioredis';
import { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import {
  sanitizeWebhookChallenge,
  sendPlainTextResponse,
} from '../common/utils/webhook-challenge-response.util';
import { WebhooksService } from '../webhooks/webhooks.service';
import { WhatsAppBrainService } from './whatsapp-brain.service';

/** Whats app brain controller. */
@Controller('kloel/whatsapp')
export class WhatsAppBrainController {
  private readonly logger = new Logger(WhatsAppBrainController.name);

  constructor(
    private readonly whatsappBrain: WhatsAppBrainService,
    private readonly webhooksService: WebhooksService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /** Verify webhook. */
  @Public()
  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!VERIFY_TOKEN) {
      this.logger.error('WHATSAPP_VERIFY_TOKEN env var is not set');
      return sendPlainTextResponse(res, 'Server misconfigured', 500);
    }
    if (mode === 'subscribe' && safeCompareStrings(token, VERIFY_TOKEN)) {
      this.logger.log('Webhook verificado');
      const sanitizedChallenge = sanitizeWebhookChallenge(challenge);
      if (!sanitizedChallenge) {
        return sendPlainTextResponse(res, 'Verification failed', 403);
      }
      return sendPlainTextResponse(res, sanitizedChallenge);
    }
    return sendPlainTextResponse(res, 'Verification failed', 403);
  }

  /** Receive webhook. */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  async receiveWebhook(
    @Req() req: Request,
    @Body() payload: Record<string, unknown>,
    @Query('workspace') workspaceId: string = 'default',
  ) {
    const signature = req.headers['x-hub-signature-256'] || req.headers['x-waha-signature'];
    if (!signature && process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Missing webhook signature');
    }

    // Validate HMAC-SHA256 signature against the request body
    const secret = process.env.WHATSAPP_API_WEBHOOK_SECRET || process.env.META_APP_SECRET;
    if (secret && signature) {
      const expected = `sha256=${createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')}`;
      if (!safeCompareStrings(String(signature), expected)) {
        this.logger.warn('Invalid WhatsApp Brain webhook signature — rejecting');
        throw new ForbiddenException('Invalid webhook signature');
      }
    }

    // Double-layer idempotency: Redis SET NX + WebhookEvent unique constraint
    const redisKey = `webhook:whatsapp_brain:${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32)}`;
    const acquired = await this.redis.set(redisKey, '1', 'EX', 300, 'NX');
    if (!acquired) {
      this.logger.warn(`Duplicate WhatsApp Brain webhook (Redis): ${redisKey}`);
      return { status: 'ok', duplicate: true };
    }

    const externalId = `wb_${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32)}`;
    let webhookEvent: WebhookEvent | undefined;
    try {
      webhookEvent = await this.webhooksService.logWebhookEvent(
        'whatsapp_brain',
        'webhook_event',
        externalId,
        payload,
      );
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'P2002') {
        this.logger.log(`Duplicate WhatsApp Brain webhook event ${externalId}, returning 200`);
        return { status: 'ok', duplicate: true };
      }
      this.logger.warn(
        `Failed to log WhatsApp Brain webhook event: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    this.logger.log('Webhook POST recebido');
    try {
      await this.whatsappBrain.processWebhook(payload, workspaceId);
      if (webhookEvent?.id) {
        await this.webhooksService
          .markWebhookProcessed(webhookEvent.id)
          .catch((err: unknown) =>
            this.logger.error(
              `Failed to mark webhook ${webhookEvent.id} as processed: ${err instanceof Error ? err.message : 'unknown'}`,
            ),
          );
      }
      return { status: 'ok' };
    } catch (error: unknown) {
      if (webhookEvent?.id) {
        await this.webhooksService
          .markWebhookFailed(
            webhookEvent.id,
            error instanceof Error ? error.message : String(error),
          )
          .catch(() => {});
      }
      return { status: 'error', message: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Simulate conversation. */
  @Post('simulate/:workspaceId')
  async simulateConversation(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { customerMessage: string; customerPhone: string },
  ) {
    const response = await this.whatsappBrain.handleIncomingMessage({
      from: body.customerPhone,
      to: 'kloel_business',
      message: body.customerMessage,
      messageType: 'text',
      timestamp: new Date(),
      messageId: `sim_${Date.now()}`,
      workspaceId,
    });
    return { customerPhone: body.customerPhone, kloelResponse: response };
  }

  /** Get status. */
  @Public()
  @Get('status')
  getStatus() {
    return {
      status: 'online',
      service: 'KLOEL WhatsApp Brain',
      version: '1.0.0',
    };
  }
}
