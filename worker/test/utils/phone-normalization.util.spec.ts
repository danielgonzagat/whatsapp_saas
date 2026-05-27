import { describe, it, expect } from 'vitest';
import {
  extractAsciiDigits,
  extractPhoneFromChatId,
  normalizePhone,
  phonesMatch,
} from '../../utils/phone-normalization.util';

/**
 * Worker mirror of backend/src/common/phone/phone-normalization.util.spec.ts.
 *
 * Cases are intentionally identical to the backend Jest spec so any future
 * divergence between the two utils is caught by ONE of these runners.
 * Jest `test()` calls were rewritten as Vitest `it()` (functionally
 * equivalent — vi exposes both).
 */
describe('phone-normalization.util (worker mirror)', () => {
  describe('extractAsciiDigits', () => {
    it('returns empty for null', () => {
      expect(extractAsciiDigits(null)).toBe('');
    });

    it('returns empty for undefined', () => {
      expect(extractAsciiDigits(undefined)).toBe('');
    });

    it('returns empty for empty string', () => {
      expect(extractAsciiDigits('')).toBe('');
    });

    it('strips parens, dashes, spaces from a BR-formatted number', () => {
      expect(extractAsciiDigits('(11) 98765-4321')).toBe('11987654321');
    });

    it('preserves digits when input has only digits', () => {
      expect(extractAsciiDigits('5511987654321')).toBe('5511987654321');
    });

    it('drops the leading + sign but keeps the rest', () => {
      expect(extractAsciiDigits('+55 11 98765-4321')).toBe('5511987654321');
    });
  });

  describe('normalizePhone — null / invalid', () => {
    it('returns null for null input', () => {
      expect(normalizePhone(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(normalizePhone(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(normalizePhone('')).toBeNull();
    });

    it('returns null for non-numeric garbage', () => {
      expect(normalizePhone('abc')).toBeNull();
    });

    it('returns null for too-short (< 8 digits)', () => {
      expect(normalizePhone('1234567')).toBeNull();
    });

    it('returns 9-digit input untouched (>= MIN, no BR promote)', () => {
      // "987654321" -> 9 digits domestic, NOT promoted (only 10/11), >= MIN(8).
      // Contract: accept as syntactically valid with no country.
      const r = normalizePhone('987654321');
      expect(r).not.toBeNull();
      expect(r?.digits).toBe('987654321');
      expect(r?.country).toBeNull();
    });

    it('returns null for absurdly long input (> 15 digits)', () => {
      expect(normalizePhone('12345678901234567890')).toBeNull();
    });
  });

  describe('normalizePhone — Brazilian inputs', () => {
    it('+5511987654321 returns digits 5511987654321', () => {
      const r = normalizePhone('+5511987654321');
      expect(r?.digits).toBe('5511987654321');
      expect(r?.e164).toBe('+5511987654321');
      expect(r?.country).toBe('BR');
      expect(r?.valid).toBe(true);
    });

    it('"(11) 98765-4321" Brazilian formatted → 5511987654321', () => {
      const r = normalizePhone('(11) 98765-4321');
      expect(r?.digits).toBe('5511987654321');
      expect(r?.country).toBe('BR');
    });

    it('"11987654321" (BR with DDD, no country) → 5511987654321', () => {
      const r = normalizePhone('11987654321');
      expect(r?.digits).toBe('5511987654321');
      expect(r?.country).toBe('BR');
    });

    it('"1133334444" (BR landline 10 digits) → 551133334444', () => {
      const r = normalizePhone('1133334444');
      expect(r?.digits).toBe('551133334444');
      expect(r?.country).toBe('BR');
    });

    it('"+55 (11) 98765-4321" survives the punctuation pass', () => {
      const r = normalizePhone('+55 (11) 98765-4321');
      expect(r?.digits).toBe('5511987654321');
      expect(r?.e164).toBe('+5511987654321');
    });
  });

  describe('normalizePhone — international inputs', () => {
    it('"+1 415 555 1234" US format', () => {
      const r = normalizePhone('+1 415 555 1234');
      expect(r?.digits).toBe('14155551234');
      expect(r?.e164).toBe('+14155551234');
      expect(r?.country).toBe('US');
    });

    it('"0044 20 7946 0958" UK with 00 prefix', () => {
      const r = normalizePhone('0044 20 7946 0958');
      expect(r?.digits).toBe('442079460958');
      expect(r?.e164).toBe('+442079460958');
      expect(r?.country).toBe('GB');
    });

    it('"+351 912 345 678" Portugal', () => {
      const r = normalizePhone('+351 912 345 678');
      expect(r?.digits).toBe('351912345678');
      expect(r?.country).toBe('PT');
    });

    it('+ prefix does NOT trigger BR promotion (caller already gave a country code)', () => {
      // "+1" + 9 domestic digits = 10 digits total; NOT promoted.
      const r = normalizePhone('+123456789');
      expect(r?.digits).toBe('123456789');
    });
  });

  describe('extractPhoneFromChatId', () => {
    it('"5511987654321@c.us" -> 5511987654321', () => {
      expect(extractPhoneFromChatId('5511987654321@c.us')).toBe('5511987654321');
    });

    it('"5511987654321@s.whatsapp.net" -> 5511987654321', () => {
      expect(extractPhoneFromChatId('5511987654321@s.whatsapp.net')).toBe('5511987654321');
    });

    it('bare digits pass through', () => {
      expect(extractPhoneFromChatId('5511987654321')).toBe('5511987654321');
    });

    it('group chat returns null', () => {
      expect(extractPhoneFromChatId('120363025343298765@g.us')).toBeNull();
    });

    it('LID form returns null', () => {
      expect(extractPhoneFromChatId('12345678@lid')).toBeNull();
    });

    it('broadcast list returns null', () => {
      expect(extractPhoneFromChatId('status@broadcast')).toBeNull();
    });

    it('newsletter returns null', () => {
      expect(extractPhoneFromChatId('120363@newsletter')).toBeNull();
    });

    it('empty input returns null', () => {
      expect(extractPhoneFromChatId('')).toBeNull();
    });

    it('null input returns null', () => {
      expect(extractPhoneFromChatId(null)).toBeNull();
    });

    it('unknown @-suffix returns null instead of bogus digits', () => {
      expect(extractPhoneFromChatId('5511987654321@unknown.shape')).toBeNull();
    });
  });

  describe('phonesMatch', () => {
    it('exact digits match', () => {
      expect(phonesMatch('5511987654321', '5511987654321')).toBe(true);
    });

    it('formatted vs unformatted match', () => {
      expect(phonesMatch('+55 (11) 98765-4321', '5511987654321')).toBe(true);
    });

    it('domestic vs E.164 BR match (via normalize)', () => {
      expect(phonesMatch('+5511987654321', '11987654321')).toBe(true);
    });

    it('different DDDs do NOT match', () => {
      expect(phonesMatch('5511987654321', '5521987654321')).toBe(false);
    });

    it('totally different numbers do NOT match', () => {
      expect(phonesMatch('5511987654321', '14155551234')).toBe(false);
    });

    it('null on either side returns false', () => {
      expect(phonesMatch(null, '5511987654321')).toBe(false);
      expect(phonesMatch('5511987654321', null)).toBe(false);
    });

    it('empty string on either side returns false', () => {
      expect(phonesMatch('', '5511987654321')).toBe(false);
    });

    it('last-8 fallback rejects collisions whose tails do not match', () => {
      const lhs = '5511987654321';
      // 17 digits, fails canonicalize (> 15). Tail-8 = "65432198" — does
      // NOT match lhs tail-8 "87654321".
      const rhs = '99999998765432198';
      expect(phonesMatch(lhs, rhs)).toBe(false);
    });

    it('last-8 fallback returns true when one side is too long but tails match', () => {
      const lhs = '5511987654321'; // tail-8 = "87654321"
      const rhs = '999999999987654321'; // 18 digits, fails canonicalize; tail-8 = "87654321"
      expect(phonesMatch(lhs, rhs)).toBe(true);
    });
  });
});
