import { describe, expect, it } from 'vitest';

import { normalizeSmartPaymentResult } from '../api/smart-payment';

describe('normalizeSmartPaymentResult', () => {
  it('maps the backend Pix smart-payment payload to the UI result shape', () => {
    expect(
      normalizeSmartPaymentResult({
        paymentId: 'pi_pix_1',
        paymentUrl: 'https://pay.stripe.com/pix/pi_pix_1',
        pixCopyPaste: '000201pixcopy',
        billingType: 'PIX',
        suggestedMessage: 'Pix pronto',
      }),
    ).toEqual({
      id: 'pi_pix_1',
      paymentLink: 'https://pay.stripe.com/pix/pi_pix_1',
      pixCode: '000201pixcopy',
      billingType: 'PIX',
      suggestedMessage: 'Pix pronto',
    });
  });

  it('does not surface unsupported boleto results as an available smart-payment method', () => {
    expect(
      normalizeSmartPaymentResult({
        paymentId: 'legacy_boleto',
        paymentUrl: 'https://example.test/boleto',
        billingType: 'BOLETO',
      }),
    ).toEqual({
      id: 'legacy_boleto',
      paymentLink: 'https://example.test/boleto',
    });
  });
});
