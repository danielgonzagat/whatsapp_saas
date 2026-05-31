import { describe, expect, it, vi } from 'vitest';

import type {
  PublicCheckoutConfig,
  PublicCheckoutMerchantInfo,
  PublicCheckoutPlan,
  PublicCheckoutProduct,
} from '@/lib/public-checkout-contract';
import {
  computeSubtotal,
  computeTotal,
  isCouponPopupEligible,
  normalizePopupCouponCode,
  parseInstallments,
  resolveBrandName,
  resolveFixedShippingInCents,
  resolveFooterLegal,
  resolveHeaderPrimary,
  resolveHeaderSecondary,
  resolveProductName,
  resolveUnitPriceInCents,
  resolveVariableShippingFloorInCents,
} from './useCheckoutExperience.helpers';

describe('resolveProductName', () => {
  it('prefers the explicit config override', () => {
    expect(
      resolveProductName(
        { productDisplayName: 'Override' } as PublicCheckoutConfig,
        { name: 'PlanName' } as PublicCheckoutPlan,
        { name: 'ProductName' } as PublicCheckoutProduct,
        'Fallback',
      ),
    ).toBe('Override');
  });

  it('falls back to plan.name when no override', () => {
    expect(
      resolveProductName(
        undefined,
        { name: 'PlanName' } as PublicCheckoutPlan,
        { name: 'ProductName' } as PublicCheckoutProduct,
        'Fallback',
      ),
    ).toBe('PlanName');
  });

  it('falls back to product.name when plan name is empty', () => {
    expect(
      resolveProductName(
        undefined,
        { name: '' } as PublicCheckoutPlan,
        { name: 'ProductName' } as PublicCheckoutProduct,
        'Fallback',
      ),
    ).toBe('ProductName');
  });

  it('returns the static default when everything is missing', () => {
    expect(resolveProductName(undefined, undefined, undefined, 'Fallback')).toBe('Fallback');
  });
});

describe('resolveBrandName', () => {
  it('prefers the config brand', () => {
    expect(
      resolveBrandName(
        { brandName: 'CfgBrand' } as PublicCheckoutConfig,
        { companyName: 'Co' } as PublicCheckoutMerchantInfo,
        undefined,
        'Default',
      ),
    ).toBe('CfgBrand');
  });

  it('falls back to merchant.companyName', () => {
    expect(
      resolveBrandName(
        undefined,
        { companyName: 'Co' } as PublicCheckoutMerchantInfo,
        undefined,
        'Default',
      ),
    ).toBe('Co');
  });

  it('falls back to merchant.workspaceName when companyName missing', () => {
    expect(
      resolveBrandName(
        undefined,
        { workspaceName: 'Ws' } as PublicCheckoutMerchantInfo,
        undefined,
        'Default',
      ),
    ).toBe('Ws');
  });

  it('falls back to product.name when merchant empty', () => {
    expect(
      resolveBrandName(undefined, undefined, { name: 'P' } as PublicCheckoutProduct, 'Default'),
    ).toBe('P');
  });

  it('returns the static default when nothing else resolves', () => {
    expect(resolveBrandName(undefined, undefined, undefined, 'Default')).toBe('Default');
  });
});

describe('resolveUnitPriceInCents', () => {
  it('returns the plan price rounded and non-negative', () => {
    expect(resolveUnitPriceInCents({ priceInCents: 1999.7 } as PublicCheckoutPlan, 0)).toBe(2000);
  });

  it('falls back to the static default when the plan price is zero/missing', () => {
    expect(resolveUnitPriceInCents(undefined, 4999)).toBe(4999);
    expect(resolveUnitPriceInCents({ priceInCents: 0 } as PublicCheckoutPlan, 4999)).toBe(4999);
  });

  it('clamps negative input to zero', () => {
    expect(resolveUnitPriceInCents({ priceInCents: -100 } as PublicCheckoutPlan, -50)).toBe(0);
  });
});

describe('resolveFixedShippingInCents', () => {
  it('returns the plan shippingPrice rounded and non-negative', () => {
    expect(resolveFixedShippingInCents({ shippingPrice: 1234.4 } as PublicCheckoutPlan)).toBe(1234);
  });

  it('returns zero when plan or shippingPrice is missing', () => {
    expect(resolveFixedShippingInCents(undefined)).toBe(0);
    expect(resolveFixedShippingInCents({} as PublicCheckoutPlan)).toBe(0);
  });
});

describe('resolveVariableShippingFloorInCents', () => {
  it('returns config.shippingVariableMinInCents rounded and non-negative', () => {
    expect(
      resolveVariableShippingFloorInCents({
        shippingVariableMinInCents: 500.6,
      } as PublicCheckoutConfig),
    ).toBe(501);
  });

  it('returns zero when missing', () => {
    expect(resolveVariableShippingFloorInCents(undefined)).toBe(0);
    expect(resolveVariableShippingFloorInCents({} as PublicCheckoutConfig)).toBe(0);
  });
});

