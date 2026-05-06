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

  it('allows Mercado Pago Pix webhook processing when present', () => {
    // Mercado Pago Pix webhook is intentionally allowed — the guard
    // only blocks retired provider on payment webhook surfaces.
    const webhookSource = readFileSync(
      resolve(__dirname, '../webhooks/payment-webhook.controller.ts'),
      'utf8',
    );
    expect(webhookSource).toContain('pix_display_qr_code');
  });
});
