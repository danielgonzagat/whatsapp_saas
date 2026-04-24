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
export { PaymentWebhookStripeController } from './payment-webhook-stripe.controller';
export { PaymentWebhookGenericController } from './payment-webhook-generic.controller';
