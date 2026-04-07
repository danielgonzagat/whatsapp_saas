import { describe, expect, it } from 'vitest';
import { buildFooterPrimaryLine, formatCnpj, normalizeTestimonials } from './checkout-theme-shared';

describe('checkout-theme-shared', () => {
  it('normalizes testimonials with fallback avatars and respects enable flag', () => {
    expect(
      normalizeTestimonials(
        'Coreamy',
        [{ name: 'Fallback', stars: 5, text: 'ok', avatar: 'FB' }],
        [],
        false,
      ),
    ).toEqual([]);

    expect(
      normalizeTestimonials(
        'Coreamy',
        [{ name: 'Fallback', stars: 5, text: 'ok', avatar: 'FB' }],
        [{ name: 'Maria Silva', rating: 4, text: 'Muito bom' }],
      ),
    ).toEqual([
      {
        name: 'Maria Silva',
        stars: 4,
        text: 'Muito bom',
        avatar: 'MS',
      },
    ]);
  });

  it('builds footer line from custom domain and formats cnpj safely', () => {
    expect(
      buildFooterPrimaryLine('Coreamy', {
        companyName: 'Coreamy Labs',
        customDomain: 'https://pay.coreamy.com.br',
      }),
    ).toBe('Coreamy: pay.coreamy.com.br');

    expect(formatCnpj('57785373000132')).toBe('57.785.373/0001-32');
    expect(formatCnpj('123')).toBe('123');
  });
});
