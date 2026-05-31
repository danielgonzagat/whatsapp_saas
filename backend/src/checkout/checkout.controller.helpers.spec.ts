import { TimerType } from '@prisma/client';

import {
  buildCheckoutConfigUpdateInput,
  buildCheckoutSlug,
  buildProductSlug,
  extractErrorCode,
  normalizeTimerType,
} from './checkout.controller.helpers';

describe('checkout.controller.helpers', () => {
  describe('normalizeTimerType', () => {
    it.each([
      ['COUNTDOWN', TimerType.COUNTDOWN],
      ['countdown', TimerType.COUNTDOWN],
      ['EVERGREEN', TimerType.COUNTDOWN],
      [' evergreen ', TimerType.COUNTDOWN],
      ['EXPIRATION', TimerType.EXPIRATION],
      ['fixed', TimerType.EXPIRATION],
      ['STOCK', TimerType.STOCK],
    ])('normalizes %s to %s', (input, expected) => {
      expect(normalizeTimerType(input)).toBe(expected);
    });

    it('returns undefined for unsupported strings', () => {
      expect(normalizeTimerType('unsupported')).toBeUndefined();
    });

    it.each([null, undefined, {}, [], () => undefined])('returns undefined for %p', (value) => {
      expect(normalizeTimerType(value)).toBeUndefined();
    });

    it('coerces primitives that pass the typeof guard', () => {
      expect(normalizeTimerType(1)).toBeUndefined();
      expect(normalizeTimerType(true)).toBeUndefined();
    });
  });

  describe('buildCheckoutSlug', () => {
    it('strips diacritics, lowercases, and appends a base36 timestamp', () => {
      const now = new Date('2025-01-02T03:04:05Z');
      expect(buildCheckoutSlug('Promoção Black Friday', now)).toBe(
        `promocao-black-friday-${now.getTime().toString(36)}`,
      );
    });

    it('falls back to "checkout" when the input collapses to empty', () => {
      const now = new Date('2025-01-02T03:04:05Z');
      expect(buildCheckoutSlug('   ', now)).toBe(`checkout-${now.getTime().toString(36)}`);
    });

    it('truncates the slug base to 48 characters before appending the suffix', () => {
      const now = new Date('2025-01-02T03:04:05Z');
      const value = 'a'.repeat(80);
      const slug = buildCheckoutSlug(value, now);
      const [base] = slug.split('-');
      expect(base.length).toBeLessThanOrEqual(48);
    });
  });

  describe('buildProductSlug', () => {
    it('produces a normalized slug with a base36 timestamp suffix', () => {
      const now = new Date('2025-01-02T03:04:05Z');
      expect(buildProductSlug('Camiseta Branca XL', now)).toBe(
        `camiseta-branca-xl-${now.getTime().toString(36)}`,
      );
    });

    it('defaults to "product" when name is missing', () => {
      const now = new Date('2025-01-02T03:04:05Z');
      expect(buildProductSlug(undefined, now)).toBe(`product-${now.getTime().toString(36)}`);
    });
  });

  describe('extractErrorCode', () => {
    it('returns the code property when present', () => {
      expect(extractErrorCode(new Error('boom'))).toBe('unknown');
      expect(extractErrorCode({ code: 'P2002' })).toBe('P2002');
    });

    it('honors the override fallback', () => {
      expect(extractErrorCode(undefined, 'fallback-code')).toBe('fallback-code');
    });
  });

  describe('buildCheckoutConfigUpdateInput', () => {
    it('normalizes timer, testimonials, and trust badges when provided', () => {
      const input = buildCheckoutConfigUpdateInput({
        timerType: 'fixed',
        testimonials: [{ name: 'a', body: 'b' }],
        trustBadges: [{ src: 'x', alt: 'y' }],
        rest: { headerColor: '#000', headlineText: undefined, ctaLabel: 'Comprar' },
      });
      expect(input).toEqual({
        timerType: TimerType.EXPIRATION,
        testimonials: [{ name: 'a', body: 'b' }],
        trustBadges: [{ src: 'x', alt: 'y' }],
        headerColor: '#000',
        ctaLabel: 'Comprar',
      });
    });

    it('omits keys whose values are undefined and skips unrecognized timer values', () => {
      const input = buildCheckoutConfigUpdateInput({
        timerType: 'WHATEVER',
        rest: { foo: undefined, bar: 1 },
      });
      expect(input).toEqual({ bar: 1 });
    });
  });
});
