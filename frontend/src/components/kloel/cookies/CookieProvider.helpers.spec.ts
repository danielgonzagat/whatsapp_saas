import { describe, expect, it } from 'vitest';
import {
  COOKIE_CONSENT_HOSTS,
  COOKIE_TOAST_DURATION_MS,
  isCookieConsentSurface,
  normalizeConsent,
  OPEN_COOKIE_PREFERENCES_EVENT,
} from './CookieProvider.helpers';
import type { CookieConsentPreferences } from './cookie-types';

describe('CookieProvider.helpers', () => {
  describe('OPEN_COOKIE_PREFERENCES_EVENT', () => {
    it('exposes a stable, namespaced event name', () => {
      expect(OPEN_COOKIE_PREFERENCES_EVENT).toBe('kloel:open-cookie-preferences');
    });
  });

  describe('COOKIE_TOAST_DURATION_MS', () => {
    it('matches the legacy toast auto-dismiss window', () => {
      expect(COOKIE_TOAST_DURATION_MS).toBe(2500);
    });
  });

  describe('COOKIE_CONSENT_HOSTS', () => {
    it('covers both bare and www apex hosts', () => {
      expect(COOKIE_CONSENT_HOSTS).toEqual(['kloel.com', 'www.kloel.com']);
    });
  });

  describe('isCookieConsentSurface', () => {
    it('matches the bare apex host', () => {
      expect(isCookieConsentSurface('kloel.com')).toBe(true);
    });

    it('matches the www apex host', () => {
      expect(isCookieConsentSurface('www.kloel.com')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isCookieConsentSurface('Kloel.COM')).toBe(true);
      expect(isCookieConsentSurface('WWW.KLOEL.COM')).toBe(true);
    });

    it('rejects unrelated tenant subdomains', () => {
      expect(isCookieConsentSurface('app.kloel.com')).toBe(false);
      expect(isCookieConsentSurface('admin.kloel.com')).toBe(false);
    });

    it('rejects unrelated hosts entirely', () => {
      expect(isCookieConsentSurface('example.com')).toBe(false);
      expect(isCookieConsentSurface('localhost')).toBe(false);
      expect(isCookieConsentSurface('')).toBe(false);
    });

    it('does not partial-match suffixes', () => {
      // Defensive: substring containment must not pass.
      expect(isCookieConsentSurface('evilkloel.com')).toBe(false);
      expect(isCookieConsentSurface('kloel.com.evil')).toBe(false);
    });
  });

  describe('normalizeConsent', () => {
    it('returns null for null input', () => {
      expect(normalizeConsent(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(normalizeConsent(undefined)).toBeNull();
    });

    it('forces necessary to true even when input claims otherwise', () => {
      const loose = {
        necessary: false,
        analytics: true,
        marketing: true,
      } as unknown as CookieConsentPreferences;
      const result = normalizeConsent(loose);
      expect(result).not.toBeNull();
      expect(result?.necessary).toBe(true);
    });

    it('coerces analytics and marketing to booleans (truthy)', () => {
      const loose = {
        necessary: true,
        analytics: 1,
        marketing: 'yes',
      } as unknown as CookieConsentPreferences;
      const result = normalizeConsent(loose);
      expect(result).toEqual({
        necessary: true,
        analytics: true,
        marketing: true,
      });
    });

    it('coerces analytics and marketing to booleans (falsy)', () => {
      const loose = {
        necessary: true,
        analytics: 0,
        marketing: null,
      } as unknown as CookieConsentPreferences;
      const result = normalizeConsent(loose);
      expect(result).toEqual({
        necessary: true,
        analytics: false,
        marketing: false,
      });
    });

    it('omits updatedAt when not present', () => {
      const result = normalizeConsent({
        necessary: true,
        analytics: true,
        marketing: false,
      });
      expect(result).toEqual({
        necessary: true,
        analytics: true,
        marketing: false,
      });
      expect(result && 'updatedAt' in result).toBe(false);
    });

    it('forwards updatedAt verbatim when present', () => {
      const updatedAt = '2026-05-28T12:34:56.000Z';
      const input: CookieConsentPreferences = {
        necessary: true,
        analytics: true,
        marketing: false,
        updatedAt,
      };
      const result = normalizeConsent(input);
      expect(result).toEqual({
        necessary: true,
        analytics: true,
        marketing: false,
        updatedAt,
      });
    });

    it('does not mutate the input object', () => {
      const input: CookieConsentPreferences = {
        necessary: true,
        analytics: false,
        marketing: true,
        updatedAt: '2026-05-28T00:00:00.000Z',
      };
      const snapshot = { ...input };
      normalizeConsent(input);
      expect(input).toEqual(snapshot);
    });

    it('returns a fresh object (no aliasing)', () => {
      const input: CookieConsentPreferences = {
        necessary: true,
        analytics: true,
        marketing: true,
      };
      const result = normalizeConsent(input);
      expect(result).not.toBe(input);
    });
  });
});
