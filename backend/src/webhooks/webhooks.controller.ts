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
import type { Redis } from 'ioredis';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { getTraceHeaders } from '../common/trace-headers';
import { validateNoInternalAccess } from '../common/utils/url-validator';
import { PrismaService } from '../prisma/prisma.service';
import { asProviderSettings } from '../marketing/channels/whatsapp/provider-settings.types';
import { WebhooksService } from './webhooks.service';
import {
  buildDedupeKey,
  buildOpsAlertPayload,
  clampRecentFinanceLimit,
  computeExternalId,
  isPrismaUniqueViolation,
  resolveOpsAlertUrl,
  resolveRawBody,
  toErrorInstance,
  verifyHookSignature,
  verifyMetaSignature,
  WEBHOOK_ALERTS_LIST_MAX,
  WEBHOOK_DEDUPE_TTL_SECONDS,
  type WebhookRequestLike,
  type WebhookSignatureError,
} from './webhooks.controller.helpers';

import { RouteClass } from '../common/throttler/route-class.decorator';
import { WebhookEndpoint } from '../common/decorators/webhook-endpoint.decorator';

/** Arbitrary JSON payload received on the generic catch-hook endpoint. */
type WebhookJsonPayload = Record<string, unknown>;

/** Finance trigger body: status + phone + any extra provider-specific fields. */
interface FinanceWebhookBody {
  status?: string;
  phone?: string;
  workspaceId?: string;
  [key: string]: unknown;
}

/** Instagram / Meta Graph webhook envelope — opaque beyond workspace routing. */
type InstagramWebhookBody = Record<string, unknown>;

/** Structured metadata attached to ops alerts (never user-controlled). */
type OpsAlertMeta = Record<string, unknown>;

/**
 * Inbound webhook receiver (flows, finance, omnichannel).
 * Deduplication via Redis SETNX (checkIdempotencyOrThrow) and WebhookEvent audit trail.
 * Event ordering: events carry eventDate/createdAt; out-of-order duplicates are rejected.
 *
 * Pure logic (HMAC verification, externalId derivation, env resolution) lives in
 * {@link ./webhooks.controller.helpers} and is unit-tested independently.
 */
