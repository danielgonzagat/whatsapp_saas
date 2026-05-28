import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from '../api/core';
import { normalizeSmartPaymentResult, smartPaymentApi } from '../api/smart-payment';

vi.mock('../api/core', () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  mockedApiFetch.mockReset();
});

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

describe('smartPaymentApi.create', () => {
  it('translates the UI smart-payment form payload to the backend contract', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      status: 200,
      data: {
        paymentId: 'mp_pix_1',
        billingType: 'PIX',
      },
    });

    await smartPaymentApi.create('ws-1', {
      amount: 197,
      description: 'PDRN offer',
      customerName: 'Joao Silva',
      customerPhone: '5511999999999',
      customerEmail: 'joao@example.com',
      method: 'pix',
      dueDate: '2026-06-05',
    });

    expect(mockedApiFetch).toHaveBeenCalledWith('/kloel/payment/ws-1/create', {
      method: 'POST',
      body: {
        amount: 197,
        productName: 'PDRN offer',
        customerName: 'Joao Silva',
        phone: '5511999999999',
        customerEmail: 'joao@example.com',
        method: 'pix',
        dueDate: '2026-06-05',
      },
    });
  });
});
