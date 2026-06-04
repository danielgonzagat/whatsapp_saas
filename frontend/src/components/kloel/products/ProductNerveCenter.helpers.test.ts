import { describe, expect, it } from 'vitest';
import { buildProductCouponPayload, validateProductCouponForm } from './ProductNerveCenter.helpers';

const baseCouponForm = {
  code: ' auditor10 ',
  type: '%',
  value: '10',
  maxUses: '',
  expiresAt: '',
};

describe('buildProductCouponPayload', () => {
  it('normalizes coupon code, percent type, optional max uses, and expiration', () => {
    expect(
      buildProductCouponPayload({
        ...baseCouponForm,
        value: '12,5',
        maxUses: '7',
        expiresAt: '2026-06-20',
      }),
    ).toEqual({
      code: 'AUDITOR10',
      discountType: 'PERCENT',
      discountValue: 12.5,
      maxUses: 7,
      expiresAt: '2026-06-20',
    });
  });

  it('uses FIXED for currency coupons', () => {
    expect(buildProductCouponPayload({ ...baseCouponForm, type: 'R$', value: '25.9' })).toEqual({
      code: 'AUDITOR10',
      discountType: 'FIXED',
      discountValue: 25.9,
    });
  });
});

describe('validateProductCouponForm', () => {
  it('returns a payload for a valid form', () => {
    expect(validateProductCouponForm(baseCouponForm)).toEqual({
      ok: true,
      payload: {
        code: 'AUDITOR10',
        discountType: 'PERCENT',
        discountValue: 10,
      },
    });
  });

  it('requires a code and positive discount value before POST', () => {
    expect(validateProductCouponForm({ ...baseCouponForm, code: '' })).toEqual({
      ok: false,
      field: 'code',
      message: 'Informe o codigo do cupom.',
    });
    expect(validateProductCouponForm({ ...baseCouponForm, value: '0' })).toEqual({
      ok: false,
      field: 'value',
      message: 'Informe um valor de desconto maior que zero.',
    });
  });

  it('blocks impossible percent discounts and invalid usage limits', () => {
    expect(validateProductCouponForm({ ...baseCouponForm, value: '101' })).toEqual({
      ok: false,
      field: 'value',
      message: 'O desconto percentual nao pode passar de 100%.',
    });
    expect(validateProductCouponForm({ ...baseCouponForm, maxUses: '1.5' })).toEqual({
      ok: false,
      field: 'maxUses',
      message: 'Informe um limite de usos inteiro maior que zero.',
    });
  });
});