describe('computeSubtotal', () => {
  it('multiplies unit price by quantity', () => {
    expect(computeSubtotal(1500, 3)).toBe(4500);
  });

  it('returns zero when qty is zero', () => {
    expect(computeSubtotal(1500, 0)).toBe(0);
  });
});

describe('computeTotal', () => {
  it('sums subtotal + shipping − discount', () => {
    expect(computeTotal(1000, 200, 100)).toBe(1100);
  });

  it('floors at zero when discount exceeds subtotal + shipping', () => {
    expect(computeTotal(500, 100, 10_000)).toBe(0);
  });
});

describe('parseInstallments', () => {
  it('parses a numeric string', () => {
    expect(parseInstallments('6')).toBe(6);
  });

  it('treats empty / nullish as 1', () => {
    expect(parseInstallments('')).toBe(1);
    expect(parseInstallments(null)).toBe(1);
    expect(parseInstallments(undefined)).toBe(1);
  });

  it('clamps invalid strings to 1', () => {
    expect(parseInstallments('abc')).toBe(1);
  });

  it('clamps zero or negative to 1', () => {
    expect(parseInstallments('0')).toBe(1);
    expect(parseInstallments('-3')).toBe(1);
  });
});

describe('normalizePopupCouponCode', () => {
  it('trims and upper-cases', () => {
    expect(normalizePopupCouponCode('  promo10 ')).toBe('PROMO10');
  });

  it('returns empty string for nullish input', () => {
    expect(normalizePopupCouponCode(undefined)).toBe('');
  });
});

describe('isCouponPopupEligible', () => {
  it('is true when coupon flow is on, popup is opted in, and code is present', () => {
    expect(
      isCouponPopupEligible(
        { enableCoupon: true, showCouponPopup: true } as PublicCheckoutConfig,
        'PROMO',
      ),
    ).toBe(true);
  });

  it('defaults enableCoupon to enabled when undefined', () => {
    expect(
      isCouponPopupEligible({ showCouponPopup: true } as PublicCheckoutConfig, 'PROMO'),
    ).toBe(true);
  });

  it('returns false when popup is not opted in', () => {
    expect(
      isCouponPopupEligible(
        { enableCoupon: true, showCouponPopup: false } as PublicCheckoutConfig,
        'PROMO',
      ),
    ).toBe(false);
  });

  it('returns false when coupon flow is explicitly disabled', () => {
    expect(
      isCouponPopupEligible(
        { enableCoupon: false, showCouponPopup: true } as PublicCheckoutConfig,
        'PROMO',
      ),
    ).toBe(false);
  });

  it('returns false when popup code is empty', () => {
    expect(
      isCouponPopupEligible(
        { enableCoupon: true, showCouponPopup: true } as PublicCheckoutConfig,
        '',
      ),
    ).toBe(false);
  });
});

describe('resolveFooterLegal', () => {
  const formatCnpj = vi.fn((value?: string | null) => String(value || '').replace(/\D/g, ''));

  it('uses config.footerText when present (no template applied)', () => {
    expect(
      resolveFooterLegal(
        { footerText: 'Custom legal' } as PublicCheckoutConfig,
        undefined,
        'Brand',
        formatCnpj,
        2030,
      ),
    ).toBe('Custom legal');
  });

  it('builds the default template with company + cnpj when available', () => {
    expect(
      resolveFooterLegal(
        undefined,
        {
          companyName: 'Kloel LTDA',
          cnpj: '12.345.678/0001-99',
        } as PublicCheckoutMerchantInfo,
        'Brand',
        formatCnpj,
        2030,
      ),
    ).toBe('Copyright 2030 Kloel LTDA - CNPJ: 12345678000199');
  });

  it('uses brand name when companyName missing and omits CNPJ when blank', () => {
    expect(
      resolveFooterLegal(undefined, undefined, 'Brand', formatCnpj, 2031),
    ).toBe('Copyright 2031 Brand');
  });
});

describe('resolveHeaderPrimary', () => {
  it('returns the config override when set', () => {
    expect(
      resolveHeaderPrimary({ headerMessage: 'Custom' } as PublicCheckoutConfig),
    ).toBe('Custom');
  });

  it('returns the default copy when missing', () => {
    expect(resolveHeaderPrimary(undefined)).toBe('Envio Imediato após o Pagamento');
  });
});

describe('resolveHeaderSecondary', () => {
  it('returns the config override when set', () => {
    expect(
      resolveHeaderSecondary({ headerSubMessage: 'Sub' } as PublicCheckoutConfig),
    ).toBe('Sub');
  });

  it('returns the default copy when missing', () => {
    expect(resolveHeaderSecondary(undefined)).toBe('OFERTA ESPECIAL DO MÊS!!!');
  });
});
