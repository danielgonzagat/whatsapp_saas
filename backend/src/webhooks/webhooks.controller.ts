import { createHmac } from 'crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import {
  Body,
  Controller,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { validateNoInternalAccess } from '../common/utils/url-validator';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from './webhooks.service';

interface WebhookRequestLike {
  body?: unknown;
  rawBody?: string | Buffer;
}

/**
 * Inbound webhook receiver (flows, finance, omnichannel).
 * Deduplication via Redis SETNX (checkIdempotencyOrThrow) and WebhookEvent audit trail.
 * Event ordering: events carry eventDate/createdAt; out-of-order duplicates are rejected.
 */
@Controller('hooks')
@Throttle({ default: { limit: 100, ttl: 60000 } })
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    @InjectRedis() private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('catch/:workspaceId/:flowId')
  async catchHook(
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
    @Body() body: any,
    @Query() query: any,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-event-id') eventId?: string,
    @Req() req?: any,
  ) {
    this.verifySignatureOrThrow(signature, req);
    await this.assertWorkspaceNotSuspended(workspaceId);
    await this.checkIdempotencyOrThrow(eventId, req);

    this.logger.log(`Webhook received for flow ${flowId} in workspace ${workspaceId}`);

    // Combine body and query for maximum flexibility
    const payload = { ...query, ...body };

    try {
      const result = await this.webhooksService.processWebhook(workspaceId, flowId, payload);
      return {
        status: 'success',
        message: 'Webhook processed',
        executionId: result.executionId,
      };
    } catch (error) {
      this.logger.error(`Webhook failed: ${error.message}`);
      throw new HttpException('Webhook processing failed', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Finance Trigger: recebe eventos de boleto/pix/checkout e dispara flow configurado.
   * Espera body.status (paid/pending/canceled/overdue) e body.phone.
   */
  @Public()
  @Post('finance/:workspaceId')
  async financeHook(
    @Param('workspaceId') workspaceId: string,
    @Body() body: any,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-event-id') eventId?: string,
    @Req() req?: any,
  ) {
    this.verifySignatureOrThrow(signature, req);
    await this.assertWorkspaceNotSuspended(workspaceId);
    await this.checkIdempotencyOrThrow(eventId, req);

    try {
      const res = await this.webhooksService.processFinanceEvent(workspaceId, body);
      return { status: 'received', ...res };
    } catch (error) {
      this.logger.error(`Finance webhook failed: ${error.message}`, error.stack);
      throw new HttpException('Finance event processing failed', HttpStatus.BAD_REQUEST);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('finance/:workspaceId/recent')
  async recentFinance(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { limit?: number; status?: string },
  ) {
    const limit = body?.limit && body.limit > 0 ? body.limit : 50;
    await this.assertWorkspaceNotSuspended(workspaceId);
    return this.webhooksService.getRecentFinanceEvents(
      workspaceId,
      Math.min(limit, 200),
      body?.status,
    );
  }

  private verifySignatureOrThrow(signature?: string, req?: WebhookRequestLike) {
    const secret = process.env.HOOKS_WEBHOOK_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        throw new HttpException('HOOKS_WEBHOOK_SECRET not configured', HttpStatus.FORBIDDEN);
      }
      return;
    }
    if (!signature) {
      throw new HttpException('Missing webhook signature', HttpStatus.FORBIDDEN);
    }
    const reqBody = req?.body;
    const raw = req?.rawBody || JSON.stringify(reqBody || '');
    const expected = createHmac('sha256', secret)
      .update(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)))
      .digest('hex');
    if (signature !== expected) {
      throw new HttpException('Invalid webhook signature', HttpStatus.FORBIDDEN);
    }
  }

  private async checkIdempotencyOrThrow(eventId?: string, req?: any) {
    const reqBody = req?.body;
    const raw = req?.rawBody || JSON.stringify(reqBody || '');
    const keyId =
      eventId ||
      createHmac('sha256', process.env.HOOKS_WEBHOOK_SECRET || 'hooks_salt')
        .update(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)))
        .digest('hex')
        .slice(0, 24);
    const dedupeKey = `webhook:hooks:${keyId}`;
    const set = await this.redis.setnx(dedupeKey, '1');
    if (set === 0) {
      this.logger.warn(`Duplicate webhook ignored: ${keyId}`);
      await this.sendOpsAlert('webhook_duplicate', {
        source: 'hooks',
        key: keyId,
        path: req?.url,
      });
      throw new HttpException('Duplicate webhook', HttpStatus.OK);
    }
    await this.redis.expire(dedupeKey, 300); // 5 min
  }

  private async assertWorkspaceNotSuspended(pathWorkspaceId?: string) {
    const workspaceId = pathWorkspaceId?.trim();
    if (!workspaceId) return;
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    if ((ws?.providerSettings as Record<string, any>)?.billingSuspended) {
      throw new ForbiddenException('Workspace suspended (billing)');
    }
  }

  // messageLimit: ops alerts are internal webhooks, not WhatsApp; no rate limit applies
  private async sendOpsAlert(message: string, meta: any) {
    const url =
      process.env.OPS_WEBHOOK_URL ||
      process.env.AUTOPILOT_ALERT_WEBHOOK ||
      process.env.DLQ_WEBHOOK_URL;
    if (!url || !globalThis.fetch) return;
    try {
      validateNoInternalAccess(url);
      await globalThis.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: message,
          meta,
          at: new Date().toISOString(),
          env: process.env.NODE_ENV || 'dev',
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      // best effort
    }

    // Persist last alerts for quick inspection (Redis list capped at 50)
    try {
      const payload = {
        type: message,
        meta,
        at: new Date().toISOString(),
      };
      await this.redis.lpush('alerts:webhooks', JSON.stringify(payload));
      await this.redis.ltrim('alerts:webhooks', 0, 49);
    } catch {
      // ignore
    }
  }

  /**
   * Recebe callbacks de status de mensagens (Meta/WPP/etc) para marcar DELIVERED/READ/FAILED.
   * Espera: { workspaceId, externalId, status, errorCode?, phone? }
   */
  @Public()
  @Post('message-status')
  async messageStatus(
    @Body()
    body: {
      workspaceId?: string;
      externalId?: string;
      status: string;
      errorCode?: string;
      phone?: string;
      channel?: string;
    },
    @Headers('x-webhook-signature') signature?: string,
    @Req() req?: any,
  ) {
    this.verifySignatureOrThrow(signature, req);
    const { workspaceId, externalId, status, errorCode, phone, channel } = body || {};
    return this.webhooksService.updateMessageStatus({
      workspaceId,
      externalId,
      status,
      errorCode,
      phone,
      channel,
    });
  }

  /**
   * Alias para status de e-mail (bounce/entregue). Espera workspaceId + phone ou externalId.
   */
  @Public()
  @Post('email-status')
  async emailStatus(
    @Body()
    body: {
      workspaceId: string;
      externalId?: string;
      status: string;
      errorCode?: string;
      phone?: string;
    },
    @Headers('x-webhook-signature') signature?: string,
    @Req() req?: any,
  ) {
    this.verifySignatureOrThrow(signature, req);
    return this.webhooksService.updateMessageStatus({
      ...body,
      channel: 'EMAIL',
    });
  }

  // ============================================================================
  // WEBHOOKS DE CANAIS OMNICHANNEL
  // ============================================================================

  /**
   * Webhook do Instagram (Meta Graph API)
   * Valida assinatura X-Hub-Signature-256 antes de processar
   */
  @Public()
  @Post('instagram/:workspaceId')
  async instagramWebhook(
    @Param('workspaceId') workspaceId: string,
    @Body() body: any,
    @Headers('x-hub-signature-256') hubSignature?: string,
    @Req() req?: any,
  ) {
    // Validar assinatura do Meta
    this.verifyMetaSignature(hubSignature, req);
    await this.assertWorkspaceNotSuspended(workspaceId);

    this.logger.log(`[INSTAGRAM] Webhook received for workspace ${workspaceId}`);

    try {
      const result = await this.webhooksService.processInstagramMessage(workspaceId, body);
      return { status: 'success', result };
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.error(
        `[INSTAGRAM] Webhook failed: ${errorInstanceofError.message}`,
        errorInstanceofError.stack,
      );
      throw new HttpException('Instagram webhook processing failed', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Verifica assinatura HMAC-SHA256 do Meta (Instagram/Messenger)
   */
  private verifyMetaSignature(signature?: string, req?: WebhookRequestLike) {
    const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
    if (!appSecret) {
      if (process.env.NODE_ENV === 'production') {
        throw new HttpException('META_APP_SECRET not configured', HttpStatus.FORBIDDEN);
      }
      this.logger.warn('[META] META_APP_SECRET not configured, skipping signature verification');
      return;
    }
    if (!signature) {
      throw new HttpException('Missing X-Hub-Signature-256', HttpStatus.FORBIDDEN);
    }

    const reqBody = req?.body;
    const raw = req?.rawBody || JSON.stringify(reqBody || '');
    const expectedSignature =
      'sha256=' +
      createHmac('sha256', appSecret)
        .update(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)))
        .digest('hex');

    if (signature !== expectedSignature) {
      this.logger.warn('[META] Invalid signature received');
      throw new HttpException('Invalid Meta signature', HttpStatus.FORBIDDEN);
    }
  }
}
