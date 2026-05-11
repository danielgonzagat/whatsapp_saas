import * as crypto from 'node:crypto';
import { createHmac } from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { safeCompareStrings } from '../../common/utils/crypto-compare.util';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { type WebhookEvent } from '@prisma/client';
import type { Redis } from 'ioredis';
import { Response } from 'express';
import { Public } from '../../auth/public.decorator';
import { forEachSequential } from '../../common/async-sequence';
import { RawBodyRequest } from '../../common/interfaces/authenticated-request.interface';
import { Idempotent } from '../../common/idempotency.guard';
import {
  sanitizeWebhookChallenge,
  sendPlainTextResponse,
} from '../../common/utils/webhook-challenge-response.util';
import { OmnichannelService } from '../../inbox/omnichannel.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InboundProcessorService } from '../../whatsapp/inbound-processor.service';
import { WebhooksService } from '../../webhooks/webhooks.service';
import { MetaWhatsAppService } from '../meta-whatsapp.service';
import { RouteClass } from '../../common/throttler/route-class.decorator';

/**
 * Structural shape of an inbound Meta webhook payload. Meta ships the same
 * envelope for Instagram, Messenger (page) and WhatsApp Cloud — discriminated
 * by `object` — so we keep the union loose at the root and narrow per handler.
 */
interface MetaWebhookBody {
  object?: string;
  entry?: MetaWebhookEntry[];
}

interface MetaWebhookEntry {
  id?: string;
  time?: number;
  messaging?: MetaMessagingEvent[];
  changes?: MetaWebhookChange[];
}

interface MetaMessagingEvent {
  sender?: { id?: string; name?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
  };
}

interface MetaWebhookChange {
  field?: string;
  value?: MetaWhatsAppChangeValue;
}

interface MetaWhatsAppChangeValue {
  metadata?: {
    phone_number_id?: string;
    display_phone_number?: string;
  };
  contacts?: MetaWhatsAppContact[];
  messages?: MetaWhatsAppMessage[];
  statuses?: MetaWhatsAppStatus[];
}

interface MetaWhatsAppContact {
  wa_id?: string;
  profile?: { name?: string };
}

interface MetaWhatsAppMessage {
  id?: string;
  from?: string;
  type?: string;
  timestamp?: string | number;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
  caption?: string;
  profile?: { name?: string };
  /** Meta ships additional provider-specific fields we forward untouched. */
  [key: string]: unknown;
}

interface MetaWhatsAppStatus {
  id?: string;
  status?: string;
  errors?: Array<{ code?: string | number }>;
}

/**
 * Meta Graph API webhookEvent receiver (Instagram, Messenger, WhatsApp Cloud).
 * Deduplication: double-layered — Redis SET NX (fast gate) + WebhookEvent
 * @@unique([provider, externalId]) (permanent audit). Replay-safe: returns
 * 200 on duplicate events. Signature verification via X-Hub-Signature-256
 * (HMAC-SHA256); invalid signatures are rejected with 403.
 */
@Controller('webhooks/meta')
@RouteClass('webhook')
export class MetaWebhookController {
  private readonly logger = new Logger(MetaWebhookController.name);

  constructor(
    private readonly metaWhatsApp: MetaWhatsAppService,
    private readonly inboundProcessor: InboundProcessorService,
    private readonly omnichannelService: OmnichannelService,
    private readonly prisma: PrismaService,
    private readonly webhooksService: WebhooksService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /** Verify webhook. */
  @Public()
  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const verifyToken = String(
      process.env.META_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN || '',
    ).trim();
    if (mode === 'subscribe' && verifyToken && safeCompareStrings(token, verifyToken)) {
      const sanitizedChallenge = sanitizeWebhookChallenge(challenge);
      if (!sanitizedChallenge) {
        throw new ForbiddenException('Verification failed');
      }
      this.logger.log('Meta webhook verified');
      return sendPlainTextResponse(res, sanitizedChallenge);
    }
    throw new ForbiddenException('Verification failed');
  }

