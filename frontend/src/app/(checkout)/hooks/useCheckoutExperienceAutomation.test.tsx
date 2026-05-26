import { renderHook, waitFor } from '@testing-library/react';
import type { SetStateAction } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkoutPublicApi } from '@/lib/api/checkout-public';
import type { CheckoutExperienceForm } from './checkout-experience-social-helpers';
import { useCheckoutExperienceAutomation } from './useCheckoutExperienceAutomation';

vi.mock('@/lib/api/checkout-public', () => ({
  checkoutPublicApi: {
    calculateShipping: vi.fn(),
  },
}));

type HookOptions = Parameters<typeof useCheckoutExperienceAutomation>[0];
type PayMethod = HookOptions['payMethod'];

const emptyForm: CheckoutExperienceForm = {
  name: '',
  email: '',
  cpf: '',
  phone: '',
  cep: '',
  street: '',
  number: '',
  neighborhood: '',
  complement: '',
  city: '',
  state: '',
  destinatario: '',
  cardNumber: '',
  cardExp: '',
  cardCvv: '',
  cardName: '',
  cardCpf: '',
  installments: '',
};

function baseOptions(overrides: Partial<HookOptions> = {}): HookOptions {
  return {
    payMethod: 'card',
    setPayMethod: vi.fn(),
    supportsCard: true,
    supportsPix: false,
    supportsBoleto: false,
    redirectTimer: { current: null },
    socialIdentity: null,
    setForm: vi.fn(),
    couponApplied: false,
    setCouponApplied: vi.fn(),
    setDiscount: vi.fn(),
    qty: 1,
    slug: 'checkout-demo',
    shippingMode: 'FREE',
    variableShippingFloorInCents: 0,
    cep: '',
    setDynamicShippingInCents: vi.fn(),
    couponEnabled: false,
    couponPopupEnabled: false,
    couponPopupDelay: 0,
    popupCouponCode: '',
    couponPopupHandled: false,
    setCouponCode: vi.fn(),
    setShowCouponPopup: vi.fn(),
    ...overrides,
  };
}

function renderAutomation(overrides: Partial<HookOptions> = {}) {
  return renderHook(() => useCheckoutExperienceAutomation(baseOptions(overrides)));
}

function readFormUpdate(setForm: ReturnType<typeof vi.fn>) {
  const update = setForm.mock.calls[0]?.[0] as SetStateAction<CheckoutExperienceForm> | undefined;
  return typeof update === 'function' ? update(emptyForm) : update;
}

