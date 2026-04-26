import crypto from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type WebhookEvent } from '@prisma/client';
import type { Redis } from 'ioredis';
import { AdminAuditService } from '../admin/audit/admin-audit.service';
import { MarketplaceTreasuryPayoutService } from '../marketplace-treasury/marketplace-treasury-payout.service';
import { Public } from '../auth/public.decorator';
import { AutopilotService } from '../autopilot/autopilot.service';
import { StripeRuntime } from '../billing/stripe-runtime';
import type {
  StripeCheckoutSession,
  StripeEvent,
  StripePaymentIntent,
} from '../billing/stripe-types';
import { ConnectPayoutService } from '../payments/connect/connect-payout.service';
import { ConnectReversalService } from '../payments/connect/connect-reversal.service';
import { StripeWebhookProcessor } from '../payments/stripe/stripe-webhook.processor';
import { FinancialAlertService } from '../common/financial-alert.service';
import { validateNoInternalAccess } from '../common/utils/url-validator';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WebhooksService } from './webhooks.service';
import { StripeWebhookLedgerService } from './stripe-webhook-ledger.service';
import {
  asRecord,
  asString,
  type WebhookRequest,
  type StripeEventLike,
} from './payment-webhook-types';
import {
  handleRefundCreated,
  handleDisputeCreated,
  handlePayoutEvent,
  handleAccountUpdated,
  type StripeHandlerDeps,
} from './payment-webhook-stripe.handlers';
import {
  handlePaymentIntentEvent,
  handleCheckoutSessionCompleted,
} from './payment-webhook-stripe.handlers2';

/**
 * Handles all Stripe-originated webhooks at POST /webhook/payment/stripe.
 * Ledger / audit side-effects are delegated to StripeWebhookLedgerService.
 * Event handlers are split across payment-webhook-stripe.handlers.ts and handlers2.ts.
 */
@Controller('webhook/payment')
@Throttle({ default: { limit: 100, ttl: 60000 } })
export class PaymentWebhookStripeController {
  private readonly logger = new Logger(PaymentWebhookStripeController.name);

  constructor(
    private readonly autopilot: AutopilotService,
    private readonly whatsapp: WhatsappService,
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
    private readonly webhooksService: WebhooksService,
    private readonly stripeWebhookProcessor: StripeWebhookProcessor,
    private readonly connectReversalService: ConnectReversalService,
    private readonly connectPayoutService: ConnectPayoutService,
    private readonly marketplaceTreasuryPayoutService: MarketplaceTreasuryPayoutService,
    private readonly adminAudit: AdminAuditService,
    private readonly financialAlert: FinancialAlertService,
    private readonly ledger: StripeWebhookLedgerService,
  ) {}

  private get deps(): StripeHandlerDeps {
    return {
      logger: this.logger,
      prisma: this.prisma,
      autopilot: this.autopilot,
      whatsapp: this.whatsapp,
      webhooksService: this.webhooksService,
      stripeWebhookProcessor: this.stripeWebhookProcessor,
      connectReversalService: this.connectReversalService,
      connectPayoutService: this.connectPayoutService,
      marketplaceTreasuryPayoutService: this.marketplaceTreasuryPayoutService,
      adminAudit: this.adminAudit,
      financialAlert: this.financialAlert,
      ledger: this.ledger,
    };
  }

