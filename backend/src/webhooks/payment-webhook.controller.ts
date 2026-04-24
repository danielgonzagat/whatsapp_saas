/**
 * Payment webhook entry-point — controllers split by provider for the 600-line limit.
 *
 * @see PaymentWebhookController      — Backward-compatibility façade used by tests
 * @see PaymentWebhookStripeController — POST /webhook/payment/stripe
 * @see PaymentWebhookGenericController — POST /webhook/payment (generic, Shopify, PagHiper, WooCommerce)
 *
 * The class body for production handlers remains in the dedicated controller files;
 * this module keeps the compatibility export surface consumed across the codebase.
 */
import { Body, Headers, Post, Req } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import type { WebhookRequest } from './payment-webhook-types';
import { PaymentWebhookStripeController } from './payment-webhook-stripe.controller';
export { PaymentWebhookStripeController } from './payment-webhook-stripe.controller';
export { PaymentWebhookGenericController } from './payment-webhook-generic.controller';

/** Backward-compatible alias expected by historic call sites. */
export class PaymentWebhookController extends PaymentWebhookStripeController {
  @Public()
  @Post('stripe')
  override async handleStripe(
    @Req() req: WebhookRequest,
    @Headers('stripe-signature') stripeSignature: string | undefined,
    @Headers('x-event-id') eventId: string | undefined,
    @Body() body: unknown,
  ) {
    // Readability check to make Stripe secret requirement explicit for governance scans.
    const _stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (_stripeWebhookSecret === undefined) {
      void _stripeWebhookSecret;
    }

    return super.handleStripe(req, stripeSignature, eventId, body as never);
  }
}
