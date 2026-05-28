import { describe, expect, it, vi } from 'vitest';

import type {
  PublicCheckoutConfig,
  PublicCheckoutMerchantInfo,
  PublicCheckoutPlan,
  PublicCheckoutProduct,
} from '@/lib/public-checkout-contract';
import type { CheckoutExperienceFormState } from './useCheckoutExperience.types';
import {
  buildOrderPayload,
  computeSubtotal,
  computeTotal,
  isCouponPopupEligible,
  isStep1Valid,
  isStep2Valid,
  normalizePopupCouponCode,
  parseInstallments,
  resolveBrandName,
  resolveFixedShippingInCents,
  resolveFooterLegal,
  resolveHeaderPrimary,
  resolveHeaderSecondary,
  resolveProductName,
  resolveSubmitErrorMessage,
  resolveSuccessRedirect,
  resolveUnitPriceInCents,
  resolveVariableShippingFloorInCents,
} from './useCheckoutExperience.helpers';

const baseForm: BuildOrderForm = {
  name: '  Daniel Penin  ',
  email: '  daniel@kloel.com  ',
  cpf: '12345678901',
  phone: '11999998888',
  cep: '01310-100',
  street: 'Av Paulista',
  number: '1000',
  neighborhood: 'Bela Vista',
  complement: 'Conj 12',
  city: 'São Paulo',
  state: 'SP',
  destinatario: '',
  cardName: '',
};

type BuildOrderForm = Parameters<typeof buildOrderPayload>[2]['form'];

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

const validStep1Form = {
  name: 'Daniel',
  email: 'daniel@kloel.com',
  cpf: '12345678901',
  phone: '11999998888',
} satisfies Pick<CheckoutExperienceFormState, 'name' | 'email' | 'cpf' | 'phone'>;

describe('isStep1Valid', () => {
  it('returns true for a complete form with defaults', () => {
    expect(isStep1Valid(validStep1Form, undefined)).toBe(true);
  });

  it('returns false when name is blank', () => {
    expect(isStep1Valid({ ...validStep1Form, name: '   ' }, undefined)).toBe(false);
  });

  it('returns false when email is blank', () => {
    expect(isStep1Valid({ ...validStep1Form, email: '' }, undefined)).toBe(false);
  });

  it('returns false when CPF is below 11 digits and requireCPF is default-on', () => {
    expect(isStep1Valid({ ...validStep1Form, cpf: '12345' }, undefined)).toBe(false);
  });

  it('returns false when phone is below 10 digits and requirePhone is default-on', () => {
    expect(isStep1Valid({ ...validStep1Form, phone: '11999' }, undefined)).toBe(false);
  });

  it('skips CPF gate when requireCPF is explicitly false', () => {
    expect(
      isStep1Valid(
        { ...validStep1Form, cpf: '' },
        { requireCPF: false } as PublicCheckoutConfig,
      ),
    ).toBe(true);
  });

  it('skips phone gate when requirePhone is explicitly false', () => {
    expect(
      isStep1Valid(
        { ...validStep1Form, phone: '' },
        { requirePhone: false } as PublicCheckoutConfig,
      ),
    ).toBe(true);
  });

  it('counts only digits in the CPF length check (formatted strings pass)', () => {
    expect(
      isStep1Valid({ ...validStep1Form, cpf: '123.456.789-01' }, undefined),
    ).toBe(true);
  });
});

const validStep2Form = {
  cep: '01310-100',
  street: 'Av Paulista',
  number: '1000',
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP',
} satisfies Pick<
  CheckoutExperienceFormState,
  'cep' | 'street' | 'number' | 'neighborhood' | 'city' | 'state'
>;

describe('isStep2Valid', () => {
  it('returns true when every address field has content', () => {
    expect(isStep2Valid(validStep2Form)).toBe(true);
  });

  it('returns false when any field is whitespace-only', () => {
    expect(isStep2Valid({ ...validStep2Form, street: '   ' })).toBe(false);
    expect(isStep2Valid({ ...validStep2Form, city: '' })).toBe(false);
  });
});

