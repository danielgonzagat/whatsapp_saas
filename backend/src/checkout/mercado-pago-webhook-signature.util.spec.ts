import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('checkout migration guard — webhook signature verification', () => {
  const retiredProvider = ['as', 'aas'].join('');

  it('routes payment webhooks through Stripe signature verification only', () => {
    const controllerSource = readFileSync(
      resolve(__dirname, '../webhooks/payment-webhook.controller.ts'),
      'utf8',
    );
    const stripeBaseSource = readFileSync(
      resolve(__dirname, '../webhooks/payment-webhook-stripe.controller.ts'),
      'utf8',
    );
    const webhookSource = controllerSource + stripeBaseSource;

    expect(webhookSource).toContain("@Post('stripe')");
    expect(webhookSource).toContain("@Headers('stripe-signature')");
    expect(webhookSource).toContain('STRIPE_WEBHOOK_SECRET');
    expect(webhookSource).toContain('constructEvent');
    expect(webhookSource.toLowerCase()).not.toContain(retiredProvider);
  });

  it('enforces Mercado Pago Pix webhook signature on the canonical controller', () => {
    // Canonical MP webhook receiver lives at
    // backend/src/payments/mercadopago/mercadopago-webhook.controller.ts.
    // The legacy checkout-scoped duplicate at
    // backend/src/checkout/mercado-pago-webhook.controller.ts was removed
    // per DEPRECATION_MAP row #35 (2026-05-27).
    const webhookSource = readFileSync(
      resolve(__dirname, '../payments/mercadopago/mercadopago-webhook.controller.ts'),
      'utf8',
    );
    expect(webhookSource).toContain("@Controller('webhooks/mercadopago')");
    expect(webhookSource).toContain('MercadoPagoWebhookSignatureVerifier');
    expect(webhookSource).toContain("provider: 'mercadopago'");
  });
});
