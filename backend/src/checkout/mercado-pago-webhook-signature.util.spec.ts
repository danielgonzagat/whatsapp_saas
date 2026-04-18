import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('checkout migration guard — webhook signature verification', () => {
  it('routes payment webhooks through Stripe signature verification only', () => {
    const webhookSource = readFileSync(
      resolve(__dirname, '../webhooks/payment-webhook.controller.ts'),
      'utf8',
    );

    expect(webhookSource).toContain("@Post('stripe')");
    expect(webhookSource).toContain("@Headers('stripe-signature')");
    expect(webhookSource).toContain('STRIPE_WEBHOOK_SECRET');
    expect(webhookSource).toContain('constructEvent');
    expect(webhookSource.toLowerCase()).not.toContain('mercado pago');
    expect(webhookSource.toLowerCase()).not.toContain('mercadopago');
    expect(webhookSource.toLowerCase()).not.toContain('asaas');
  });
});
