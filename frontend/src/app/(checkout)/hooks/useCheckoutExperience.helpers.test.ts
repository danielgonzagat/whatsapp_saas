import { describe, expect, it } from 'vitest';

import type { PublicCheckoutConfig } from '@/lib/public-checkout-contract';
import type { CheckoutExperienceFormState } from './useCheckoutExperience.types';
import {
  buildOrderPayload,
  isStep1Valid,
  isStep2Valid,
  resolveSubmitErrorMessage,
  resolveSuccessRedirect,
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

  it('returns false when each field is whitespace-only', () => {
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
