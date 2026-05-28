import {
  ADMIN_MFA_BYPASS_ENV,
  BCRYPT_WORK_FACTOR,
  MFA_BYPASS_ENABLED_VALUES,
  isAccountLocked,
  isMfaBypassEnvEnabled,
  isSessionExpired,
  normalizeAdminEmail,
} from './admin-auth.helpers';

describe('admin-auth.helpers', () => {
  describe('constants', () => {
    it('exposes the bcrypt work factor used by the service', () => {
      expect(BCRYPT_WORK_FACTOR).toBe(12);
    });

    it('names the MFA bypass env var', () => {
      expect(ADMIN_MFA_BYPASS_ENV).toBe('ADMIN_MFA_BYPASS_ENABLED');
    });

    it('enumerates the truthy MFA bypass values', () => {
      expect([...MFA_BYPASS_ENABLED_VALUES].sort()).toEqual(['1', 'on', 'true', 'yes'].sort());
    });
  });

  describe('normalizeAdminEmail', () => {
    it('trims surrounding whitespace and lowercases', () => {
      expect(normalizeAdminEmail('  Admin@KLOEL.com  ')).toBe('admin@kloel.com');
    });

    it('is idempotent on already-normalized input', () => {
      const normalized = 'ops@kloel.com';
      expect(normalizeAdminEmail(normalized)).toBe(normalized);
    });

    it('handles empty string without throwing', () => {
      expect(normalizeAdminEmail('')).toBe('');
    });
  });

  describe('isMfaBypassEnvEnabled', () => {
    it.each(['1', 'true', 'TRUE', 'yes', 'YES', 'on', 'On'])(
      'returns true for truthy value %s',
      (raw) => {
        expect(isMfaBypassEnvEnabled(raw)).toBe(true);
      },
    );

    it.each(['', '0', 'false', 'no', 'off', 'something-else'])(
      'returns false for falsy value %s',
      (raw) => {
        expect(isMfaBypassEnvEnabled(raw)).toBe(false);
      },
    );

    it('returns false when the env var is unset', () => {
      expect(isMfaBypassEnvEnabled(undefined)).toBe(false);
    });

    it('trims surrounding whitespace before deciding', () => {
      expect(isMfaBypassEnvEnabled('  true  ')).toBe(true);
    });
  });

  describe('isAccountLocked', () => {
    const now = new Date('2026-01-01T12:00:00.000Z').getTime();

    it('returns false when lockedUntil is null', () => {
      expect(isAccountLocked(null, now)).toBe(false);
    });

    it('returns false when lockedUntil is undefined', () => {
      expect(isAccountLocked(undefined, now)).toBe(false);
    });

    it('returns true when lockedUntil is strictly in the future', () => {
      const future = new Date(now + 60_000);
      expect(isAccountLocked(future, now)).toBe(true);
    });

    it('returns false when lockedUntil equals now', () => {
      const exact = new Date(now);
      expect(isAccountLocked(exact, now)).toBe(false);
    });

    it('returns false when lockedUntil is in the past', () => {
      const past = new Date(now - 60_000);
      expect(isAccountLocked(past, now)).toBe(false);
    });

    it('defaults `now` to the current time when omitted', () => {
      const future = new Date(Date.now() + 30_000);
      expect(isAccountLocked(future)).toBe(true);
    });
  });

  describe('isSessionExpired', () => {
    const now = new Date('2026-01-01T12:00:00.000Z').getTime();

    it('returns false when expiresAt is in the future', () => {
      const future = new Date(now + 60_000);
      expect(isSessionExpired(future, now)).toBe(false);
    });

    it('returns false when expiresAt equals now', () => {
      const exact = new Date(now);
      expect(isSessionExpired(exact, now)).toBe(false);
    });

    it('returns true when expiresAt is in the past', () => {
      const past = new Date(now - 1);
      expect(isSessionExpired(past, now)).toBe(true);
    });

    it('defaults `now` to the current time when omitted', () => {
      const past = new Date(Date.now() - 60_000);
      expect(isSessionExpired(past)).toBe(true);
    });
  });
});
