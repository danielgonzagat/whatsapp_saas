import { describe, expect, it } from 'vitest';

import { normalizeSmartPaymentResult } from '../api/smart-payment';

describe('normalizeSmartPaymentResult', () => {
  it('maps the backend Pix smart-payment payload to the UI result shape', () => {
    expect(
      normalizeSmartPaymentResult({
        paymentId: 'mp_pix_1',
        paymentUrl: 'https://www.mercadopago.com.br/payments/mp_pix_1/ticket',
        pixCopyPaste: '000201pixcopy',
        billingType: 'PIX',
        suggestedMessage: 'Pix pronto',
      }),
    ).toEqual({
      id: 'mp_pix_1',
      paymentLink: 'https://www.mercadopago.com.br/payments/mp_pix_1/ticket',
      pixCode: '000201pixcopy',
      billingType: 'PIX',
      suggestedMessage: 'Pix pronto',
    });
  });

  it('surfaces Mercado Pago boleto results as an available smart-payment method', () => {
    expect(
      normalizeSmartPaymentResult({
        paymentId: 'mp_boleto_1',
        paymentUrl: 'https://www.mercadopago.com.br/payments/mp_boleto_1/ticket',
        billingType: 'BOLETO',
        suggestedMessage: 'Boleto pronto',
      }),
    ).toEqual({
      id: 'mp_boleto_1',
      paymentLink: 'https://www.mercadopago.com.br/payments/mp_boleto_1/ticket',
      billingType: 'BOLETO',
      suggestedMessage: 'Boleto pronto',
    });
  });
});
