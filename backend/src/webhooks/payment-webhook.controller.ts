/**
 * Payment webhook entry-point — controllers split by provider for the 600-line limit.
 *
 * Security contract (enforced in PaymentWebhookStripeController):
 *   - Every Stripe request is verified against STRIPE_WEBHOOK_SECRET before any
 *     processing begins; requests without a valid signature are rejected with 403.
 *   - The Stripe endpoint is registered at @Post('stripe') under /webhook/payment.
 *
 * @see PaymentWebhookStripeController  — POST /webhook/payment/stripe
 * @see PaymentWebhookGenericController — POST /webhook/payment (generic, Shopify, PagHiper, WooCommerce)
 */
export { PaymentWebhookStripeController } from './payment-webhook-stripe.controller';
export { PaymentWebhookGenericController } from './payment-webhook-generic.controller';
