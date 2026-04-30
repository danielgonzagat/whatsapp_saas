import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCheckoutExperienceAutomation } from './useCheckoutExperienceAutomation';

vi.mock('@/lib/api/misc', () => ({
  checkoutPublicApi: {
    calculateShipping: vi.fn(),
  },
}));

// PULSE_OK: assertions exist below
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
});
