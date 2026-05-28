import { describe, it, expect } from 'vitest';
import {
  buildCouponCreatePayload,
  coerceCouponDiscountValue,
  type Coupon,
  type CouponForm,
  EMPTY_COUPON_FORM,
  formatCouponDiscountValue,
  formatCouponExpiry,
  formatCouponMaxUses,
  isProductsSwrKey,
  normalizeCouponList,
  PRODUCT_COUPONS_COPY,
  toCouponErrorMessage,
} from './ProductCouponsTab.helpers';

function makeCoupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    id: 'cpn-1',
    code: 'DESC10',
    discountType: 'PERCENT',
    discountValue: 10,
    maxUses: null,
    usedCount: 0,
    expiresAt: null,
    active: true,
    ...overrides,
  };
}

describe('toCouponErrorMessage', () => {
  it('returns the Error message when present', () => {
    expect(toCouponErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('returns fallback for non-Error values', () => {
    expect(toCouponErrorMessage(null, 'fallback')).toBe('fallback');
    expect(toCouponErrorMessage('string', 'fallback')).toBe('fallback');
    expect(toCouponErrorMessage({ message: 'no' }, 'fallback')).toBe('fallback');
  });

  it('returns fallback when Error has empty message', () => {
    expect(toCouponErrorMessage(new Error(''), 'fallback')).toBe('fallback');
  });
});

describe('formatCouponDiscountValue', () => {
  it('formats percent discount with the percent suffix', () => {
    const out = formatCouponDiscountValue(makeCoupon({ discountType: 'PERCENT', discountValue: 15 }));
    expect(out).toBe(`15${PRODUCT_COUPONS_COPY.percentSuffix}`);
  });

  it('formats fixed discount with the currency prefix and two fraction digits', () => {
    const out = formatCouponDiscountValue(makeCoupon({ discountType: 'FIXED', discountValue: 12.5 }));
    expect(out.startsWith(PRODUCT_COUPONS_COPY.currencyPrefix)).toBe(true);
    expect(out).toContain('12');
    expect(out).toMatch(/[,.]50/);
  });
});

describe('formatCouponExpiry', () => {
  it('returns no-expiration copy when null', () => {
    expect(formatCouponExpiry(null)).toBe(PRODUCT_COUPONS_COPY.noExpiration);
  });

  it('formats an ISO date into pt-BR locale', () => {
    const out = formatCouponExpiry('2026-05-21T00:00:00.000Z');
    expect(out).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});

describe('buildCouponCreatePayload', () => {
  it('uppercases code and parses numeric fields', () => {
    const form: CouponForm = {
      code: 'desc10',
      discountType: 'PERCENT',
      discountValue: '12.5',
      maxUses: '100',
      expiresAt: '2026-05-21',
    };
    expect(buildCouponCreatePayload(form)).toEqual({
      code: 'DESC10',
      discountType: 'PERCENT',
      discountValue: 12.5,
      maxUses: 100,
      expiresAt: '2026-05-21',
    });
  });

  it('uses 0 for blank discount value and null for blank max uses + expiry', () => {
    expect(buildCouponCreatePayload({ ...EMPTY_COUPON_FORM, code: 'X' })).toEqual({
      code: 'X',
      discountType: 'PERCENT',
      discountValue: 0,
      maxUses: null,
      expiresAt: null,
    });
  });
});

describe('normalizeCouponList', () => {
  it('returns the array when given an array', () => {
    const list = [makeCoupon()];
    expect(normalizeCouponList(list)).toBe(list);
  });

  it('returns [] for non-array input', () => {
    expect(normalizeCouponList(null)).toEqual([]);
    expect(normalizeCouponList(undefined)).toEqual([]);
    expect(normalizeCouponList({ items: [] })).toEqual([]);
  });
});

describe('coerceCouponDiscountValue', () => {
  it('passes through numbers', () => {
    expect(coerceCouponDiscountValue(12.5)).toBe(12.5);
  });

  it('coerces strings via Number()', () => {
    expect(coerceCouponDiscountValue('7')).toBe(7);
  });

  it('returns 0 for null/undefined', () => {
    expect(coerceCouponDiscountValue(null)).toBe(0);
    expect(coerceCouponDiscountValue(undefined)).toBe(0);
  });
});

describe('formatCouponMaxUses', () => {
  it('returns Unlimited copy for falsy values', () => {
    expect(formatCouponMaxUses(0)).toBe(PRODUCT_COUPONS_COPY.unlimited);
    expect(formatCouponMaxUses(null)).toBe(PRODUCT_COUPONS_COPY.unlimited);
    expect(formatCouponMaxUses(undefined)).toBe(PRODUCT_COUPONS_COPY.unlimited);
  });

  it('stringifies truthy values', () => {
    expect(formatCouponMaxUses(5)).toBe('5');
    expect(formatCouponMaxUses('10')).toBe('10');
  });
});

describe('isProductsSwrKey', () => {
  it('matches /products string keys', () => {
    expect(isProductsSwrKey('/products')).toBe(true);
    expect(isProductsSwrKey('/products/123/coupons')).toBe(true);
  });

  it('rejects non-/products or non-string keys', () => {
    expect(isProductsSwrKey('/other')).toBe(false);
    expect(isProductsSwrKey(null)).toBe(false);
    expect(isProductsSwrKey(undefined)).toBe(false);
    expect(isProductsSwrKey(['/products'])).toBe(false);
  });
});
