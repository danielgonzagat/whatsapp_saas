import { describe, expect, it, vi, beforeEach } from 'vitest';

import { finalizeCheckoutOrder } from './checkout-order-submit';
import { createOrder } from './useCheckout';

vi.mock('./useCheckout', () => ({
  createOrder: vi.fn(),
}));

const mockedCreateOrder = vi.mocked(createOrder);

const baseArgs = {
  affiliateContext: null,
  capturedLeadId: undefined,
  checkoutCode: 'chk_123',
  deviceFingerprint: 'device_123',
  discount: 0,
  form: {
    name: 'Cliente Teste',
    email: 'cliente@example.com',
    cpf: '123.456.789-09',
    phone: '11 99999-9999',
    cep: '01310-100',
    street: 'Av Paulista',
    number: '1000',
    neighborhood: 'Bela Vista',
    complement: '',
    city: 'São Paulo',
    state: 'SP',
    destinatario: 'Cliente Teste',
    cardNumber: '',
    cardExp: '',
    cardCvv: '',
    cardName: '',
    cardCpf: '',
    installments: '1',
  },
  installments: 1,
  payMethod: 'card' as const,
  paymentProvider: {
    provider: 'stripe' as const,
    connected: true,
    checkoutEnabled: true,
    supportsCreditCard: true,
    supportsPix: true,
    supportsBoleto: false,
    publicKey: 'pk_test_123',
  },
  planId: 'plan_123',
  qty: 1,
  shippingInCents: 0,
  shippingMode: 'FREE' as const,
  subtotal: 10_000,
  total: 10_000,
  workspaceId: 'ws_123',
};

// PULSE_OK: assertions exist below
describe('finalizeCheckoutOrder — Stripe-only checkout', () => {
  beforeEach(() => {
    mockedCreateOrder.mockReset();
  });

  it('returns stripe confirmation data for card payments instead of tokenizing a legacy provider', async () => {
    mockedCreateOrder.mockResolvedValue({
      id: 'order_123',
      orderNumber: 'KLOEL-123',
      plan: { upsells: [] },
      paymentData: {
        clientSecret: 'pi_test_secret_123',
        paymentIntentId: 'pi_test_123',
        approved: false,
      },
    });

    const result = await finalizeCheckoutOrder(baseArgs);

    expect(mockedCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: 'plan_123',
        paymentMethod: 'CREDIT_CARD',
      }),
    );
    expect(result).toEqual({
      mode: 'stripe_confirmation',
      clientSecret: 'pi_test_secret_123',
      orderId: 'order_123',
      orderNumber: 'KLOEL-123',
      paymentIntentId: 'pi_test_123',
      successPath: '/order/order_123/success',
    });
  });

  it('returns a redirect flow for pix payments', async () => {
    mockedCreateOrder.mockResolvedValue({
      id: 'order_pix_1',
      orderNumber: 'KLOEL-PIX-1',
      paymentData: {
        approved: false,
        pixQrCode: 'data:image/png;base64,qr',
      },
    });

    const result = await finalizeCheckoutOrder({
      ...baseArgs,
      payMethod: 'pix',
    });

    expect(result).toEqual({
      mode: 'redirect',
      orderNumber: 'KLOEL-PIX-1',
      successPath: '/order/order_pix_1/pix',
    });
  });
});
