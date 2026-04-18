import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('kloel migration guard — payment order rail', () => {
  it('keeps the Kloel payment orchestration Stripe-only', () => {
    const paymentServiceSource = readFileSync(resolve(__dirname, './payment.service.ts'), 'utf8');
    const smartPaymentServiceSource = readFileSync(
      resolve(__dirname, './smart-payment.service.ts'),
      'utf8',
    );

    expect(paymentServiceSource).toContain('StripeService');
    expect(paymentServiceSource.toLowerCase()).not.toContain('mercado pago');
    expect(paymentServiceSource.toLowerCase()).not.toContain('mercadopago');
    expect(paymentServiceSource.toLowerCase()).not.toContain('asaas');

    expect(smartPaymentServiceSource.toLowerCase()).toContain('stripe');
    expect(smartPaymentServiceSource.toLowerCase()).not.toContain('mercado pago');
    expect(smartPaymentServiceSource.toLowerCase()).not.toContain('mercadopago');
    expect(smartPaymentServiceSource.toLowerCase()).not.toContain('asaas');
  });
});
