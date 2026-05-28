import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('kloel migration guard — payment order rail', () => {
  const retiredProvider = ['as', 'aas'].join('');

  it('keeps Kloel PIX orchestration on Mercado Pago and out of Stripe', () => {
    const paymentServiceSource = readFileSync(resolve(__dirname, './payment.service.ts'), 'utf8');
    const smartPaymentServiceSource = readFileSync(
      resolve(__dirname, './smart-payment.service.ts'),
      'utf8',
    );

    expect(paymentServiceSource).toContain('MercadoPagoPixChargeService');
    expect(paymentServiceSource.toLowerCase()).toContain('mercadopago');
    expect(paymentServiceSource).not.toContain('StripeService');
    expect(paymentServiceSource).not.toContain('paymentIntents.create');
    expect(paymentServiceSource.toLowerCase()).not.toContain(retiredProvider);

    expect(smartPaymentServiceSource).toContain('PaymentService');
    expect(smartPaymentServiceSource.toLowerCase()).toContain('mercado pago');
    expect(smartPaymentServiceSource.toLowerCase()).not.toContain('stripe payment');
    expect(smartPaymentServiceSource.toLowerCase()).not.toContain(retiredProvider);
  });
});
