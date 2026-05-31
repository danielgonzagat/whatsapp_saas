import { describe, expect, it, vi } from 'vitest';

import { EMPTY_CHECKOUT_EXPERIENCE_FORM } from './checkout-experience-social-helpers';
import {
  buildAddressLeadProgress,
  buildIdentityLeadProgress,
  buildSafeSuccessRedirect,
  countCpfDigits,
  extractSubmitErrorMessage,
  formatCheckoutFieldValue,
  normalizeAcceptedCouponDiscount,
  parseInstallmentsField,
  resolveApplyCouponErrorMessage,
  resolveCouponPopupDelay,
  resolveFinalizeOrderErrorMessage,
  resolveStripeConfirmationErrorMessage,
} from './useCheckoutExperienceSocial.helpers';

const passthroughFmt = {
  cpf: vi.fn((value: string) => `cpf:${value}`),
  phone: vi.fn((value: string) => `phone:${value}`),
  cep: vi.fn((value: string) => `cep:${value}`),
  brl: vi.fn((value: number) => `R$${(value / 100).toFixed(2)}`),
};

describe('extractSubmitErrorMessage', () => {
  it('returns the message of a real Error instance', () => {
    expect(extractSubmitErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('falls back when the Error message is empty', () => {
    expect(extractSubmitErrorMessage(new Error(''), 'fallback')).toBe('fallback');
  });

  it('falls back when the thrown value is not an Error', () => {
    expect(extractSubmitErrorMessage('plain string', 'fallback')).toBe('fallback');
    expect(extractSubmitErrorMessage(null, 'fallback')).toBe('fallback');
    expect(extractSubmitErrorMessage(undefined, 'fallback')).toBe('fallback');
    expect(extractSubmitErrorMessage({ message: 'ignored' }, 'fallback')).toBe('fallback');
  });
});

describe('resolveFinalizeOrderErrorMessage', () => {
  it('uses the Error message when present', () => {
    expect(resolveFinalizeOrderErrorMessage(new Error('Stripe declined'))).toBe('Stripe declined');
  });

  it('falls back to the canonical checkout failure message', () => {
    expect(resolveFinalizeOrderErrorMessage('weird')).toBe(
      'Erro ao processar o checkout. Tente novamente.',
    );
  });
});

describe('resolveApplyCouponErrorMessage', () => {
  it('uses the Error message when present', () => {
    expect(resolveApplyCouponErrorMessage(new Error('Cupom usado'))).toBe('Cupom usado');
  });

  it('falls back to the canonical coupon failure message', () => {
    expect(resolveApplyCouponErrorMessage({})).toBe('Cupom inválido ou expirado.');
  });
});

describe('resolveStripeConfirmationErrorMessage', () => {
  it('preserves a non-empty message', () => {
    expect(resolveStripeConfirmationErrorMessage('card_declined')).toBe('card_declined');
  });

  it('falls back when the message is whitespace-only', () => {
    expect(resolveStripeConfirmationErrorMessage('   ')).toBe(
      'Erro ao confirmar o pagamento no Stripe.',
    );
  });

  it('falls back when the message is empty', () => {
    expect(resolveStripeConfirmationErrorMessage('')).toBe(
      'Erro ao confirmar o pagamento no Stripe.',
    );
  });

  it('falls back when the message is null or undefined', () => {
    expect(resolveStripeConfirmationErrorMessage(null)).toBe(
      'Erro ao confirmar o pagamento no Stripe.',
    );
    expect(resolveStripeConfirmationErrorMessage(undefined)).toBe(
      'Erro ao confirmar o pagamento no Stripe.',
    );
  });
});

describe('countCpfDigits', () => {
  it('counts the digits in a fully-formatted CPF', () => {
    expect(countCpfDigits('123.456.789-09')).toBe(11);
  });

  it('counts the digits in an unformatted CPF', () => {
    expect(countCpfDigits('12345678909')).toBe(11);
  });

  it('returns zero for empty strings and nullish input', () => {
    expect(countCpfDigits('')).toBe(0);
    expect(countCpfDigits(null)).toBe(0);
    expect(countCpfDigits(undefined)).toBe(0);
  });

  it('ignores every non-digit character', () => {
    expect(countCpfDigits('abc--12.3xx4')).toBe(4);
  });
});

describe('formatCheckoutFieldValue', () => {
  it('applies the cpf formatter to the cpf field', () => {
    expect(formatCheckoutFieldValue('cpf', '00000000000', passthroughFmt)).toBe('cpf:00000000000');
  });

  it('applies the cpf formatter to the cardCpf field', () => {
    expect(formatCheckoutFieldValue('cardCpf', '00000000000', passthroughFmt)).toBe(
      'cpf:00000000000',
    );
  });

  it('applies the phone formatter to the phone field', () => {
    expect(formatCheckoutFieldValue('phone', '62999990000', passthroughFmt)).toBe(
      'phone:62999990000',
    );
  });

  it('applies the cep formatter to the cep field', () => {
    expect(formatCheckoutFieldValue('cep', '75000000', passthroughFmt)).toBe('cep:75000000');
  });

  it('passes unknown fields through unchanged', () => {
    expect(formatCheckoutFieldValue('name', '  Maria  ', passthroughFmt)).toBe('  Maria  ');
    expect(formatCheckoutFieldValue('street', 'Rua Um', passthroughFmt)).toBe('Rua Um');
    expect(formatCheckoutFieldValue('installments', '3', passthroughFmt)).toBe('3');
  });
});

describe('buildSafeSuccessRedirect', () => {
  const origin = 'https://kloel.com';

  it('returns href and path for a same-origin absolute URL', () => {
    const result = buildSafeSuccessRedirect('https://kloel.com/order/123/success?ref=email', origin);
    expect(result.href).toBe('https://kloel.com/order/123/success?ref=email');
    expect(result.path).toBe('/order/123/success?ref=email');
  });

  it('resolves a relative path against the origin', () => {
    const result = buildSafeSuccessRedirect('/order/123/success', origin);
    expect(result.href).toBe('https://kloel.com/order/123/success');
    expect(result.path).toBe('/order/123/success');
  });

  it('preserves search + hash fragments in the path projection', () => {
    const result = buildSafeSuccessRedirect('/order/123/pix?ref=fb#section', origin);
    expect(result.path).toBe('/order/123/pix?ref=fb#section');
  });

  it('throws when the redirect target is a different origin', () => {
    expect(() => buildSafeSuccessRedirect('https://evil.example/steal', origin)).toThrow(
      'Redirecionamento bloqueado: destino externo detectado.',
    );
  });

  it('throws when an open-redirect-style protocol-relative URL is supplied', () => {
    expect(() => buildSafeSuccessRedirect('//evil.example/steal', origin)).toThrow(
      'Redirecionamento bloqueado: destino externo detectado.',
    );
  });
});

describe('buildIdentityLeadProgress', () => {
  it('projects only identity fields from the form', () => {
    const form = {
      ...EMPTY_CHECKOUT_EXPERIENCE_FORM,
      name: 'Maria',
      email: 'maria@example.com',
      cpf: '123.456.789-09',
      phone: '(62) 99999-0000',
      street: 'Rua Um',
    };
    expect(buildIdentityLeadProgress(form)).toEqual({
      name: 'Maria',
      email: 'maria@example.com',
      phone: '(62) 99999-0000',
      cpf: '123.456.789-09',
    });
  });
});

describe('buildAddressLeadProgress', () => {
  it('projects identity + address fields from the form', () => {
    const form = {
      ...EMPTY_CHECKOUT_EXPERIENCE_FORM,
      name: 'Maria',
      email: 'maria@example.com',
      cpf: '123.456.789-09',
      phone: '(62) 99999-0000',
      cep: '75000-000',
      street: 'Rua Um',
      number: '100',
      neighborhood: 'Centro',
      city: 'Goiânia',
      state: 'GO',
      complement: 'Apto 1',
    };
    expect(buildAddressLeadProgress(form)).toEqual({
      name: 'Maria',
      email: 'maria@example.com',
      phone: '(62) 99999-0000',
      cpf: '123.456.789-09',
      cep: '75000-000',
      street: 'Rua Um',
      number: '100',
      neighborhood: 'Centro',
      city: 'Goiânia',
      state: 'GO',
      complement: 'Apto 1',
    });
  });

  it('does not leak card fields into the lead progress payload', () => {
    const form = {
      ...EMPTY_CHECKOUT_EXPERIENCE_FORM,
      cardNumber: '4242 4242 4242 4242',
      cardCvv: '123',
      cardExp: '12/30',
      cardName: 'MARIA TESTE',
      cardCpf: '000.000.000-00',
    };
    const projection = buildAddressLeadProgress(form);
    expect(projection).not.toHaveProperty('cardNumber');
    expect(projection).not.toHaveProperty('cardCvv');
    expect(projection).not.toHaveProperty('cardExp');
    expect(projection).not.toHaveProperty('cardName');
    expect(projection).not.toHaveProperty('cardCpf');
  });
});

describe('normalizeAcceptedCouponDiscount', () => {
  it('returns zero for nullish or non-numeric input', () => {
    expect(normalizeAcceptedCouponDiscount(null)).toBe(0);
    expect(normalizeAcceptedCouponDiscount(undefined)).toBe(0);
    expect(normalizeAcceptedCouponDiscount('abc')).toBe(0);
    expect(normalizeAcceptedCouponDiscount(Number.NaN)).toBe(0);
  });

  it('rounds floats to the nearest integer', () => {
    expect(normalizeAcceptedCouponDiscount(199.4)).toBe(199);
    expect(normalizeAcceptedCouponDiscount(199.6)).toBe(200);
  });

  it('clamps negative discounts to zero', () => {
    expect(normalizeAcceptedCouponDiscount(-500)).toBe(0);
  });

  it('preserves valid non-negative integers', () => {
    expect(normalizeAcceptedCouponDiscount(1234)).toBe(1234);
  });

  it('parses numeric strings', () => {
    expect(normalizeAcceptedCouponDiscount('500')).toBe(500);
  });
});

describe('resolveCouponPopupDelay', () => {
  it('returns the fallback (1800) when no value is supplied', () => {
    expect(resolveCouponPopupDelay(undefined)).toBe(1800);
    expect(resolveCouponPopupDelay(null)).toBe(1800);
    expect(resolveCouponPopupDelay(0)).toBe(1800);
  });

  it('returns the supplied value when it is a valid non-negative number', () => {
    expect(resolveCouponPopupDelay(500)).toBe(500);
    expect(resolveCouponPopupDelay('2500')).toBe(2500);
  });

  it('returns the fallback when the value is not finite', () => {
    expect(resolveCouponPopupDelay('not-a-number')).toBe(1800);
    expect(resolveCouponPopupDelay(Number.POSITIVE_INFINITY)).toBe(1800);
  });

  it('returns the fallback when the value is negative', () => {
    expect(resolveCouponPopupDelay(-100)).toBe(1800);
  });

  it('respects a custom fallback', () => {
    expect(resolveCouponPopupDelay(undefined, 4000)).toBe(4000);
  });
});

describe('parseInstallmentsField', () => {
  it('returns 1 for empty/nullish input', () => {
    expect(parseInstallmentsField(undefined)).toBe(1);
    expect(parseInstallmentsField(null)).toBe(1);
    expect(parseInstallmentsField('')).toBe(1);
  });

  it('returns 1 for non-numeric input', () => {
    expect(parseInstallmentsField('abc')).toBe(1);
  });

  it('clamps zero and negative values to 1', () => {
    expect(parseInstallmentsField('0')).toBe(1);
    expect(parseInstallmentsField('-3')).toBe(1);
  });

  it('returns the parsed integer for positive numeric strings', () => {
    expect(parseInstallmentsField('5')).toBe(5);
    expect(parseInstallmentsField('12')).toBe(12);
  });
});