  /** Handle stripe. */
  @Public()
  @Post('stripe')
  async handleStripe(
    @Req() req: WebhookRequest,
    @Headers('stripe-signature') stripeSignature: string | undefined,
    @Headers('x-event-id') eventId: string | undefined,
    @Body() body: StripeEventLike,
  ) {
    const primarySecret = process.env.STRIPE_WEBHOOK_SECRET;
    const endpointSecrets = Array.from(
      new Set(
        [
          primarySecret,
          ...(process.env.STRIPE_WEBHOOK_SECRETS?.split(',').map((s) => s.trim()) ?? []),
        ].filter((s): s is string => Boolean(s && s.length > 0)),
      ),
    );
    if (process.env.NODE_ENV === 'production' && endpointSecrets.length === 0) {
      throw new ForbiddenException('STRIPE_WEBHOOK_SECRET not configured');
    }

    let event: StripeEventLike = body;
    if (endpointSecrets.length > 0) {
      if (!stripeSignature) throw new BadRequestException('Missing stripe-signature header');
      if (!req.rawBody)
        throw new BadRequestException('Missing rawBody for Stripe webhook verification');
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        this.logger.warn('STRIPE_SECRET_KEY not configured — payment webhooks disabled');
        return { received: true, skipped: true, reason: 'Stripe not configured' };
      }
      const stripe = new StripeRuntime(stripeKey);
      let verified: StripeEvent | undefined;
      let lastSignatureError: unknown;
      for (const secret of endpointSecrets) {
        try {
          verified = stripe.webhooks.constructEvent(req.rawBody, stripeSignature, secret);
          break;
        } catch (err) {
          lastSignatureError = err;
        }
      }
      if (!verified) {
        const message =
          lastSignatureError instanceof Error
            ? lastSignatureError.message
            : 'Invalid stripe signature';
        throw new BadRequestException(message);
      }

      const verifiedRecord = asRecord(verified);
      const relatedObject = asRecord(verifiedRecord?.related_object);
      const isThinAccountUpdated =
        verifiedRecord?.object === 'v2.core.event' &&
        verified.type === 'account.updated' &&
        relatedObject?.type === 'account' &&
        typeof verified.id === 'string';

      if (isThinAccountUpdated) {
        const hydrated = await stripe.events.retrieve(verified.id, {}, undefined);
        event = {
          id: hydrated.id,
          type: hydrated.type,
          data: { object: asRecord(hydrated.data?.object) ?? undefined },
        };
      } else if (verified.type === 'checkout.session.completed') {
        const session: StripeCheckoutSession = verified.data.object;
        event = {
          id: verified.id,
          type: verified.type,
          data: {
            object: {
              id: session.id,
              payment_intent:
                typeof session.payment_intent === 'string'
                  ? session.payment_intent
                  : (session.payment_intent?.id ?? null),
              amount_total: session.amount_total ?? null,
              currency: session.currency ?? null,
              customer_email: session.customer_email ?? null,
              customer_details: session.customer_details
                ? {
                    email: session.customer_details.email ?? null,
                    phone: session.customer_details.phone ?? null,
                  }
                : null,
              metadata: session.metadata ?? null,
            },
          },
        };
      } else if (verified.type.startsWith('payment_intent.')) {
        const intent = verified.data.object as StripePaymentIntent;
        event = {
          id: verified.id,
          type: verified.type,
          data: {
            object: {
              id: intent.id,
              status: intent.status,
              currency: intent.currency ?? null,
              latest_charge: typeof intent.latest_charge === 'string' ? intent.latest_charge : null,
              transfer_group: intent.transfer_group ?? null,
              metadata: intent.metadata ?? null,
              next_action:
                intent.next_action?.type === 'pix_display_qr_code'
                  ? {
                      type: intent.next_action.type,
                      pix_display_qr_code: {
                        data: intent.next_action.pix_display_qr_code?.data ?? null,
                        image_url_png:
                          intent.next_action.pix_display_qr_code?.image_url_png ?? null,
                        expires_at: intent.next_action.pix_display_qr_code?.expires_at ?? null,
                      },
                    }
                  : null,
              last_payment_error: intent.last_payment_error
                ? { message: intent.last_payment_error.message ?? null }
                : null,
            },
          },
        };
      } else {
        event = {
          id: verified.id,
          type: verified.type,
          data: { object: asRecord(verified.data.object) ?? undefined },
        };
      }
    }

    const stripeDupe = await this.ensureIdempotent(eventId || event?.id || body?.id, req);
    if (stripeDupe) return stripeDupe;

