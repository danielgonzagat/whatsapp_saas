import { Controller, HttpException, HttpStatus, Logger, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

/**
 * `/webhooks/asaas` — DEPRECATED route. Returns HTTP 410 Gone.
 *
 * The canonical Asaas webhook route is `/checkout/webhooks/asaas`
 * (CheckoutWebhookController). The audit on 2026-04-08 found three
 * Asaas controllers in production:
 *
 *   /checkout/webhooks/asaas         <- canonical (kept)
 *   /webhooks/asaas                  <- this one (deprecated -> 410)
 *   /webhook/payment/asaas           <- payment-webhook.controller.ts (deprecated -> 410)
 *
 * Each used a different deduplication strategy and different state-
 * machine validation, creating a split-brain when Asaas was
 * configured to send to any of the three. PR P0-2 unified the
 * webhook idempotency strategy on the canonical route. PR P4-4
 * (this commit) closes the legacy routes by returning 410 so
 * operators must reconfigure Asaas to point at the canonical route.
 *
 * Why 410 Gone instead of 404? 410 is the documented HTTP status
 * for "this resource used to exist but has been intentionally
 * removed". Webhook providers (Asaas, Stripe, Shopify) treat 410
 * as a terminal failure and stop retrying — exactly what we want.
 * 404 makes them assume a temporary routing issue and keep retrying.
 *
 * The controller class itself is kept (not deleted) to avoid
 * breaking @nestjs/swagger and the AppModule import graph. A
 * follow-up cleanup PR will remove it entirely once we confirm
 * production logs show zero traffic to /webhooks/asaas for at
 * least one observation window.
 */
@Controller('webhooks/asaas')
export class AsaasWebhookController {
  private readonly logger = new Logger(AsaasWebhookController.name);

  @Public()
  @Post()
  handle() {
    this.logger.warn(
      '[GONE] /webhooks/asaas received traffic — return 410, configure Asaas to use /checkout/webhooks/asaas',
    );
    throw new HttpException(
      {
        ok: false,
        gone: true,
        message:
          'This webhook endpoint is deprecated. Configure Asaas to send webhooks to /checkout/webhooks/asaas instead.',
      },
      HttpStatus.GONE,
    );
  }
}
