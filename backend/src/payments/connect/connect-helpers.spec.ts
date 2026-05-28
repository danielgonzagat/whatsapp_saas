import { ConnectAccountType, ConnectLedgerEntryType } from '@prisma/client';

import {
  buildBalanceById,
  buildOnboardingProfileInput,
  CONNECT_LEDGER_ENTRY_TYPES,
  hasOnboardingProfileUpdate,
  mapConnectLedgerEntry,
  mapPayoutAuditItem,
  parseConnectLedgerEntryType,
  parseForwardedIp,
  parsePaginationSkip,
  parsePaginationTake,
  parsePositiveIntegerCents,
  parseSkip,
  parseTake,
  resolveTosAcceptance,
} from './connect-helpers';

describe('connect-helpers', () => {
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

    it('returns true when any string field is non-empty', () => {
      expect(hasOnboardingProfileUpdate({ email: 'a@b.com' })).toBe(true);
      expect(hasOnboardingProfileUpdate({ country: 'BR' })).toBe(true);
      expect(hasOnboardingProfileUpdate({ businessType: 'individual' })).toBe(true);
    });

    it('returns true when any nested object has keys', () => {
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

  describe('buildBalanceById', () => {
    it('indexes balances by id and projects accountType/stripeAccountId', () => {
      const result = buildBalanceById([
        {
          id: 'bal_1',
          accountType: ConnectAccountType.SELLER,
          stripeAccountId: 'acct_a',
        },
        {
          id: 'bal_2',
          accountType: ConnectAccountType.AFFILIATE,
          stripeAccountId: 'acct_b',
        },
      ]);
      expect(result.size).toBe(2);
      expect(result.get('bal_1')).toEqual({
        accountType: ConnectAccountType.SELLER,
        stripeAccountId: 'acct_a',
      });
      expect(result.get('bal_2')).toEqual({
        accountType: ConnectAccountType.AFFILIATE,
        stripeAccountId: 'acct_b',
      });
    });
  });

  describe('mapPayoutAuditItem', () => {
    it('projects audit log with balance context and well-typed details', () => {
      const balanceById = new Map([
        [
          'bal_1',
          {
            accountType: ConnectAccountType.SELLER,
            stripeAccountId: 'acct_a',
          },
        ],
      ]);
      const createdAt = new Date('2026-05-28T10:00:00Z');
      const result = mapPayoutAuditItem(
        {
          id: 'log_1',
          action: 'connect.payout.created',
          createdAt,
          entityId: 'bal_1',
          details: {
            requestId: 'req_1',
            payoutId: 'po_1',
            status: 'paid',
            amountCents: '12345',
            error: 'none',
          },
        },
        balanceById,
      );

      expect(result).toEqual({
        id: 'log_1',
        action: 'connect.payout.created',
        createdAt: createdAt.toISOString(),
        accountBalanceId: 'bal_1',
        accountType: ConnectAccountType.SELLER,
        stripeAccountId: 'acct_a',
        requestId: 'req_1',
        payoutId: 'po_1',
        status: 'paid',
        amountCents: '12345',
        error: 'none',
      });
    });

    it('returns null for unknown balance and ignores non-string detail fields', () => {
      const result = mapPayoutAuditItem(
        {
          id: 'log_2',
          action: 'connect.payout.failed',
          createdAt: new Date('2026-05-28T11:00:00Z'),
          entityId: 'bal_missing',
          details: { requestId: 99 as unknown, payoutId: null },
        },
        new Map(),
      );
      expect(result.accountType).toBeNull();
      expect(result.stripeAccountId).toBeNull();
      expect(result.requestId).toBeNull();
      expect(result.payoutId).toBeNull();
    });

    it('handles null entityId and non-object details', () => {
      const result = mapPayoutAuditItem(
        {
          id: 'log_3',
          action: 'connect.payout.skipped',
          createdAt: new Date('2026-05-28T12:00:00Z'),
          entityId: null,
          details: 'just-a-string',
        },
        new Map(),
      );
      expect(result.accountBalanceId).toBeNull();
      expect(result.accountType).toBeNull();
      expect(result.requestId).toBeNull();
      expect(result.amountCents).toBeNull();
    });

    it('treats array details as empty object', () => {
      const result = mapPayoutAuditItem(
        {
          id: 'log_4',
          action: 'connect.payout.audit',
          createdAt: new Date('2026-05-28T13:00:00Z'),
          entityId: 'bal_1',
          details: ['a', 'b'],
        },
        new Map(),
      );
      expect(result.requestId).toBeNull();
      expect(result.amountCents).toBeNull();
    });
  });

  describe('mapConnectLedgerEntry', () => {
    const balanceById = new Map([
      [
        'bal_1',
        {
          accountType: ConnectAccountType.SELLER,
          stripeAccountId: 'acct_a',
        },
      ],
    ]);
    const scheduledFor = new Date('2026-06-01T00:00:00Z');
    const createdAt = new Date('2026-05-28T14:00:00Z');

    it('projects a ledger entry into its public view-model', () => {
      const entry = {
        id: 'le_1',
        accountBalanceId: 'bal_1',
        type: ConnectLedgerEntryType.CREDIT_PENDING,
        amountCents: 1000n,
        balanceAfterPendingCents: 5000n,
        balanceAfterAvailableCents: 0n,
        referenceType: 'payment',
        referenceId: 'pi_1',
        scheduledFor,
        matured: false,
        createdAt,
      };
      expect(mapConnectLedgerEntry(entry, balanceById)).toEqual({
        id: 'le_1',
        accountBalanceId: 'bal_1',
        accountType: ConnectAccountType.SELLER,
        stripeAccountId: 'acct_a',
        type: ConnectLedgerEntryType.CREDIT_PENDING,
        amountCents: '1000',
        balanceAfterPendingCents: '5000',
        balanceAfterAvailableCents: '0',
        referenceType: 'payment',
        referenceId: 'pi_1',
        scheduledFor: scheduledFor.toISOString(),
        matured: false,
        createdAt: createdAt.toISOString(),
      });
    });

    it('returns null balance context when account is unknown', () => {
      const result = mapConnectLedgerEntry(
        {
          id: 'le_2',
          accountBalanceId: 'bal_missing',
          type: ConnectLedgerEntryType.MATURE,
          amountCents: 0n,
          balanceAfterPendingCents: 0n,
          balanceAfterAvailableCents: 0n,
          referenceType: null,
          referenceId: null,
          scheduledFor: null,
          matured: true,
          createdAt,
        },
        balanceById,
      );
      expect(result.accountType).toBeNull();
      expect(result.stripeAccountId).toBeNull();
      expect(result.scheduledFor).toBeNull();
      expect(result.referenceId).toBeNull();
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