@Controller('hooks')
@RouteClass('webhook')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    @InjectRedis() private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  /** Catch hook. */
  @Public()
  @Post('catch/:workspaceId/:flowId')
  async catchHook(
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
    @Body() body: WebhookJsonPayload,
    @Query() query: WebhookJsonPayload,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-event-id') eventId?: string,
    @Req() req?: WebhookRequestLike,
  ) {
    this.verifySignatureOrThrow(signature, req);
    await this.assertWorkspaceNotSuspended(workspaceId);
    await this.checkIdempotencyOrThrow(eventId, req);

    const catchExternalId = computeExternalId(eventId, body, process.env.HOOKS_WEBHOOK_SECRET);
    const catchDupe = await this.logWebhookEventSafe('hooks_catch', flowId, catchExternalId, body);
    if (catchDupe) {
      return { status: 'success', ...catchDupe };
    }

    this.logger.log(`Webhook received for flow ${flowId} in workspace ${workspaceId}`);

    // Combine body and query for maximum flexibility
    const payload: WebhookJsonPayload = { ...query, ...body };

    try {
      const result = await this.webhooksService.processWebhook(workspaceId, flowId, payload);
      return {
        status: 'success',
        message: 'Webhook processed',
        executionId: result.executionId,
      };
    } catch (error: unknown) {
      const errInstance = toErrorInstance(error);
      this.logger.error(`Webhook failed: ${errInstance.message}`);
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
    @Body() body: FinanceWebhookBody,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-event-id') eventId?: string,
    @Req() req?: WebhookRequestLike,
  ) {
    this.verifySignatureOrThrow(signature, req);
    await this.assertWorkspaceNotSuspended(workspaceId);
    await this.checkIdempotencyOrThrow(eventId, req);

    const financeExternalId = computeExternalId(eventId, body, process.env.HOOKS_WEBHOOK_SECRET);
    const financeDupe = await this.logWebhookEventSafe(
      'hooks_finance',
      body.status || 'unknown',
      financeExternalId,
      body,
    );
    if (financeDupe) {
      return { status: 'received', ...financeDupe };
    }

    try {
      const res = await this.webhooksService.processFinanceEvent(workspaceId, body);
      return { status: 'received', ...res };
    } catch (error: unknown) {
      const errInstance = toErrorInstance(error);
      this.logger.error(`Finance webhook failed: ${errInstance.message}`, errInstance.stack);
      throw new HttpException('Finance event processing failed', HttpStatus.BAD_REQUEST);
    }
  }

  /** Recent finance. */
  @UseGuards(JwtAuthGuard)
  @WebhookEndpoint('Stripe/payment webhook forwarder')
  @Post('finance/:workspaceId/recent')
  async recentFinance(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { limit?: number; status?: string },
  ) {
    const limit = clampRecentFinanceLimit(body?.limit);
    await this.assertWorkspaceNotSuspended(workspaceId);
    return this.webhooksService.getRecentFinanceEvents(workspaceId, limit, body?.status);
  }

  private verifySignatureOrThrow(signature?: string, req?: WebhookRequestLike) {
    const secret = process.env.HOOKS_WEBHOOK_SECRET;
    const raw = resolveRawBody(req);
    const result = verifyHookSignature(
      signature,
      secret,
      raw,
      process.env.NODE_ENV === 'production',
    );
    this.throwOnSignatureError(result, 'HOOKS_WEBHOOK_SECRET not configured', 'webhook');
  }

  private async checkIdempotencyOrThrow(eventId?: string, req?: WebhookRequestLike) {
    const raw = resolveRawBody(req);
    const dedupeKey = buildDedupeKey(eventId, raw, process.env.HOOKS_WEBHOOK_SECRET);
    const set = await this.redis.setnx(dedupeKey, '1');
    if (set === 0) {
      const keyId = dedupeKey.slice('webhook:hooks:'.length);
      this.logger.warn(`Duplicate webhook ignored: ${keyId}`);
      await this.sendOpsAlert('webhook_duplicate', {
        source: 'hooks',
        key: keyId,
        path: req?.url,
      });
      throw new HttpException('Duplicate webhook', HttpStatus.OK);
    }
    await this.redis.expire(dedupeKey, WEBHOOK_DEDUPE_TTL_SECONDS);
  }

  /**
   * Log a webhook event to the WebhookEvent audit table. On P2002 unique
   * constraint violation (replay), returns the duplicate response 200 shape.
   */
  private async logWebhookEventSafe(
    provider: string,
    eventType: string,
    externalId: string,
    body: unknown,
  ): Promise<{ skipped: true; duplicate: true } | undefined> {
    try {
      await this.webhooksService.logWebhookEvent(
        provider,
        eventType,
        externalId,
        body as WebhookJsonPayload,
      );
    } catch (err: unknown) {
      if (isPrismaUniqueViolation(err)) {
        this.logger.log(
          `Duplicate webhook event ${externalId} (provider=${provider}), returning 200`,
        );
        return { skipped: true, duplicate: true };
      }
      this.logger.warn(
        `Failed to log webhook event for ${provider}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
    return undefined;
  }

  private async assertWorkspaceNotSuspended(pathWorkspaceId?: string) {
    const workspaceId = pathWorkspaceId?.trim();
    if (!workspaceId) {
      return;
    }
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    if (asProviderSettings(ws?.providerSettings).billingSuspended) {
      throw new ForbiddenException('Workspace suspended (billing)');
    }
  }

  // messageLimit: ops alerts are internal webhooks, not WhatsApp; no rate limit applies
  private async sendOpsAlert(message: string, meta: OpsAlertMeta) {
    const url = resolveOpsAlertUrl(process.env);
    const payload = buildOpsAlertPayload(message, meta, process.env);

    if (url && globalThis.fetch) {
      try {
        validateNoInternalAccess(url);
        await globalThis.fetch(url, {
          method: 'POST',
          headers: { ...getTraceHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        // best effort
      }
    }

    // Persist last alerts for quick inspection (Redis list capped at WEBHOOK_ALERTS_LIST_MAX)
    try {
      const persisted = { type: payload.type, meta: payload.meta, at: payload.at };
      await this.redis.lpush('alerts:webhooks', JSON.stringify(persisted));
      await this.redis.ltrim('alerts:webhooks', 0, WEBHOOK_ALERTS_LIST_MAX - 1);
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
    @Req() req?: WebhookRequestLike,
  ) {
    this.verifySignatureOrThrow(signature, req);
    await this.checkIdempotencyOrThrow(undefined, req);

    const messageStatusExternalId = computeExternalId(
      body.externalId,
      body,
      process.env.HOOKS_WEBHOOK_SECRET,
    );
    const msgDupe = await this.logWebhookEventSafe(
      'hooks_message_status',
      body.status,
      messageStatusExternalId,
      body,
    );
    if (msgDupe) {
      return { updated: 0, ...msgDupe };
    }

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
    @Req() req?: WebhookRequestLike,
  ) {
    this.verifySignatureOrThrow(signature, req);
    await this.checkIdempotencyOrThrow(undefined, req);

    const emailStatusExternalId = computeExternalId(
      body.externalId,
      body,
      process.env.HOOKS_WEBHOOK_SECRET,
    );
    const emailDupe = await this.logWebhookEventSafe(
      'hooks_email_status',
      body.status,
      emailStatusExternalId,
      body,
    );
    if (emailDupe) {
      return { updated: 0, ...emailDupe };
    }

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
    @Body() body: InstagramWebhookBody,
    @Headers('x-hub-signature-256') hubSignature?: string,
    @Req() req?: WebhookRequestLike,
  ) {
    // Validar assinatura do Meta
    this.verifyMetaSignatureOrThrow(hubSignature, req);
    await this.assertWorkspaceNotSuspended(workspaceId);
    await this.checkIdempotencyOrThrow(undefined, req);

    const igExternalId = computeExternalId(undefined, body, process.env.HOOKS_WEBHOOK_SECRET);
    const igDupe = await this.logWebhookEventSafe(
      'hooks_instagram',
      'instagram_webhook',
      igExternalId,
      body,
    );
    if (igDupe) {
      return { status: 'success', ...igDupe };
    }

    this.logger.log(`[INSTAGRAM] Webhook received for workspace ${workspaceId}`);

    try {
      const result = await this.webhooksService.processInstagramMessage(workspaceId, body);
      return { status: 'success', result };
    } catch (error: unknown) {
      this.logger.error(
        `[INSTAGRAM] Webhook failed: ${error instanceof Error ? error.message : 'unknown_error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new HttpException('Instagram webhook processing failed', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Verifica assinatura HMAC-SHA256 do Meta (Instagram/Messenger). Mantida como
   * método privado para preservar logging/telemetria específica de Meta — a
   * comparação pura vive em {@link verifyMetaSignature}.
   */
  private verifyMetaSignatureOrThrow(signature?: string, req?: WebhookRequestLike) {
    const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
    const isProduction = process.env.NODE_ENV === 'production';
    if (!appSecret && !isProduction) {
      this.logger.warn('[META] META_APP_SECRET not configured, skipping signature verification');
    }
    const raw = resolveRawBody(req);
    const result = verifyMetaSignature(signature, appSecret, raw, isProduction);
    if ('ok' in result) {
      return;
    }
    if (result.code === 'SECRET_NOT_CONFIGURED') {
      throw new HttpException('META_APP_SECRET not configured', HttpStatus.FORBIDDEN);
    }
    if (result.code === 'MISSING_SIGNATURE') {
      throw new HttpException('Missing X-Hub-Signature-256', HttpStatus.FORBIDDEN);
    }
    this.logger.warn('[META] Invalid signature received');
    throw new HttpException('Invalid Meta signature', HttpStatus.FORBIDDEN);
  }

  /**
   * Maps a `WebhookSignatureError` (or success sentinel) to the appropriate
   * `HttpException`. Centralized so every signature check shares the same
   * error-to-response mapping.
   */
  private throwOnSignatureError(
    result: { ok: true } | WebhookSignatureError,
    secretNotConfiguredMessage: string,
    label: string,
  ) {
    if ('ok' in result && result.ok) {
      return;
    }
    if ('code' in result) {
      if (result.code === 'SECRET_NOT_CONFIGURED') {
        throw new HttpException(secretNotConfiguredMessage, HttpStatus.FORBIDDEN);
      }
      if (result.code === 'MISSING_SIGNATURE') {
        throw new HttpException(`Missing ${label} signature`, HttpStatus.FORBIDDEN);
      }
      throw new HttpException(`Invalid ${label} signature`, HttpStatus.FORBIDDEN);
    }
  }
}