  /** Handle webhook. */
  @Public()
  @Post()
  @Idempotent()
  @HttpCode(200)
  async handleWebhook(
    @Body() body: MetaWebhookBody,
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-event-id') eventId: string | undefined,
    @Req() req?: RawBodyRequest,
  ) {
    // Validate signature
    const appSecret = process.env.META_APP_SECRET;
    if (appSecret && signature) {
      const expected = `sha256=${createHmac('sha256', appSecret)
        .update(
          Buffer.isBuffer(req?.rawBody) ? req.rawBody : Buffer.from(JSON.stringify(body || {})),
        )
        .digest('hex')}`;
      if (!safeCompareStrings(signature, expected)) {
        this.logger.warn('Invalid Meta webhook signature — rejecting');
        throw new ForbiddenException('Invalid Meta webhook signature');
      }
    }

    // Double-layer idempotency: Redis SET NX + WebhookEvent unique constraint
    const redisKey = this.buildMetaIdempotencyKey(eventId, req, body);
    const acquired = await this.redis.set(redisKey, '1', 'EX', 300, 'NX');
    if (!acquired) {
      this.logger.warn(`Duplicate Meta webhook (Redis): ${redisKey}`);
      return 'ok';
    }

    const metaExternalId =
      eventId ||
      `meta_${crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32)}`;
    let webhookEvent: WebhookEvent | undefined;
    try {
      webhookEvent = await this.webhooksService.logWebhookEvent(
        'meta',
        String(body.object || 'unknown'),
        metaExternalId,
        body,
      );
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'P2002') {
        this.logger.log(`Duplicate Meta webhook event ${metaExternalId}, returning 200`);
        return 'ok';
      }
      this.logger.warn(
        `Failed to log Meta webhook event: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    const object = body.object;
    this.logger.log(`Meta webhook: object=${object}, entries=${body.entry?.length || 0}`);

    await forEachSequential(body.entry || [], async (entry) => {
      try {
        switch (object) {
          case 'instagram':
            await this.handleInstagram(entry);
            break;
          case 'page':
            await this.handlePage(entry);
            break;
          case 'whatsapp_business_account':
            await this.handleWhatsAppCloud(entry);
            break;
        }
      } catch (err: unknown) {
        this.logger.error(`Meta webhook processing error: ${String(err)}`);
      }
    });

    if (webhookEvent?.id) {
      await this.webhooksService.markWebhookProcessed(webhookEvent.id).catch((err: unknown) => {
        this.logger.error(
          `Failed to mark Meta webhook ${webhookEvent.id} as processed: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      });
    }

    return 'ok';
  }

  private buildMetaIdempotencyKey(
    eventId: string | undefined,
    req: RawBodyRequest | undefined,
    body: MetaWebhookBody,
  ): string {
    if (eventId) return `webhook:meta:${eventId}`;
    const raw = req?.rawBody || JSON.stringify(body || {});
    const hash = crypto
      .createHash('sha256')
      .update(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)))
      .digest('hex')
      .slice(0, 32);
    return `webhook:meta:${hash}`;
  }

  private async handleInstagram(entry: MetaWebhookEntry) {
    const workspaceId = await this.resolveMetaWorkspaceFromEntry(entry);
    if (!workspaceId) {
      this.logger.warn('[IG] Could not resolve workspace for Instagram webhook');
      return;
    }

    await this.omnichannelService.processInstagramWebhook(workspaceId, {
      entry: [entry],
    });
  }

  private async handlePage(entry: MetaWebhookEntry) {
    const workspaceId = await this.resolveMetaWorkspaceFromEntry(entry);
    if (!workspaceId) {
      this.logger.warn('[Messenger] Could not resolve workspace for page webhook');
      return;
    }

    await forEachSequential(entry.messaging || [], async (msg) => {
      if (msg.message) {
        await this.omnichannelService.handleIncomingMessage({
          workspaceId,
          channel: 'MESSENGER',
          externalId: String(msg.message?.mid || msg.sender?.id || 'unknown'),
          from: String(msg.sender?.id || 'unknown'),
          fromName: String(msg.sender?.name || '').trim() || undefined,
          content: String(msg.message?.text || '').trim(),
          metadata: {
            raw: msg,
            recipientId: msg.recipient?.id,
            timestamp: msg.timestamp,
          },
        });
      }
    });
  }

  private buildContactIndex(contacts: MetaWhatsAppContact[]): Map<string, string> {
    return new Map<string, string>(
      contacts.map((contact) => [
        String(contact?.wa_id || '').trim(),
        String(contact?.profile?.name || '').trim(),
      ]),
    );
  }

  private async processIncomingWhatsAppMessage(
    workspaceId: string,
    change: MetaWebhookChange,
    msg: MetaWhatsAppMessage,
    contactIndex: Map<string, string>,
  ): Promise<void> {
    const senderPhone = String(msg?.from || '').trim();
    const providerMessageId = String(msg?.id || '').trim();
    if (!providerMessageId || !senderPhone) {
      return;
    }

    const messageType = this.normalizeWhatsAppMessageType(msg?.type);
    const messageText = this.extractWhatsAppMessageText(msg);
    const senderName = [
      contactIndex.get(senderPhone),
      String(msg?.profile?.name || '').trim(),
    ].find((value): value is string => typeof value === 'string' && value.length > 0);

    await this.inboundProcessor.process({
      workspaceId,
      provider: 'meta-cloud',
      ingestMode: 'live',
      providerMessageId,
      from: senderPhone,
      to: String(change.value?.metadata?.display_phone_number || '').trim(),
      senderName,
      type: messageType,
      text: messageText,
      raw: msg,
      createdAt: msg?.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date(),
    });
  }

  private async updateWhatsAppStatus(
    workspaceId: string,
    status: MetaWhatsAppStatus,
  ): Promise<void> {
    const externalId = String(status?.id || '').trim();
    if (!externalId) {
      return;
    }

    await this.prisma.message.updateMany({
      where: { workspaceId, externalId },
      data: {
        status: this.normalizeOutboundStatus(status?.status),
        errorCode: String(status?.errors?.[0]?.code || '').trim() || null,
      },
    });
  }

  private async handleWhatsAppMessagesChange(change: MetaWebhookChange): Promise<void> {
    const phoneNumberId = String(change.value?.metadata?.phone_number_id || '').trim();
    const workspaceId = await this.metaWhatsApp.resolveWorkspaceIdByPhoneNumberId(phoneNumberId);

    if (!workspaceId) {
      this.logger.warn(
        `[WA Cloud] Could not resolve workspace for phone_number_id=${phoneNumberId}`,
      );
      return;
    }

    await this.metaWhatsApp.touchWebhookHeartbeat(workspaceId, {
      status: 'connected',
      phoneNumberId,
      lastWebhookObject: 'whatsapp_business_account',
    });

    const contacts: MetaWhatsAppContact[] = Array.isArray(change.value?.contacts)
      ? change.value.contacts
      : [];
    const contactIndex = this.buildContactIndex(contacts);

    for (const msg of change.value?.messages || []) {
      await this.processIncomingWhatsAppMessage(workspaceId, change, msg, contactIndex);
    }

    for (const status of change.value?.statuses || []) {
      await this.updateWhatsAppStatus(workspaceId, status);
    }
  }

  private async handleWhatsAppCloud(entry: MetaWebhookEntry) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') {
        continue;
      }
      await this.handleWhatsAppMessagesChange(change);
    }
  }

  private async resolveMetaWorkspaceFromEntry(entry: MetaWebhookEntry): Promise<string | null> {
    const pageId = String(entry?.id || entry?.messaging?.[0]?.recipient?.id || '').trim();

    if (!pageId) {
      return null;
    }

    const connection = await this.prisma.metaConnection.findFirst({
      where: { pageId },
      select: { workspaceId: true },
    });

    return connection?.workspaceId || null;
  }

  private normalizeWhatsAppMessageType(
    type: unknown,
  ): 'text' | 'audio' | 'image' | 'document' | 'video' | 'sticker' | 'unknown' {
    const normalized =
      typeof type === 'string'
        ? type.trim().toLowerCase()
        : typeof type === 'number' || typeof type === 'boolean'
          ? String(type).trim().toLowerCase()
          : '';

    switch (normalized) {
      case 'text':
        return 'text';
      case 'audio':
      case 'voice':
        return 'audio';
      case 'image':
        return 'image';
      case 'document':
        return 'document';
      case 'video':
        return 'video';
      case 'sticker':
        return 'sticker';
      default:
        return 'unknown';
    }
  }

  private extractWhatsAppMessageText(msg: MetaWhatsAppMessage): string {
    const text =
      msg?.text?.body ||
      msg?.button?.text ||
      msg?.interactive?.button_reply?.title ||
      msg?.interactive?.list_reply?.title ||
      msg?.caption ||
      '';

    if (text) {
      return String(text).trim();
    }

    const type =
      typeof msg?.type === 'string'
        ? msg.type.trim().toUpperCase()
        : typeof msg?.type === 'number' || typeof msg?.type === 'boolean'
          ? String(msg.type).trim().toUpperCase()
          : '';
    return type ? `[${type}]` : '';
  }

  private normalizeOutboundStatus(status: unknown): string {
    const normalized =
      typeof status === 'string'
        ? status.trim().toLowerCase()
        : typeof status === 'number' || typeof status === 'boolean'
          ? String(status).trim().toLowerCase()
          : '';

    switch (normalized) {
      case 'sent':
        return 'SENT';
      case 'delivered':
        return 'DELIVERED';
      case 'read':
        return 'READ';
      case 'failed':
        return 'FAILED';
      default:
        return 'DELIVERED';
    }
  }
}