    const stripeExternalId = event?.id || eventId || body?.id || `stripe_${Date.now()}`;
    let webhookEvent: WebhookEvent | undefined;
    try {
      webhookEvent = await this.webhooksService.logWebhookEvent(
        'stripe',
        event?.type || 'unknown',
        String(stripeExternalId),
        body,
      );
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      if ((err as { code?: string } | null)?.code === 'P2002') {
        this.logger.log(`Duplicate Stripe webhook event ${stripeExternalId}, returning 200`);
        return { received: true, skipped: true, reason: 'duplicate_webhook_event' };
      }
      this.logger.warn(`Failed to log Stripe webhook event: ${errMsg?.message}`);
    }

    if (event?.type === 'refund.created') {
      await handleRefundCreated(this.deps, event, webhookEvent);
      return { received: true };
    }
    if (event?.type === 'charge.dispute.created') {
      await handleDisputeCreated(this.deps, event, webhookEvent);
      return { received: true };
    }
    if (event?.type === 'payout.failed' || event?.type === 'payout.paid') {
      await handlePayoutEvent(this.deps, event, webhookEvent, stripeExternalId);
      return { received: true };
    }
    if (event?.type === 'account.updated') {
      await handleAccountUpdated(this.deps, event, webhookEvent);
      return { received: true };
    }
    if (
      event?.type === 'payment_intent.succeeded' ||
      event?.type === 'payment_intent.processing' ||
      event?.type === 'payment_intent.payment_failed' ||
      event?.type === 'payment_intent.canceled'
    ) {
      await handlePaymentIntentEvent(this.deps, event, webhookEvent, stripeExternalId);
      return { received: true };
    }
    if (event?.type === 'checkout.session.completed') {
      await handleCheckoutSessionCompleted(this.deps, event, webhookEvent);
    }
    if (webhookEvent?.id) {
      await this.webhooksService.markWebhookProcessed(webhookEvent.id).catch((err: unknown) => {
        const errMsg = err instanceof Error ? err.message : 'unknown_error';
        this.logger.error(
          `[STRIPE] Failed to mark webhook ${webhookEvent.id} as processed: ${errMsg}`,
        );
      });
    }
    return { received: true };
  }

  private async ensureIdempotent(
    eventId: string | undefined,
    req: WebhookRequest,
  ): Promise<{ ok: true; received: true; duplicate: true; reason: string } | null> {
    const reqBody = req?.body;
    const raw = req?.rawBody || JSON.stringify(reqBody || '');
    const key =
      eventId ||
      crypto
        .createHash('sha256')
        .update(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)))
        .digest('hex')
        .slice(0, 32);
    const cacheKey = `webhook:payment:${key}`;
    const result = await this.redis.set(cacheKey, '1', 'EX', 300, 'NX');
    if (result === null) {
      this.logger.warn(`Duplicate payment webhook ignored: ${key}`);
      await this.sendOpsAlert('webhook_duplicate_payment', { key, path: req?.url });
      return { ok: true, received: true, duplicate: true, reason: 'duplicate_event' };
    }
    return null;
  }

  private async sendOpsAlert(message: string, meta: Record<string, unknown>) {
    const url =
      process.env.OPS_WEBHOOK_URL ||
      process.env.AUTOPILOT_ALERT_WEBHOOK ||
      process.env.DLQ_WEBHOOK_URL;
    if (!url || !globalThis.fetch) return;
    const stableId =
      asString(meta.eventId) ||
      asString(meta.externalId) ||
      asString(meta.paymentIntentId) ||
      asString(meta.orderId) ||
      crypto.randomUUID();
    const requestId = `payment-webhook:${message}:${stableId}`;
    try {
      validateNoInternalAccess(url);
      await globalThis.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
        body: JSON.stringify({
          type: message,
          meta,
          requestId,
          at: new Date().toISOString(),
          env: process.env.NODE_ENV || 'dev',
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      /* best effort */
    }
    try {
      const payload = { type: message, meta, requestId, at: new Date().toISOString() };
      await this.redis.lpush('alerts:webhooks', JSON.stringify(payload));
      await this.redis.ltrim('alerts:webhooks', 0, 49);
    } catch {
      /* ignore */
    }
  }
}
