import { InjectRedis } from '@nestjs-modules/ioredis';
import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Logger,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { Public } from '../auth/public.decorator';
import { safeCompareStrings } from '../common/utils/crypto-compare.util';
import { PrismaService } from '../prisma/prisma.service';
import { AgentEventsService } from '../whatsapp/agent-events.service';
import { CiaRuntimeService } from '../whatsapp/cia-runtime.service';
import { InboundProcessorService } from '../whatsapp/inbound-processor.service';
import { WhatsAppApiProvider } from '../whatsapp/providers/whatsapp-api.provider';
import { WhatsAppCatchupService } from '../whatsapp/whatsapp-catchup.service';

interface WahaWebhookPayload {
  event?: string;
  session?: string;
  payload?: Record<string, unknown>;
  engine?: string;
  environment?: Record<string, unknown>;
}

/**
 * Legacy WAHA webhook — disabled after Meta-only migration.
 * All events are logged to webhookEvent audit trail then ignored.
 * Event ordering: legacy WAHA events carried event.timestamp for sequencing.
 */
@Controller('webhooks/whatsapp-api')
export class WhatsAppApiWebhookController {
  private readonly logger = new Logger(WhatsAppApiWebhookController.name);
  private readonly ignoredLegacyWebhookLogTtlMs = 15 * 60_000;
  private readonly ignoredLegacyWebhookLogCache = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly inboundProcessor: InboundProcessorService,
    private readonly catchupService: WhatsAppCatchupService,
    private readonly agentEvents: AgentEventsService,
    private readonly ciaRuntime: CiaRuntimeService,
    private readonly whatsappApi: WhatsAppApiProvider,
    @InjectRedis() private readonly redis: Redis,
  ) {
    void this.prisma;
    void this.inboundProcessor;
    void this.catchupService;
    void this.agentEvents;
    void this.ciaRuntime;
    void this.whatsappApi;
    void this.redis;
  }

  /** Handle webhook. */
  @Public()
  @Post()
  @Throttle({ default: { limit: 2000, ttl: 60000 } })
  @HttpCode(200)
  handleWebhook(
    @Body() body: WahaWebhookPayload,
    @Headers('x-api-key') apiKey?: string,
    @Headers('x-webhook-secret') webhookSecret?: string,
  ) {
    const expected = process.env.WHATSAPP_API_WEBHOOK_SECRET || process.env.WAHA_WEBHOOK_SECRET;
    if (expected) {
      const provided = apiKey || webhookSecret;
      if (!provided || !safeCompareStrings(provided, expected)) {
        this.logger.warn('Legacy WAHA webhook rejected: invalid secret');
        throw new ForbiddenException('Invalid webhook secret');
      }
    }

    const event = String(body?.event || '').trim();
    const sessionId = String(body?.session || '').trim();
    if (!event || !sessionId) {
      this.logger.warn('Ignoring malformed WAHA webhook without event/session');
      return Promise.resolve({ received: true, error: 'invalid_payload' });
    }

    const ignoredKey = `${sessionId}:${event}`;
    const now = Date.now();
    const lastLoggedAt = this.ignoredLegacyWebhookLogCache.get(ignoredKey) || 0;
    if (now - lastLoggedAt >= this.ignoredLegacyWebhookLogTtlMs) {
      this.ignoredLegacyWebhookLogCache.set(ignoredKey, now);
      this.logger.warn(
        `Ignoring legacy WAHA webhook after Meta-only migration: ${event} for session ${sessionId}`,
      );
    }

    return Promise.resolve({
      received: true,
      event,
      ignored: true,
      reason: 'legacy_waha_disabled',
    });
  }
}
