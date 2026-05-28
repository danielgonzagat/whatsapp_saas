import {
  BLOCKED_NESTED_KEYS,
  buildDeletionStatusUrl,
  buildRedactedAgentFields,
  classifyRiscEvent,
  extractSubjectIdentifier,
  generateConfirmationCode,
  normalizeUnsubscribeEmail,
  readNestedString,
  resolveSiteUrl,
} from './compliance.helpers';

describe('compliance.helpers', () => {
  describe('BLOCKED_NESTED_KEYS', () => {
    it('blocks the three prototype-pollution keys and nothing else', () => {
      expect(BLOCKED_NESTED_KEYS.has('__proto__')).toBe(true);
      expect(BLOCKED_NESTED_KEYS.has('constructor')).toBe(true);
      expect(BLOCKED_NESTED_KEYS.has('prototype')).toBe(true);
      expect(BLOCKED_NESTED_KEYS.size).toBe(3);
      expect(BLOCKED_NESTED_KEYS.has('sub')).toBe(false);
    });
  });

  describe('readNestedString', () => {
    it('returns trimmed string when the path resolves to a string', () => {
      expect(readNestedString({ subject: { sub: '  abc  ' } }, ['subject', 'sub'])).toBe('abc');
    });

    it('returns "" when an intermediate key is missing', () => {
      expect(readNestedString({}, ['subject', 'sub'])).toBe('');
    });

    it('returns "" when an intermediate value is not an object', () => {
      expect(readNestedString({ subject: 'flat' } as unknown as Record<string, unknown>, ['subject', 'sub'])).toBe(
        '',
      );
    });

    it('returns "" when the path leads to a non-string leaf', () => {
      expect(readNestedString({ sub: 123 } as unknown as Record<string, unknown>, ['sub'])).toBe('');
    });

    it('refuses to traverse prototype-pollution keys', () => {
      const evil = { __proto__: { sub: 'gotcha' } } as unknown as Record<string, unknown>;
      expect(readNestedString(evil, ['__proto__', 'sub'])).toBe('');
    });

    it('refuses to traverse "constructor" and "prototype"', () => {
      expect(readNestedString({} as Record<string, unknown>, ['constructor', 'name'])).toBe('');
      expect(readNestedString({} as Record<string, unknown>, ['prototype', 'name'])).toBe('');
    });

    it('returns "" when an intermediate value is an array', () => {
      expect(readNestedString({ subject: ['a', 'b'] } as unknown as Record<string, unknown>, ['subject', 'sub'])).toBe(
        '',
      );
    });

    it('returns "" for inherited (non-own) properties', () => {
      const proto = { sub: 'inherited' };
      const child = Object.create(proto) as Record<string, unknown>;
      expect(readNestedString(child, ['sub'])).toBe('');
    });
  });

  describe('extractSubjectIdentifier', () => {
    it('prefers eventPayload.subject.sub', () => {
      const out = extractSubjectIdentifier({ sub: 'fallback' }, {
        subject: { sub: 'eventSub' },
      });
      expect(out).toBe('eventSub');
    });

    it('falls back to eventPayload.subject.subject', () => {
      const out = extractSubjectIdentifier({ sub: 'fallback' }, {
        subject: { subject: 'nestedSubject' },
      });
      expect(out).toBe('nestedSubject');
    });

    it('falls back to eventPayload.sub', () => {
      const out = extractSubjectIdentifier({ sub: 'fallback' }, { sub: 'flatSub' });
      expect(out).toBe('flatSub');
    });

    it('falls back to top-level payload.sub last', () => {
      const out = extractSubjectIdentifier({ sub: ' topSub ' }, {});
      expect(out).toBe('topSub');
    });

    it('returns "" when no candidate is present', () => {
      const out = extractSubjectIdentifier({}, {});
      expect(out).toBe('');
    });

    it('returns "" when payload.sub is non-string and event has nothing', () => {
      const out = extractSubjectIdentifier({ sub: undefined }, {});
      expect(out).toBe('');
    });
  });

  describe('generateConfirmationCode', () => {
    it('returns a 16-character lowercase-hex string', () => {
      const code = generateConfirmationCode();
      expect(code).toMatch(/^[0-9a-f]{16}$/);
    });

    it('returns a different code on each call (practically)', () => {
      const a = generateConfirmationCode();
      const b = generateConfirmationCode();
      expect(a).not.toBe(b);
    });
  });

  describe('normalizeUnsubscribeEmail', () => {
    it('lowercases and trims', () => {
      expect(normalizeUnsubscribeEmail('  Foo@BAR.com  ')).toBe('foo@bar.com');
    });

    it('handles already-clean input', () => {
      expect(normalizeUnsubscribeEmail('foo@bar.com')).toBe('foo@bar.com');
    });

    it('coerces nullish input to empty string instead of throwing', () => {
      expect(normalizeUnsubscribeEmail(undefined as unknown as string)).toBe('');
      expect(normalizeUnsubscribeEmail(null as unknown as string)).toBe('');
    });
  });

  describe('resolveSiteUrl', () => {
    it('uses NEXT_PUBLIC_SITE_URL when present', () => {
      expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://a.example' })).toBe('https://a.example');
    });

    it('falls back to FRONTEND_URL when NEXT_PUBLIC_SITE_URL is empty', () => {
      expect(
        resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: '', FRONTEND_URL: 'https://b.example' }),
      ).toBe('https://b.example');
    });

    it('defaults to https://kloel.com when nothing is set', () => {
      expect(resolveSiteUrl({})).toBe('https://kloel.com');
    });

    it('strips a single trailing slash', () => {
      expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://a.example/' })).toBe('https://a.example');
    });
  });

  describe('buildDeletionStatusUrl', () => {
    it('joins the resolved site URL with the deletion-status path and code', () => {
      const url = buildDeletionStatusUrl('abc123', { NEXT_PUBLIC_SITE_URL: 'https://kloel.com/' });
      expect(url).toBe('https://kloel.com/data-deletion/status/abc123');
    });

    it('uses the default site URL when env is empty', () => {
      const url = buildDeletionStatusUrl('xyz', {});
      expect(url).toBe('https://kloel.com/data-deletion/status/xyz');
    });
  });

  describe('classifyRiscEvent', () => {
    it('matches sessions-revoked suffix', () => {
      expect(classifyRiscEvent('https://schemas.openid.net/secevent/risc/event-type/sessions-revoked')).toBe(
        'sessions-revoked',
      );
    });

    it('matches tokens-revoked suffix', () => {
      expect(classifyRiscEvent('http://x/tokens-revoked')).toBe('tokens-revoked');
    });

    it('matches account-disabled suffix', () => {
      expect(classifyRiscEvent('foo/account-disabled')).toBe('account-disabled');
    });

    it('matches account-purged suffix', () => {
      expect(classifyRiscEvent('foo/account-purged')).toBe('account-purged');
    });

    it('returns "unknown" for unrelated event types', () => {
      expect(classifyRiscEvent('foo/credential-change-required')).toBe('unknown');
      expect(classifyRiscEvent('')).toBe('unknown');
    });

    it('requires the trailing slash boundary (no false-positive on substring)', () => {
      // Without the leading slash this should NOT match sessions-revoked.
      expect(classifyRiscEvent('mysessions-revoked')).toBe('unknown');
    });
  });

  describe('buildRedactedAgentFields', () => {
    it('produces the canonical redacted shape with the provided timestamp', () => {
      const now = new Date('2026-01-01T00:00:00.000Z');
      const out = buildRedactedAgentFields('agent_42', now);
      expect(out).toEqual({
        name: 'Deleted User',
        email: 'deleted-agent_42@removed.local',
        phone: null,
        avatarUrl: null,
        provider: null,
        providerId: null,
        emailVerified: false,
        disabledAt: now,
        deletedAt: now,
      });
    });

    it('defaults the timestamp to now and uses the same instant for both fields', () => {
      const out = buildRedactedAgentFields('a1');
      expect(out.disabledAt).toBe(out.deletedAt);
      expect(out.disabledAt).toBeInstanceOf(Date);
    });
  });
});