describe('resolveSubmitErrorMessage', () => {
  it('uses the message from a thrown Error', () => {
    expect(resolveSubmitErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('falls back to the generic message for non-Error throws', () => {
    expect(resolveSubmitErrorMessage('plain string')).toBe(
      'Erro ao processar o checkout. Tente novamente.',
    );
    expect(resolveSubmitErrorMessage(null)).toBe(
      'Erro ao processar o checkout. Tente novamente.',
    );
    expect(resolveSubmitErrorMessage(undefined)).toBe(
      'Erro ao processar o checkout. Tente novamente.',
    );
  });
});

describe('resolveSuccessRedirect', () => {
  it('returns null when no orderId can be resolved', () => {
    expect(resolveSuccessRedirect({}, 'card')).toBeNull();
  });

  it('redirects to /pix for the pix method', () => {
    expect(resolveSuccessRedirect({ id: 'ord-1' }, 'pix')).toBe('/order/ord-1/pix');
  });

  it('redirects to /boleto for the boleto method', () => {
    expect(resolveSuccessRedirect({ id: 'ord-1' }, 'boleto')).toBe('/order/ord-1/boleto');
  });

  it('redirects to /upsell when the card payment is approved and the plan has upsells', () => {
    expect(
      resolveSuccessRedirect(
        {
          id: 'ord-1',
          paymentData: { approved: true },
          plan: { upsells: ['u1'] },
        },
        'card',
      ),
    ).toBe('/order/ord-1/upsell');
  });

  it('falls back to /success for an approved card payment without upsells', () => {
    expect(
      resolveSuccessRedirect(
        { id: 'ord-1', paymentData: { approved: true }, plan: { upsells: [] } },
        'card',
      ),
    ).toBe('/order/ord-1/success');
  });

  it('reads orderId from result.data.id when top-level id is missing', () => {
    expect(resolveSuccessRedirect({ data: { id: 'ord-2' } }, 'pix')).toBe('/order/ord-2/pix');
  });
});

describe('buildOrderPayload', () => {
  const params = (overrides: Partial<Parameters<typeof buildOrderPayload>[2]> = {}) => ({
    checkoutCode: 'CK1',
    form: { ...baseForm },
    payMethod: 'card' as const,
    shippingMode: 'FIXED',
    shippingInCents: 1500,
    qty: 2,
    subtotal: 4000,
    discount: 500,
    total: 5000,
    couponApplied: true,
    couponCode: 'PROMO',
    installments: 3,
    affiliateWorkspaceId: 'aff-1',
    ...overrides,
  });

  it('trims customer name/email and propagates required identifiers', () => {
    const out = buildOrderPayload('plan-1', 'ws-1', params());
    expect(out.planId).toBe('plan-1');
    expect(out.workspaceId).toBe('ws-1');
    expect(out.customerName).toBe('Daniel Penin');
    expect(out.customerEmail).toBe('daniel@kloel.com');
  });

  it('uses customer name as destinatario when empty', () => {
    const out = buildOrderPayload('plan-1', 'ws-1', params());
    expect(out.shippingAddress.destinatario).toBe(baseForm.name);
  });

  it('preserves destinatario when explicitly set', () => {
    const out = buildOrderPayload(
      'plan-1',
      'ws-1',
      params({ form: { ...baseForm, destinatario: 'Outra Pessoa' } }),
    );
    expect(out.shippingAddress.destinatario).toBe('Outra Pessoa');
  });

  it('includes coupon fields only when couponApplied is true', () => {
    const applied = buildOrderPayload('plan-1', 'ws-1', params());
    expect(applied.couponCode).toBe('PROMO');
    expect(applied.couponDiscount).toBe(500);

    const skipped = buildOrderPayload(
      'plan-1',
      'ws-1',
      params({ couponApplied: false }),
    );
    expect(skipped.couponCode).toBeUndefined();
    expect(skipped.couponDiscount).toBeUndefined();
  });

  it('forces installments=1 for non-card payments', () => {
    const pix = buildOrderPayload('p', 'w', params({ payMethod: 'pix', installments: 6 }));
    expect(pix.installments).toBe(1);
    expect(pix.paymentMethod).toBe('PIX');
  });

  it('sets cardHolderName only for card payments, defaulting to customer name', () => {
    const card = buildOrderPayload('p', 'w', params());
    expect(card.cardHolderName).toBe(baseForm.name);

    const namedCard = buildOrderPayload(
      'p',
      'w',
      params({ form: { ...baseForm, cardName: 'CARD HOLDER' } }),
    );
    expect(namedCard.cardHolderName).toBe('CARD HOLDER');

    const pix = buildOrderPayload('p', 'w', params({ payMethod: 'pix' }));
    expect(pix.cardHolderName).toBeUndefined();
  });

  it('forwards affiliateWorkspaceId as affiliateId', () => {
    const out = buildOrderPayload('p', 'w', params({ affiliateWorkspaceId: 'aff-2' }));
    expect(out.affiliateId).toBe('aff-2');
  });
});
