import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const routerPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}));

vi.mock('./checkout-order-submit', () => ({
  finalizeCheckoutOrder: vi.fn(),
}));

vi.mock('./useCheckoutExperienceAutomation', () => ({
  useCheckoutExperienceAutomation: vi.fn(),
}));

vi.mock('./useCheckoutSocialIdentity', () => ({
  useCheckoutSocialIdentity: vi.fn(() => ({
    socialIdentity: {
      leadId: 'lead_123',
      provider: 'google',
      name: 'Maria Teste',
      email: 'maria@example.com',
      deviceFingerprint: 'device_123',
    },
    deviceFingerprint: 'device_123',
    updateLeadProgress: vi.fn().mockResolvedValue(undefined),
    loadingProvider: null,
    socialError: '',
    googleAvailable: false,
    googleButtonRef: { current: null },
  })),
}));

import { finalizeCheckoutOrder } from './checkout-order-submit';
import { useCheckoutExperienceSocial } from './useCheckoutExperienceSocial';

const mockedFinalizeCheckoutOrder = vi.mocked(finalizeCheckoutOrder);

const defaults = {
  product: { name: 'Curso Kloel', priceInCents: 10000, brand: 'Kloel' },
  testimonials: [],
};

const helpers = {
  fmt: {
    cpf: (value: string) => value,
    phone: (value: string) => value,
    cep: (value: string) => value,
    brl: (value: number) => `R$ ${(value / 100).toFixed(2)}`,
  },
  normalizeTestimonials: () => [],
  buildFooterPrimaryLine: () => 'Kloel',
  formatCnpj: (value?: string | null) => value || '',
};

function setupHook() {
  return renderHook(() =>
    useCheckoutExperienceSocial({
      product: {
        id: 'product_1',
        name: 'Curso Kloel',
        workspaceId: 'ws_123',
      },
      config: {
        requireCPF: false,
        requirePhone: false,
      },
      plan: {
        id: 'plan_123',
        name: 'Plano',
        priceInCents: 10000,
        maxInstallments: 12,
      },
      slug: 'checkout-kloel',
      workspaceId: 'ws_123',
      checkoutCode: 'ck_123',
      paymentProvider: {
        provider: 'stripe',
        connected: true,
        checkoutEnabled: true,
        publicKey: 'pk_test_123',
        supportsCreditCard: true,
        supportsPix: true,
        supportsBoleto: false,
      },
      affiliateContext: null,
      merchant: {
        workspaceId: 'ws_123',
        companyName: 'Kloel LTDA',
      },
      defaults,
      helpers,
    }),
  );
}

function fillRequiredFields(result: ReturnType<typeof setupHook>['result']) {
  act(() => {
    result.current.updateField('name')({
      target: { value: 'Maria Teste' },
    } as React.ChangeEvent<HTMLInputElement>);
    result.current.updateField('email')({
      target: { value: 'maria@example.com' },
    } as React.ChangeEvent<HTMLInputElement>);
    result.current.updateField('cep')({
      target: { value: '75000-000' },
    } as React.ChangeEvent<HTMLInputElement>);
    result.current.updateField('street')({
      target: { value: 'Rua Um' },
    } as React.ChangeEvent<HTMLInputElement>);
    result.current.updateField('number')({
      target: { value: '100' },
    } as React.ChangeEvent<HTMLInputElement>);
    result.current.updateField('neighborhood')({
      target: { value: 'Centro' },
    } as React.ChangeEvent<HTMLInputElement>);
    result.current.updateField('city')({
      target: { value: 'Goiania' },
    } as React.ChangeEvent<HTMLInputElement>);
    result.current.updateField('state')({
      target: { value: 'GO' },
    } as React.ChangeEvent<HTMLInputElement>);
  });
}

describe('useCheckoutExperienceSocial', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    mockedFinalizeCheckoutOrder.mockReset();
    routerPush.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        origin: 'http://localhost:3000',
        href: 'http://localhost:3000/checkout',
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('keeps the buyer on the same page for card payments until Stripe confirms the PaymentIntent', async () => {
    mockedFinalizeCheckoutOrder.mockResolvedValue({
      mode: 'stripe_confirmation',
      orderId: 'order_123',
      orderNumber: 'PED-001',
      paymentIntentId: 'pi_test_123',
      clientSecret: 'pi_test_secret_123',
      successPath: '/order/order_123/success',
    });

    const { result } = setupHook();
    fillRequiredFields(result);

    await act(async () => {
      await result.current.finalizeOrder();
    });

    expect(window.location.href).toBe('http://localhost:3000/checkout');
    expect(result.current.showSuccess).toBe(false);
    expect(result.current.stripeClientSecret).toBe('pi_test_secret_123');
    expect(result.current.stripePaymentIntentId).toBe('pi_test_123');
    expect(result.current.stripeReturnUrl).toBe('http://localhost:3000/order/order_123/success');
  });

  it('still redirects Pix purchases to the order Pix page after order creation', async () => {
    mockedFinalizeCheckoutOrder.mockResolvedValue({
      mode: 'redirect',
      orderNumber: 'PED-002',
      successPath: '/order/order_456/pix',
    });

    const { result } = setupHook();
    fillRequiredFields(result);

    act(() => {
      result.current.setPayMethod('pix');
    });

    await act(async () => {
      await result.current.finalizeOrder();
    });

    expect(routerPush).toHaveBeenCalledWith('/order/order_456/pix');
    expect(window.location.href).toBe('http://localhost:3000/checkout');
  });
});
