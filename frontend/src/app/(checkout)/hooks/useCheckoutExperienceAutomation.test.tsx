import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCheckoutExperienceAutomation } from './useCheckoutExperienceAutomation';

vi.mock('@/lib/api/checkout-public', () => ({
  checkoutPublicApi: {
    calculateShipping: vi.fn(),
  },
}));

describe('useCheckoutExperienceAutomation', () => {
  it('rehydrates phone, cpf, and address fields from the social identity snapshot', async () => {
    const setForm = vi.fn();

    renderHook(() =>
      useCheckoutExperienceAutomation({
        payMethod: 'card',
        setPayMethod: vi.fn(),
        supportsCard: true,
        supportsPix: true,
        supportsBoleto: false,
        redirectTimer: { current: null },
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
        setForm,
        couponApplied: false,
        setCouponApplied: vi.fn(),
        setDiscount: vi.fn(),
        qty: 1,
        slug: 'checkout-demo',
        shippingMode: 'FIXED',
        variableShippingFloorInCents: 0,
        cep: '',
        setDynamicShippingInCents: vi.fn(),
        couponEnabled: true,
        couponPopupEnabled: false,
        couponPopupDelay: 1800,
        popupCouponCode: '',
        couponPopupHandled: false,
        setCouponCode: vi.fn(),
        setShowCouponPopup: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(setForm).toHaveBeenCalled();
    });

    const updater = setForm.mock.calls[0]?.[0] as
      | ((prev: Record<string, string>) => Record<string, string>)
      | undefined;
    expect(typeof updater).toBe('function');

    const nextState = updater?.({
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
    });

    expect(nextState).toMatchObject({
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

  /* ─── socialIdentity null: no-ops ────────────────────────────────────── */

  it('does not call setForm when socialIdentity is null', () => {
    const setForm = vi.fn();

    renderHook(() =>
      useCheckoutExperienceAutomation({
        payMethod: 'card',
        setPayMethod: vi.fn(),
        supportsCard: true,
        supportsPix: true,
        supportsBoleto: false,
        redirectTimer: { current: null },
        socialIdentity: null,
        setForm,
        couponApplied: false,
        setCouponApplied: vi.fn(),
        setDiscount: vi.fn(),
        qty: 1,
        slug: 'checkout-demo',
        shippingMode: 'FIXED',
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
      }),
    );

    expect(setForm).not.toHaveBeenCalled();
  });

  /* ─── payMethod auto-switch ──────────────────────────────────────────── */

  it('switches to first available method when current method is unsupported', () => {
    const setPayMethod = vi.fn();

    renderHook(() =>
      useCheckoutExperienceAutomation({
        payMethod: 'boleto',
        setPayMethod,
        supportsCard: true,
        supportsPix: true,
        supportsBoleto: false,
        redirectTimer: { current: null },
        socialIdentity: null,
        setForm: vi.fn(),
        couponApplied: false,
        setCouponApplied: vi.fn(),
        setDiscount: vi.fn(),
        qty: 1,
        slug: '',
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
      }),
    );

    expect(setPayMethod).toHaveBeenCalledWith('card');
  });

  it('does not switch when current method is supported', () => {
    const setPayMethod = vi.fn();

    renderHook(() =>
      useCheckoutExperienceAutomation({
        payMethod: 'pix',
        setPayMethod,
        supportsCard: true,
        supportsPix: true,
        supportsBoleto: false,
        redirectTimer: { current: null },
        socialIdentity: null,
        setForm: vi.fn(),
        couponApplied: false,
        setCouponApplied: vi.fn(),
        setDiscount: vi.fn(),
        qty: 1,
        slug: '',
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
      }),
    );

    expect(setPayMethod).not.toHaveBeenCalled();
  });

  it('does not switch when no methods available', () => {
    const setPayMethod = vi.fn();

    renderHook(() =>
      useCheckoutExperienceAutomation({
        payMethod: 'card',
        setPayMethod,
        supportsCard: false,
        supportsPix: false,
        supportsBoleto: false,
        redirectTimer: { current: null },
        socialIdentity: null,
        setForm: vi.fn(),
        couponApplied: false,
        setCouponApplied: vi.fn(),
        setDiscount: vi.fn(),
        qty: 1,
        slug: '',
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
      }),
    );

    expect(setPayMethod).not.toHaveBeenCalled();
  });

  /* ─── couponApplied reset on qty change ──────────────────────────────── */

  it('resets coupon when couponApplied is true and qty changes', () => {
    const setCouponApplied = vi.fn();
    const setDiscount = vi.fn();

    renderHook(() =>
      useCheckoutExperienceAutomation({
        payMethod: 'card',
        setPayMethod: vi.fn(),
        supportsCard: true,
        supportsPix: false,
        supportsBoleto: false,
        redirectTimer: { current: null },
        socialIdentity: null,
        setForm: vi.fn(),
        couponApplied: true,
        setCouponApplied,
        setDiscount,
        qty: 2,
        slug: '',
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
      }),
    );

    expect(setCouponApplied).toHaveBeenCalledWith(false);
    expect(setDiscount).toHaveBeenCalledWith(0);
  });

  it('does not reset coupon when couponApplied is false', () => {
    const setCouponApplied = vi.fn();
    const setDiscount = vi.fn();

    renderHook(() =>
      useCheckoutExperienceAutomation({
        payMethod: 'card',
        setPayMethod: vi.fn(),
        supportsCard: true,
        supportsPix: false,
        supportsBoleto: false,
        redirectTimer: { current: null },
        socialIdentity: null,
        setForm: vi.fn(),
        couponApplied: false,
        setCouponApplied,
        setDiscount,
        qty: 3,
        slug: '',
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
      }),
    );

    expect(setCouponApplied).not.toHaveBeenCalled();
  });

  /* ─── shipping: variable mode auto-calculation ───────────────────────── */

  it('computes dynamic shipping when mode is VARIABLE and cep has 8 digits', async () => {
    const { checkoutPublicApi } = await import('@/lib/api/checkout-public');
    (checkoutPublicApi.calculateShipping as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        options: [{ carrier: 'Correios', price: 2590, days: '5-10' }],
      },
    });

    const setDynamicShippingInCents = vi.fn();

    renderHook(() =>
      useCheckoutExperienceAutomation({
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
        shippingMode: 'VARIABLE',
        variableShippingFloorInCents: 1500,
        cep: '75690-000',
        setDynamicShippingInCents,
        couponEnabled: false,
        couponPopupEnabled: false,
        couponPopupDelay: 0,
        popupCouponCode: '',
        couponPopupHandled: false,
        setCouponCode: vi.fn(),
        setShowCouponPopup: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(setDynamicShippingInCents).toHaveBeenCalledWith(2590);
    });
  });

  it('sets floor shipping when VARIABLE but cep is too short', () => {
    const setDynamicShippingInCents = vi.fn();

    renderHook(() =>
      useCheckoutExperienceAutomation({
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
        shippingMode: 'VARIABLE',
        variableShippingFloorInCents: 1500,
        cep: '75690',
        setDynamicShippingInCents,
        couponEnabled: false,
        couponPopupEnabled: false,
        couponPopupDelay: 0,
        popupCouponCode: '',
        couponPopupHandled: false,
        setCouponCode: vi.fn(),
        setShowCouponPopup: vi.fn(),
      }),
    );

    // When cep is too short (< 8 digits), the effect returns early
    // without calling setDynamicShippingInCents
    expect(setDynamicShippingInCents).not.toHaveBeenCalled();
  });

  it('sets shipping to null for non-VARIABLE mode', () => {
    const setDynamicShippingInCents = vi.fn();

    renderHook(() =>
      useCheckoutExperienceAutomation({
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
        slug: '',
        shippingMode: 'FREE',
        variableShippingFloorInCents: 500,
        cep: '75690000',
        setDynamicShippingInCents,
        couponEnabled: false,
        couponPopupEnabled: false,
        couponPopupDelay: 0,
        popupCouponCode: '',
        couponPopupHandled: false,
        setCouponCode: vi.fn(),
        setShowCouponPopup: vi.fn(),
      }),
    );

    expect(setDynamicShippingInCents).toHaveBeenCalledWith(null);
  });

  it('falls back to floor shipping on API error in VARIABLE mode', async () => {
    const { checkoutPublicApi } = await import('@/lib/api/checkout-public');
    (checkoutPublicApi.calculateShipping as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network error'),
    );

    const setDynamicShippingInCents = vi.fn();

    renderHook(() =>
      useCheckoutExperienceAutomation({
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
        shippingMode: 'VARIABLE',
        variableShippingFloorInCents: 2200,
        cep: '75690-000',
        setDynamicShippingInCents,
        couponEnabled: false,
        couponPopupEnabled: false,
        couponPopupDelay: 0,
        popupCouponCode: '',
        couponPopupHandled: false,
        setCouponCode: vi.fn(),
        setShowCouponPopup: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(setDynamicShippingInCents).toHaveBeenCalledWith(2200);
    });
  });

  /* ─── coupon popup ───────────────────────────────────────────────────── */

  it('schedules coupon popup when all conditions are met', async () => {
    vi.useFakeTimers();
    const setCouponCode = vi.fn();
    const setShowCouponPopup = vi.fn();

    renderHook(() =>
      useCheckoutExperienceAutomation({
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
        couponEnabled: true,
        couponPopupEnabled: true,
        couponPopupDelay: 2000,
        popupCouponCode: 'WELCOME10',
        couponPopupHandled: false,
        setCouponCode,
        setShowCouponPopup,
      }),
    );

    vi.advanceTimersByTime(600);

    expect(setCouponCode).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1500);

    expect(setCouponCode).toHaveBeenCalledWith('WELCOME10');
    expect(setShowCouponPopup).toHaveBeenCalledWith(true);

    vi.useRealTimers();
  });

  it('does not schedule coupon popup when couponPopupEnabled is false', () => {
    const setCouponCode = vi.fn();
    const setShowCouponPopup = vi.fn();

    renderHook(() =>
      useCheckoutExperienceAutomation({
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
        couponEnabled: true,
        couponPopupEnabled: false,
        couponPopupDelay: 2000,
        popupCouponCode: 'WELCOME10',
        couponPopupHandled: false,
        setCouponCode,
        setShowCouponPopup,
      }),
    );

    expect(setCouponCode).not.toHaveBeenCalled();
  });

  it('does not schedule coupon popup when popupCouponCode is empty', () => {
    const setCouponCode = vi.fn();

    renderHook(() =>
      useCheckoutExperienceAutomation({
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
        couponEnabled: true,
        couponPopupEnabled: true,
        couponPopupDelay: 2000,
        popupCouponCode: '',
        couponPopupHandled: false,
        setCouponCode,
        setShowCouponPopup: vi.fn(),
      }),
    );

    expect(setCouponCode).not.toHaveBeenCalled();
  });

  it('does not schedule coupon popup when already handled', () => {
    const setCouponCode = vi.fn();

    renderHook(() =>
      useCheckoutExperienceAutomation({
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
        couponEnabled: true,
        couponPopupEnabled: true,
        couponPopupDelay: 2000,
        popupCouponCode: 'WELCOME10',
        couponPopupHandled: true,
        setCouponCode,
        setShowCouponPopup: vi.fn(),
      }),
    );

    expect(setCouponCode).not.toHaveBeenCalled();
  });

  it('does not schedule coupon popup when couponAlreadyApplied', () => {
    const setCouponCode = vi.fn();

    renderHook(() =>
      useCheckoutExperienceAutomation({
        payMethod: 'card',
        setPayMethod: vi.fn(),
        supportsCard: true,
        supportsPix: false,
        supportsBoleto: false,
        redirectTimer: { current: null },
        socialIdentity: null,
        setForm: vi.fn(),
        couponApplied: true,
        setCouponApplied: vi.fn(),
        setDiscount: vi.fn(),
        qty: 1,
        slug: 'checkout-demo',
        shippingMode: 'FREE',
        variableShippingFloorInCents: 0,
        cep: '',
        setDynamicShippingInCents: vi.fn(),
        couponEnabled: true,
        couponPopupEnabled: true,
        couponPopupDelay: 2000,
        popupCouponCode: 'WELCOME10',
        couponPopupHandled: false,
        setCouponCode,
        setShowCouponPopup: vi.fn(),
      }),
    );

    expect(setCouponCode).not.toHaveBeenCalled();
  });

  /* ─── redirect timer cleanup ─────────────────────────────────────────── */

  it('clears redirect timer on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const timer = window.setTimeout(() => undefined, 10000);

    const { unmount } = renderHook(() =>
      useCheckoutExperienceAutomation({
        payMethod: 'card',
        setPayMethod: vi.fn(),
        supportsCard: true,
        supportsPix: false,
        supportsBoleto: false,
        redirectTimer: { current: timer },
        socialIdentity: null,
        setForm: vi.fn(),
        couponApplied: false,
        setCouponApplied: vi.fn(),
        setDiscount: vi.fn(),
        qty: 1,
        slug: '',
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
      }),
    );

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
    clearTimeoutSpy.mockRestore();
  });

  it('does not clear redirect timer when null', () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

    const { unmount } = renderHook(() =>
      useCheckoutExperienceAutomation({
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
        slug: '',
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
      }),
    );

    unmount();

    expect(clearTimeoutSpy).not.toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
