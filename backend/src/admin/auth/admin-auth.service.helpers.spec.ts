import {
  ADMIN_MFA_BYPASS_ENV,
  BCRYPT_WORK_FACTOR,
  MFA_BYPASS_ENABLED_VALUES,
  assertTokenScope,
  extractBearerToken,
  extractClientIp,
  extractUserAgent,
  isAccountLocked,
  isMfaBypassEnvEnabled,
  isSessionExpired,
  normalizeAdminEmail,
  readForwardedForIp,
  type HttpRequestLike,
} from './admin-auth.service.helpers';

import type { AdminTokenScope } from './admin-token.types'; // ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('admin-auth.service.helpers — constants', () => {
  it('exposes the bcrypt work factor used by the service', () => {
    expect(BCRYPT_WORK_FACTOR).toBe(12);
  });

  it('names the MFA bypass env var', () => {
    expect(ADMIN_MFA_BYPASS_ENV).toBe('ADMIN_MFA_BYPASS_ENABLED');
  });

  it('enumerates the truthy MFA bypass values', () => {
    expect([...MFA_BYPASS_ENABLED_VALUES].sort()).toEqual(['1', 'on', 'true', 'yes'].sort());
  });
}); // ---------------------------------------------------------------------------
// normalizeAdminEmail
// ---------------------------------------------------------------------------

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
}); // ---------------------------------------------------------------------------
// isMfaBypassEnvEnabled
// ---------------------------------------------------------------------------

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
}); // ---------------------------------------------------------------------------
// isAccountLocked
// ---------------------------------------------------------------------------

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
}); // ---------------------------------------------------------------------------
// isSessionExpired
// ---------------------------------------------------------------------------

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
}); // ---------------------------------------------------------------------------
// extractBearerToken
// ---------------------------------------------------------------------------

describe('extractBearerToken', () => {
  it('extracts the token from a well-formed Bearer header', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('handles extra whitespace between scheme and token', () => {
    expect(extractBearerToken('Bearer   abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('is case-insensitive on the scheme', () => {
    expect(extractBearerToken('bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(extractBearerToken('BEARER abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('returns null when the header is undefined', () => {
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it('returns null when the header is empty', () => {
    expect(extractBearerToken('')).toBeNull();
  });

  it('returns null when the scheme is not Bearer', () => {
    expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeNull();
  });

  it('returns null for a malformed header with too many parts', () => {
    expect(extractBearerToken('Bearer abc def')).toBeNull();
  });

  it('returns null for a header with only the scheme', () => {
    expect(extractBearerToken('Bearer')).toBeNull();
  });

  it('returns null for a header with only whitespace', () => {
    expect(extractBearerToken('   ')).toBeNull();
  });
}); // ---------------------------------------------------------------------------
// assertTokenScope
// ---------------------------------------------------------------------------

describe('assertTokenScope', () => {
  const scopes: AdminTokenScope[] = ['password_change', 'mfa_setup', 'mfa_verify', 'full'];

  it('does not throw when the scope matches', () => {
    for (const scope of scopes) {
      expect(() => assertTokenScope({ scope }, scope)).not.toThrow();
    }
  });

  it('throws invalidToken when the scope mismatches', () => {
    expect(() => assertTokenScope({ scope: 'mfa_setup' as const }, 'password_change')).toThrow();
    expect(() => assertTokenScope({ scope: 'password_change' as const }, 'mfa_verify')).toThrow();
    expect(() => assertTokenScope({ scope: 'full' as const }, 'mfa_setup')).toThrow();
  });

  it('throws an error with the expected invalid_token code shape', () => {
    try {
      assertTokenScope({ scope: 'mfa_verify' as const }, 'password_change');
      fail('expected assertTokenScope to throw');
    } catch (err: unknown) {
      const response = (err as { getResponse?: () => unknown }).getResponse?.();
      expect((response as { code?: string } | undefined)?.code).toBe('admin.auth.invalid_token');
    }
  });
}); // ---------------------------------------------------------------------------
// readForwardedForIp
// ---------------------------------------------------------------------------

describe('readForwardedForIp', () => {
  it('extracts the first IP from a single-entry header', () => {
    expect(readForwardedForIp('10.0.0.1')).toBe('10.0.0.1');
  });

  it('extracts the first IP from a multi-proxy chain', () => {
    expect(readForwardedForIp('10.0.0.1, 10.0.1.2, 10.0.2.3')).toBe('10.0.0.1');
  });

  it('trims whitespace around the first entry', () => {
    expect(readForwardedForIp('  10.0.0.1 , 10.0.1.2')).toBe('10.0.0.1');
  });

  it('returns null when the header is undefined', () => {
    expect(readForwardedForIp(undefined)).toBeNull();
  });

  it('returns null when the header is an array', () => {
    expect(readForwardedForIp(['10.0.0.1'])).toBeNull();
  });

  it('returns null when the header is an empty string', () => {
    expect(readForwardedForIp('')).toBeNull();
  });

  it('returns null when the first entry is empty after trim', () => {
    expect(readForwardedForIp(' , 10.0.1.2')).toBeNull();
  });
}); // ---------------------------------------------------------------------------
// extractClientIp
// ---------------------------------------------------------------------------

describe('extractClientIp', () => {
  function req(
    overrides: {
      ip?: string;
      xForwardedFor?: string;
      remoteAddress?: string;
    } = {},
  ): HttpRequestLike {
    return {
      ip: overrides.ip,
      socket: overrides.remoteAddress ? { remoteAddress: overrides.remoteAddress } : undefined,
      headers: {
        'x-forwarded-for': overrides.xForwardedFor,
      },
    };
  }

  it('prefers x-forwarded-for when present', () => {
    expect(extractClientIp(req({ xForwardedFor: '1.2.3.4', ip: '9.9.9.9' }))).toBe('1.2.3.4');
  });

  it('falls back to req.ip when x-forwarded-for is absent', () => {
    expect(extractClientIp(req({ ip: '5.5.5.5' }))).toBe('5.5.5.5');
  });

  it('falls back to socket.remoteAddress when ip and x-forwarded-for are absent', () => {
    expect(extractClientIp(req({ remoteAddress: '6.6.6.6' }))).toBe('6.6.6.6');
  });

  it('returns 0.0.0.0 when nothing is available', () => {
    expect(extractClientIp(req())).toBe('0.0.0.0');
  });
}); // ---------------------------------------------------------------------------
// extractUserAgent
// ---------------------------------------------------------------------------

describe('extractUserAgent', () => {
  function req(ua?: string): HttpRequestLike {
    return {
      headers: { 'user-agent': ua },
    };
  }

  it('returns the header value when it is a string', () => {
    expect(extractUserAgent(req('Mozilla/5.0'))).toBe('Mozilla/5.0');
  });

  it('returns "unknown" when the header is absent', () => {
    expect(extractUserAgent(req())).toBe('unknown');
  });

  it('returns the value as-is when it is an empty string', () => {
    expect(extractUserAgent(req(''))).toBe('');
  });

  it('returns "unknown" when the header is an array (unlikely but safe)', () => {
    const r: HttpRequestLike = {
      headers: { 'user-agent': ['a', 'b'] },
    };
    expect(extractUserAgent(r)).toBe('unknown');
  });
});
