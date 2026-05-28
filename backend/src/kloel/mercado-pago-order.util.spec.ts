import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('kloel migration guard — payment order rail', () => {
  const retiredProvider = ['as', 'aas'].join('');

  it('keeps Kloel Pix on Mercado Pago and retired payment rails out', () => {
    const paymentServiceSource = readFileSync(resolve(__dirname, './payment.service.ts'), 'utf8');
    const smartPaymentServiceSource = readFileSync(
      resolve(__dirname, './smart-payment.service.ts'),
      'utf8',
    );

    expect(paymentServiceSource).toContain('MercadoPagoPixChargeService');
    expect(paymentServiceSource).toContain("MP_WEBHOOK_PATH = '/webhooks/mercadopago'");
    expect(paymentServiceSource).not.toContain("payment_method_types: ['pix']");
    expect(paymentServiceSource.toLowerCase()).not.toContain(retiredProvider);

    expect(smartPaymentServiceSource).toContain('paymentService.createPayment');
    expect(smartPaymentServiceSource).not.toContain("payment_method_types: ['pix']");
    expect(smartPaymentServiceSource.toLowerCase()).not.toContain(retiredProvider);
  });
});