describe('useCheckoutExperienceAutomation', () => {
  beforeEach(() => {
    vi.mocked(checkoutPublicApi.calculateShipping).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rehydrates checkout form fields from the social identity snapshot', async () => {
    const setForm = vi.fn();

    renderAutomation({
      setForm,
      socialIdentity: {
        provider: 'google',
        name: 'Maria de Almeida Cruz',
        email: 'maria@gmail.com',
        phone: '62999990000',
        cpf: '12345678900',
        cep: '75690-000',
        street: 'Rua das Flores',
        number: '100',
        neighborhood: 'Centro',
        city: 'Caldas Novas',
        state: 'GO',
        complement: 'Apto 12',
        deviceFingerprint: 'device-123',
      },
    });

    await waitFor(() => expect(setForm).toHaveBeenCalled());
    expect(readFormUpdate(setForm)).toMatchObject({
      name: 'Maria de Almeida Cruz',
      email: 'maria@gmail.com',
      phone: '62999990000',
      cpf: '12345678900',
      cep: '75690-000',
      street: 'Rua das Flores',
      number: '100',
      neighborhood: 'Centro',
      city: 'Caldas Novas',
      state: 'GO',
      complement: 'Apto 12',
    });
  });

  it('leaves the form untouched when the social identity snapshot is absent', () => {
    const setForm = vi.fn();

    renderAutomation({ setForm, socialIdentity: null });

    expect(setForm).not.toHaveBeenCalled();
  });

  it.each<[
    string,
    Pick<HookOptions, 'payMethod' | 'supportsCard' | 'supportsPix' | 'supportsBoleto'>,
    PayMethod | null,
  ]>([
    ['uses the first enabled method when the selected method is blocked', { payMethod: 'boleto', supportsCard: true, supportsPix: true, supportsBoleto: false }, 'card'],
    ['keeps the selected method when it is enabled', { payMethod: 'pix', supportsCard: true, supportsPix: true, supportsBoleto: false }, null],
    ['keeps the selected method when no method is enabled', { payMethod: 'card', supportsCard: false, supportsPix: false, supportsBoleto: false }, null],
  ])('%s', (_label, paymentOptions, expectedMethod) => {
    const setPayMethod = vi.fn();

    renderAutomation({ ...paymentOptions, setPayMethod });

    if (expectedMethod) {
      expect(setPayMethod).toHaveBeenCalledWith(expectedMethod);
    } else {
      expect(setPayMethod).not.toHaveBeenCalled();
    }
  });

  it('resets an applied coupon after quantity changes', () => {
    const setCouponApplied = vi.fn();
    const setDiscount = vi.fn();

    renderAutomation({ couponApplied: true, qty: 2, setCouponApplied, setDiscount });

    expect(setCouponApplied).toHaveBeenCalledWith(false);
    expect(setDiscount).toHaveBeenCalledWith(0);
  });

  it('keeps coupon state when no coupon is applied', () => {
    const setCouponApplied = vi.fn();

    renderAutomation({ couponApplied: false, qty: 3, setCouponApplied });

    expect(setCouponApplied).not.toHaveBeenCalled();
  });

  it('computes variable shipping from the public checkout API', async () => {
    vi.mocked(checkoutPublicApi.calculateShipping).mockResolvedValue({
      status: 200,
      data: { options: [{ carrier: 'Correios', price: 2590, days: '5-10' }] },
    });
    const setDynamicShippingInCents = vi.fn();

    renderAutomation({
      shippingMode: 'VARIABLE',
      variableShippingFloorInCents: 1500,
      cep: '75690-000',
      setDynamicShippingInCents,
    });

    await waitFor(() => expect(setDynamicShippingInCents).toHaveBeenCalledWith(2590));
    expect(checkoutPublicApi.calculateShipping).toHaveBeenCalledWith({
      slug: 'checkout-demo',
      cep: '75690000',
    });
  });

  it.each([
    ['short CEP in variable mode', { shippingMode: 'VARIABLE', cep: '75690', variableShippingFloorInCents: 1500 }, undefined],
    ['non-variable mode', { shippingMode: 'FREE', cep: '75690000', variableShippingFloorInCents: 500 }, null],
  ])('handles shipping fallback for %s', (_label, shippingOptions, expectedValue) => {
    const setDynamicShippingInCents = vi.fn();

    renderAutomation({ ...shippingOptions, setDynamicShippingInCents });

    if (expectedValue === undefined) {
      expect(setDynamicShippingInCents).not.toHaveBeenCalled();
    } else {
      expect(setDynamicShippingInCents).toHaveBeenCalledWith(expectedValue);
    }
  });

  it('falls back to the variable shipping floor when the API rejects', async () => {
    vi.mocked(checkoutPublicApi.calculateShipping).mockRejectedValue(new Error('Network error'));
    const setDynamicShippingInCents = vi.fn();

    renderAutomation({
      shippingMode: 'VARIABLE',
      variableShippingFloorInCents: 2200,
      cep: '75690-000',
      setDynamicShippingInCents,
    });

    await waitFor(() => expect(setDynamicShippingInCents).toHaveBeenCalledWith(2200));
  });

  it('opens the coupon popup after the configured delay', () => {
    vi.useFakeTimers();
    const setCouponCode = vi.fn();
    const setShowCouponPopup = vi.fn();

    renderAutomation({
      couponEnabled: true,
      couponPopupEnabled: true,
      couponPopupDelay: 2000,
      popupCouponCode: 'WELCOME10',
      setCouponCode,
      setShowCouponPopup,
    });

    vi.advanceTimersByTime(600);
    expect(setCouponCode).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1500);
    expect(setCouponCode).toHaveBeenCalledWith('WELCOME10');
    expect(setShowCouponPopup).toHaveBeenCalledWith(true);
  });

  it.each([
    ['popup disabled', { couponPopupEnabled: false, popupCouponCode: 'WELCOME10' }],
    ['coupon code missing', { couponPopupEnabled: true, popupCouponCode: '' }],
    ['popup already handled', { couponPopupEnabled: true, popupCouponCode: 'WELCOME10', couponPopupHandled: true }],
    ['coupon already applied', { couponPopupEnabled: true, popupCouponCode: 'WELCOME10', couponApplied: true }],
  ])('does not schedule the coupon popup when %s', (_label, popupOptions) => {
    const setCouponCode = vi.fn();

    renderAutomation({ couponEnabled: true, setCouponCode, ...popupOptions });

    expect(setCouponCode).not.toHaveBeenCalled();
  });

  it.each([
    ['clears the timer', window.setTimeout(() => undefined, 10000), true],
    ['ignores a null timer', null, false],
  ])('%s during unmount', (_label, timer, shouldClear) => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const { unmount } = renderAutomation({ redirectTimer: { current: timer } });

    unmount();

    if (shouldClear) {
      expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
    } else {
      expect(clearTimeoutSpy).not.toHaveBeenCalled();
    }
    clearTimeoutSpy.mockRestore();
  });
});
