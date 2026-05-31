import {
  buildOnboardingProfileInput,
  CONNECT_LEDGER_ENTRY_TYPES,
  hasOnboardingProfileUpdate,
  parseConnectLedgerEntryType,
  parseForwardedIp,
  parsePaginationSkip,
  parsePaginationTake,
  parsePositiveIntegerCents,
  parseSkip,
  parseTake,
  resolveTosAcceptance,
} from './connect-helpers';

describe('connect-helpers (parsers + onboarding builders)', () => {
  describe('parseSkip', () => {
    it('returns undefined for blank or invalid input', () => {
      expect(parseSkip(undefined)).toBeUndefined();
      expect(parseSkip('')).toBeUndefined();
      expect(parseSkip('not-a-number')).toBeUndefined();
    });

    it('clamps negatives to zero and truncates fractions', () => {
      expect(parseSkip('-5')).toBe(0);
      expect(parseSkip('3.9')).toBe(3);
      expect(parseSkip('25')).toBe(25);
    });
  });

  describe('parseTake', () => {
    it('returns undefined for blank or invalid input', () => {
      expect(parseTake(undefined)).toBeUndefined();
      expect(parseTake('')).toBeUndefined();
      expect(parseTake('nope')).toBeUndefined();
    });

    it('clamps into [1, 200]', () => {
      expect(parseTake('0')).toBe(1);
      expect(parseTake('5000')).toBe(200);
      expect(parseTake('42')).toBe(42);
    });
  });

  describe('parsePaginationSkip', () => {
    it('defaults to 0 and clamps negatives', () => {
      expect(parsePaginationSkip(undefined)).toBe(0);
      expect(parsePaginationSkip(null)).toBe(0);
      expect(parsePaginationSkip('-7')).toBe(0);
      expect(parsePaginationSkip('25')).toBe(25);
    });
  });

  describe('parsePaginationTake', () => {
    it('defaults to 50 and clamps to [1, 200]', () => {
      expect(parsePaginationTake(undefined)).toBe(50);
      // Falsy inputs (0, NaN) fall back to the default 50 via `|| 50`.
      expect(parsePaginationTake('0')).toBe(50);
      expect(parsePaginationTake('not-a-number')).toBe(50);
      expect(parsePaginationTake('500')).toBe(200);
      expect(parsePaginationTake('42')).toBe(42);
    });
  });

  describe('parseConnectLedgerEntryType', () => {
    it('returns undefined for unknown or empty values', () => {
      expect(parseConnectLedgerEntryType(undefined)).toBeUndefined();
      expect(parseConnectLedgerEntryType('')).toBeUndefined();
      expect(parseConnectLedgerEntryType('NOT_A_TYPE')).toBeUndefined();
    });

    it('returns the value when it is a known ConnectLedgerEntryType', () => {
      CONNECT_LEDGER_ENTRY_TYPES.forEach((known) => {
        expect(parseConnectLedgerEntryType(known)).toBe(known);
      });
    });
  });

  describe('parseForwardedIp', () => {
    it('returns undefined for missing or blank input', () => {
      expect(parseForwardedIp(undefined)).toBeUndefined();
      expect(parseForwardedIp('')).toBeUndefined();
      expect(parseForwardedIp('   ')).toBeUndefined();
    });

    it('returns the first ip from a comma-separated list', () => {
      expect(parseForwardedIp('1.2.3.4')).toBe('1.2.3.4');
      expect(parseForwardedIp('1.2.3.4, 5.6.7.8')).toBe('1.2.3.4');
      expect(parseForwardedIp('  1.2.3.4 , 5.6.7.8')).toBe('1.2.3.4');
    });

    it('returns undefined when first segment is blank', () => {
      expect(parseForwardedIp(', 5.6.7.8')).toBeUndefined();
    });
  });

  describe('hasOnboardingProfileUpdate', () => {
    it('returns false for an empty body', () => {
      expect(hasOnboardingProfileUpdate({})).toBe(false);
    });

    it('returns false when string fields are only whitespace', () => {
      expect(
        hasOnboardingProfileUpdate({
          email: '   ',
          country: '',
          businessType: '   ',
        }),
      ).toBe(false);
    });

    it('returns false when object fields are empty', () => {
      expect(
        hasOnboardingProfileUpdate({
          businessProfile: {},
          individual: {},
          company: {},
          externalAccount: {},
          tosAcceptance: {},
          metadata: {},
        }),
      ).toBe(false);
    });

    it('returns true when each string field is non-empty', () => {
      expect(hasOnboardingProfileUpdate({ email: 'a@b.com' })).toBe(true);
      expect(hasOnboardingProfileUpdate({ country: 'BR' })).toBe(true);
      expect(hasOnboardingProfileUpdate({ businessType: 'individual' })).toBe(true);
    });

    it('returns true when each nested object has keys', () => {
      expect(hasOnboardingProfileUpdate({ businessProfile: { name: 'kloel' } })).toBe(true);
      expect(hasOnboardingProfileUpdate({ individual: { firstName: 'Daniel' } })).toBe(true);
      expect(hasOnboardingProfileUpdate({ metadata: { plan: 'pro' } })).toBe(true);
    });
  });

  describe('resolveTosAcceptance', () => {
    it('returns undefined when no acceptance payload is given', () => {
      expect(resolveTosAcceptance(undefined, '1.2.3.4', 'curl')).toBeUndefined();
    });

    it('prefers explicit ip/user-agent over request-derived values', () => {
      expect(
        resolveTosAcceptance(
          { ipAddress: '10.0.0.1', userAgent: 'explicit-ua' },
          '1.2.3.4',
          'curl',
        ),
      ).toEqual({ ipAddress: '10.0.0.1', userAgent: 'explicit-ua' });
    });

    it('falls back to request-derived ip and user-agent when absent', () => {
      expect(resolveTosAcceptance({}, '1.2.3.4', 'curl')).toEqual({
        ipAddress: '1.2.3.4',
        userAgent: 'curl',
      });
    });

    it('omits ip/user-agent when both raw and request values are missing', () => {
      expect(resolveTosAcceptance({ acceptedAt: '2026-05-28' }, undefined, undefined)).toEqual({
        acceptedAt: '2026-05-28',
      });
    });
  });

  describe('buildOnboardingProfileInput', () => {
    it('returns only the stripeAccountId when body is empty', () => {
      expect(buildOnboardingProfileInput('acct_123', {}, undefined)).toEqual({
        stripeAccountId: 'acct_123',
      });
    });

    it('copies defined fields from the body and preserves nested objects', () => {
      const businessProfile = { name: 'kloel' };
      const metadata = { plan: 'pro' };
      expect(
        buildOnboardingProfileInput(
          'acct_456',
          {
            email: 'a@b.com',
            country: 'BR',
            businessType: 'individual',
            businessProfile,
            metadata,
          },
          undefined,
        ),
      ).toEqual({
        stripeAccountId: 'acct_456',
        email: 'a@b.com',
        country: 'BR',
        businessType: 'individual',
        businessProfile,
        metadata,
      });
    });

    it('attaches tosAcceptance when provided', () => {
      expect(
        buildOnboardingProfileInput(
          'acct_789',
          {},
          { ipAddress: '1.2.3.4', userAgent: 'curl', acceptedAt: '2026-05-28' },
        ),
      ).toEqual({
        stripeAccountId: 'acct_789',
        tosAcceptance: { ipAddress: '1.2.3.4', userAgent: 'curl', acceptedAt: '2026-05-28' },
      });
    });
  });

  describe('parsePositiveIntegerCents', () => {
    it('returns null for invalid / non-positive values', () => {
      expect(parsePositiveIntegerCents(undefined)).toBeNull();
      expect(parsePositiveIntegerCents(null)).toBeNull();
      expect(parsePositiveIntegerCents(0)).toBeNull();
      expect(parsePositiveIntegerCents(-5)).toBeNull();
      expect(parsePositiveIntegerCents(Number.NaN)).toBeNull();
    });

    it('truncates fractional positives', () => {
      expect(parsePositiveIntegerCents(99.9)).toBe(99);
    });

    it('returns the parsed integer for valid positives', () => {
      expect(parsePositiveIntegerCents(1)).toBe(1);
      expect(parsePositiveIntegerCents(150_000)).toBe(150_000);
    });
  });
});
