import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  AFTER_PAY_CHARGE_VALUE_ERROR,
  ProductNerveCenterAfterPayTab,
  buildAfterPayPayload,
} from './ProductNerveCenterAfterPayTab';

const { refreshProduct, showToast, updateProduct } = vi.hoisted(() => ({
  refreshProduct: vi.fn(),
  showToast: vi.fn(),
  updateProduct: vi.fn(),
}));

vi.mock('@/components/kloel/ToastProvider', () => ({
  useToast: () => ({ showToast }),
}));

vi.mock('./product-nerve-center.context', () => ({
  useNerveCenterContext: () => ({
    productId: 'prod-1',
    p: {
      afterPayAffiliateCharge: true,
      afterPayChargeValue: 9.9,
      afterPayDuplicateAddress: true,
      afterPayShippingProvider: 'correios',
    },
    refreshProduct,
    updateProduct,
  }),
}));

describe('buildAfterPayPayload', () => {
  it.each(['', '0', '-1', 'abc', '12abc'])('rejects invalid affiliate charge value %s', (value) => {
    expect(
      buildAfterPayPayload({
        duplicateAddress: true,
        affiliateCharge: true,
        chargeValue: value,
        shippingProvider: 'correios',
      }),
    ).toEqual({ ok: false, message: AFTER_PAY_CHARGE_VALUE_ERROR });
  });

  it('normalizes a valid affiliate charge and provider', () => {
    expect(
      buildAfterPayPayload({
        duplicateAddress: true,
        affiliateCharge: true,
        chargeValue: ' 12,50 ',
        shippingProvider: ' correios ',
      }),
    ).toEqual({
      ok: true,
      payload: {
        afterPayDuplicateAddress: true,
        afterPayAffiliateCharge: true,
        afterPayChargeValue: 12.5,
        afterPayShippingProvider: 'correios',
      },
    });
  });

  it('keeps charge value null when affiliate charge is disabled', () => {
    expect(
      buildAfterPayPayload({
        duplicateAddress: false,
        affiliateCharge: false,
        chargeValue: '',
        shippingProvider: '',
      }),
    ).toEqual({
      ok: true,
      payload: {
        afterPayDuplicateAddress: false,
        afterPayAffiliateCharge: false,
        afterPayChargeValue: null,
        afterPayShippingProvider: null,
      },
    });
  });
});

describe('ProductNerveCenterAfterPayTab', () => {
  it('formats persisted affiliate charge values as a Brazilian currency input', () => {
    render(createElement(ProductNerveCenterAfterPayTab));

    const chargeInput = screen.getByRole('textbox', {
      name: 'Valor cobrança (R$)',
    }) as HTMLInputElement;

    expect(chargeInput.value).toBe('9,90');
  });
});
