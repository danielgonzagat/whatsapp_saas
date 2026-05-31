import { describe, expect, it } from 'vitest';
import {
  PAYMENT_BADGES,
  buildAvatar,
  buildFooterPrimaryLine,
  clampQty,
  fmt,
  formatCnpj,
  normalizeTestimonials,
} from './checkout-theme-shared.helpers';

describe('checkout-theme-shared.helpers — fmt', () => {
  it('formats cpf incrementally as digits accumulate', () => {
    expect(fmt.cpf('')).toBe('');
    expect(fmt.cpf('12')).toBe('12');
    expect(fmt.cpf('1234')).toBe('123.4');
    expect(fmt.cpf('1234567')).toBe('123.456.7');
    expect(fmt.cpf('12345678901')).toBe('123.456.789-01');
    expect(fmt.cpf('1234567890123')).toBe('123.456.789-01');
  });

  it('strips non-digits before formatting cpf', () => {
    expect(fmt.cpf('abc123.456-789/01x')).toBe('123.456.789-01');
  });

  it('formats phone with DDD and 9-digit local number', () => {
    expect(fmt.phone('11')).toBe('11');
    expect(fmt.phone('1199')).toBe('(11) 99');
    expect(fmt.phone('11999887766')).toBe('(11) 99988-7766');
    expect(fmt.phone('119998877665555')).toBe('(11) 99988-7766');
  });

  it('formats cep with 5-3 split once long enough', () => {
    expect(fmt.cep('01')).toBe('01');
    expect(fmt.cep('01310')).toBe('01310');
    expect(fmt.cep('01310100')).toBe('01310-100');
  });

  it('formats card numbers in groups of four', () => {
    expect(fmt.card('4111111111111111')).toBe('4111 1111 1111 1111');
    expect(fmt.card('41111')).toBe('4111 1');
    expect(fmt.card('')).toBe('');
  });

  it('formats expiry mm/yy', () => {
    expect(fmt.exp('1')).toBe('1');
    expect(fmt.exp('12')).toBe('12');
    expect(fmt.exp('1228')).toBe('12/28');
  });

  it('formats brl currency from cents', () => {
    expect(fmt.brl(0)).toContain('0,00');
    expect(fmt.brl(12345).replace(/\s/g, ' ')).toContain('123,45');
    expect(fmt.brl(Number.NaN).replace(/\s/g, ' ')).toContain('0,00');
  });
});

describe('checkout-theme-shared.helpers — clampQty', () => {
  it('clamps to [1, 99]', () => {
    expect(clampQty(0)).toBe(1);
    expect(clampQty(-5)).toBe(1);
    expect(clampQty(1)).toBe(1);
    expect(clampQty(50)).toBe(50);
    expect(clampQty(99)).toBe(99);
    expect(clampQty(150)).toBe(99);
  });

  it('rounds fractional values', () => {
    expect(clampQty(2.4)).toBe(2);
    expect(clampQty(2.6)).toBe(3);
  });

  it('defaults falsy input to 1', () => {
    expect(clampQty(Number.NaN)).toBe(1);
    expect(clampQty(undefined as unknown as number)).toBe(1);
  });
});

describe('checkout-theme-shared.helpers — buildAvatar', () => {
  it('returns KL when name is empty or whitespace', () => {
    expect(buildAvatar()).toBe('KL');
    expect(buildAvatar('')).toBe('KL');
    expect(buildAvatar('   ')).toBe('KL');
  });

  it('uses first letters of first two words when present', () => {
    expect(buildAvatar('Maria Silva')).toBe('MS');
    expect(buildAvatar('Joao Pedro Souza')).toBe('JP');
  });

  it('falls back to first two letters of single-word names', () => {
    expect(buildAvatar('Daniel')).toBe('Da');
  });

  it('handles single character names via the L fallback', () => {
    expect(buildAvatar('K')).toBe('KL');
  });
});

describe('checkout-theme-shared.helpers — normalizeTestimonials', () => {
  const fallback = [{ name: 'Fallback', stars: 5, text: 'ok', avatar: 'FB' }];

  it('returns empty array when explicitly disabled', () => {
    expect(normalizeTestimonials('Brand', fallback, [], false)).toEqual([]);
  });

  it('returns fallback list when testimonials missing or empty', () => {
    expect(normalizeTestimonials('Brand', fallback)).toEqual(fallback);
    expect(normalizeTestimonials('Brand', fallback, [])).toEqual(fallback);
  });

  it('caps payload to 3 entries and normalizes shape', () => {
    const raw = Array.from({ length: 5 }, (_, index) => ({
      name: `User ${index}`,
      rating: index + 1,
      text: `Text ${index}`,
    }));
    const result = normalizeTestimonials('Brand', fallback, raw);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ name: 'User 0', stars: 1, text: 'Text 0' });
    expect(result[0]?.avatar).toBe('U0');
  });

  it('synthesizes brand-aware text and default avatar when payload is sparse', () => {
    const result = normalizeTestimonials('Coreamy', fallback, [
      { name: '', rating: 0, text: '' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Cliente');
    expect(result[0]?.stars).toBe(5);
    expect(result[0]?.text).toContain('Coreamy');
    expect(result[0]?.avatar).toBe('KL');
  });

  it('honors stars when rating is absent', () => {
    const result = normalizeTestimonials('Brand', fallback, [
      { name: 'Ada', stars: 4, text: 'Boa' },
    ]);
    expect(result[0]?.stars).toBe(4);
  });
});

describe('checkout-theme-shared.helpers — formatCnpj', () => {
  it('formats a clean 14-digit cnpj', () => {
    expect(formatCnpj('57785373000132')).toBe('57.785.373/0001-32');
  });

  it('strips non-digits before formatting', () => {
    expect(formatCnpj('57.785.373/0001-32')).toBe('57.785.373/0001-32');
  });

  it('returns original input when digit count differs from 14', () => {
    expect(formatCnpj('123')).toBe('123');
    expect(formatCnpj(null)).toBe('');
    expect(formatCnpj(undefined)).toBe('');
    expect(formatCnpj('')).toBe('');
  });
});

describe('checkout-theme-shared.helpers — buildFooterPrimaryLine', () => {
  it('strips https scheme from merchant custom domain', () => {
    expect(
      buildFooterPrimaryLine('Brand', {
        companyName: 'Brand LLC',
        customDomain: 'https://pay.brand.com',
      }),
    ).toBe('Brand: pay.brand.com');
  });

  it('strips http scheme as well', () => {
    expect(
      buildFooterPrimaryLine('Brand', {
        companyName: 'Brand LLC',
        customDomain: 'http://pay.brand.com',
      }),
    ).toBe('Brand: pay.brand.com');
  });

  it('falls back to pay.kloel.com when merchant is missing or empty', () => {
    expect(buildFooterPrimaryLine('Brand')).toBe('Brand: pay.kloel.com');
    expect(
      buildFooterPrimaryLine('Brand', { companyName: 'Brand LLC', customDomain: '' }),
    ).toBe('Brand: pay.kloel.com');
    expect(
      buildFooterPrimaryLine('Brand', { companyName: 'Brand LLC', customDomain: '   ' }),
    ).toBe('Brand: pay.kloel.com');
  });
});

describe('checkout-theme-shared.helpers — PAYMENT_BADGES', () => {
  it('exposes the canonical 9-method ordering for the badge strip', () => {
    expect(PAYMENT_BADGES).toEqual([
      'AMEX',
      'VISA',
      'Diners',
      'Master',
      'Discover',
      'Aura',
      'Elo',
      'Pix',
      'Boleto',
    ]);
  });
});
