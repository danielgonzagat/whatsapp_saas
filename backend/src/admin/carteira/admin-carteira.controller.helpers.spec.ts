import { BadRequestException } from '@nestjs/common';
import { FraudBlacklistType } from '@prisma/client';

import {
  buildFraudBlacklistAddedDetails,
  buildFraudBlacklistEntityId,
  buildFraudBlacklistRemovedDetails,
  buildTreasuryPayoutFailedDetails,
  buildTreasuryPayoutRequestedDetails,
  buildTreasuryPayoutResponse,
  mapConnectAccount,
  mapFraudBlacklistRow,
  mapPayoutAuditItem,
  normalizeCurrency,
  parseFraudBlacklistType,
  parseSkip,
  parseTake,
  requireNonEmpty,
  resolveTreasuryPayoutRequestId,
  trimOptional,
  validatePayoutAmount,
  type ConnectAccountBalanceLike,
  type ConnectBalanceSnapshotLike,
  type FraudBlacklistRowLike,
  type PayoutAuditItemLike,
  type TreasuryPayoutLike,
} from './admin-carteira.controller.helpers';

describe('admin-carteira.controller.helpers', () => {
  describe('parseSkip', () => {
    it('returns undefined when the input is missing', () => {
      expect(parseSkip(undefined)).toBeUndefined();
      expect(parseSkip('')).toBeUndefined();
    });

    it('returns undefined when the input cannot be parsed as a number', () => {
      expect(parseSkip('abc')).toBeUndefined();
    });

    it('returns a non-negative truncated integer for valid input', () => {
      expect(parseSkip('25')).toBe(25);
      expect(parseSkip('25.9')).toBe(25);
    });

    it('clamps negative numbers to zero', () => {
      expect(parseSkip('-12')).toBe(0);
    });
  });

  describe('parseTake', () => {
    it('returns undefined for missing or unparseable input', () => {
      expect(parseTake(undefined)).toBeUndefined();
      expect(parseTake('')).toBeUndefined();
      expect(parseTake('NaN-ish')).toBeUndefined();
    });

    it('clamps the take to [1, 200]', () => {
      expect(parseTake('0')).toBe(1);
      expect(parseTake('1')).toBe(1);
      expect(parseTake('50')).toBe(50);
      expect(parseTake('200')).toBe(200);
      expect(parseTake('5000')).toBe(200);
    });

    it('truncates fractional values', () => {
      expect(parseTake('25.9')).toBe(25);
    });
  });

  describe('normalizeCurrency', () => {
    it('upper-cases and trims a valid currency code', () => {
      expect(normalizeCurrency('  brl  ')).toBe('BRL');
      expect(normalizeCurrency('usd')).toBe('USD');
    });

    it('falls back to BRL when the input is missing or empty', () => {
      expect(normalizeCurrency(undefined)).toBe('BRL');
      expect(normalizeCurrency('')).toBe('BRL');
      expect(normalizeCurrency('   ')).toBe('BRL');
    });
  });

  describe('parseFraudBlacklistType', () => {
    it('returns the parsed enum value when the input matches a member', () => {
      expect(parseFraudBlacklistType('email')).toBe(FraudBlacklistType.EMAIL);
      expect(parseFraudBlacklistType(' EMAIL ')).toBe(FraudBlacklistType.EMAIL);
    });

    it('throws BadRequestException for an unknown value', () => {
      expect(() => parseFraudBlacklistType('not-a-real-type')).toThrow(BadRequestException);
    });

    it('throws BadRequestException for a non-string input', () => {
      expect(() => parseFraudBlacklistType(undefined)).toThrow(BadRequestException);
      expect(() => parseFraudBlacklistType(42)).toThrow(BadRequestException);
    });
  });

  describe('trimOptional', () => {
    it('returns a trimmed string when the value is non-empty', () => {
      expect(trimOptional('  hello  ')).toBe('hello');
    });

    it('returns undefined for empty/whitespace/null input', () => {
      expect(trimOptional('')).toBeUndefined();
      expect(trimOptional('   ')).toBeUndefined();
      expect(trimOptional(undefined)).toBeUndefined();
      expect(trimOptional(null)).toBeUndefined();
    });
  });

  describe('validatePayoutAmount', () => {
    it('returns both the integer and BigInt form for a valid input', () => {
      expect(validatePayoutAmount(2500)).toEqual({
        amountCents: 2500,
        amountCentsBig: 2500n,
      });
    });

    it('truncates fractional values before validation', () => {
      expect(validatePayoutAmount(125.9)).toEqual({
        amountCents: 125,
        amountCentsBig: 125n,
      });
    });

    it.each([0, -1, NaN, Infinity, undefined, null])(
      'rejects %p with BadRequestException',
      (raw) => {
        expect(() => validatePayoutAmount(raw as never)).toThrow(BadRequestException);
      },
    );
  });

  describe('resolveTreasuryPayoutRequestId', () => {
    it('uses the trimmed caller-provided request id when available', () => {
      const generator = jest.fn();
      expect(resolveTreasuryPayoutRequestId('  custom_req_1  ', generator)).toBe('custom_req_1');
      expect(generator).not.toHaveBeenCalled();
    });

    it('falls back to the generator when the input is missing or empty', () => {
      const generator = jest.fn().mockReturnValue('aaaa-bbbb');
      expect(resolveTreasuryPayoutRequestId(undefined, generator)).toBe(
        'marketplace_treasury_po_aaaa-bbbb',
      );
      expect(resolveTreasuryPayoutRequestId('   ', generator)).toBe(
        'marketplace_treasury_po_aaaa-bbbb',
      );
      expect(generator).toHaveBeenCalledTimes(2);
    });
  });

  describe('requireNonEmpty', () => {
    it('returns the trimmed value when non-empty', () => {
      expect(requireNonEmpty('  abc  ', 'missing')).toBe('abc');
    });

    it('throws BadRequestException with the supplied message when empty', () => {
      expect(() => requireNonEmpty('', 'value is required')).toThrow(BadRequestException);
      expect(() => requireNonEmpty('   ', 'value is required')).toThrow('value is required');
      expect(() => requireNonEmpty(undefined, 'value is required')).toThrow('value is required');
    });
  });

  describe('mapFraudBlacklistRow', () => {
    function row(overrides: Partial<FraudBlacklistRowLike> = {}): FraudBlacklistRowLike {
      return {
        id: 'fb_1',
        type: FraudBlacklistType.EMAIL,
        value: 'fraud@example.com',
        reason: 'chargeback',
        addedBy: 'admin-1',
        expiresAt: null,
        createdAt: new Date('2026-04-19T20:15:00.000Z'),
        ...overrides,
      };
    }

    it('serialises createdAt and a null expiresAt verbatim', () => {
      expect(mapFraudBlacklistRow(row())).toEqual({
        id: 'fb_1',
        type: FraudBlacklistType.EMAIL,
        value: 'fraud@example.com',
        reason: 'chargeback',
        addedBy: 'admin-1',
        expiresAt: null,
        createdAt: '2026-04-19T20:15:00.000Z',
      });
    });

    it('serialises a Date expiresAt to ISO string', () => {
      const result = mapFraudBlacklistRow(row({ expiresAt: new Date('2027-01-01T00:00:00.000Z') }));
      expect(result.expiresAt).toBe('2027-01-01T00:00:00.000Z');
    });
  });

  describe('buildFraudBlacklistEntityId', () => {
    it('joins the type and value with a colon', () => {
      expect(buildFraudBlacklistEntityId(FraudBlacklistType.EMAIL, 'foo@example.com')).toBe(
        'EMAIL:foo@example.com',
      );
    });
  });

  describe('buildFraudBlacklistAddedDetails', () => {
    it('serialises the audit detail body from the row', () => {
      const row: FraudBlacklistRowLike = {
        id: 'fb_2',
        type: FraudBlacklistType.CPF,
        value: '12345678900',
        reason: 'test',
        addedBy: 'admin-1',
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-04-19T20:15:00.000Z'),
      };
      expect(buildFraudBlacklistAddedDetails(row)).toEqual({
        fraudBlacklistId: 'fb_2',
        type: FraudBlacklistType.CPF,
        value: '12345678900',
        reason: 'test',
        expiresAt: '2027-01-01T00:00:00.000Z',
      });
    });

    it('emits null when the row has no expiry', () => {
      const row: FraudBlacklistRowLike = {
        id: 'fb_3',
        type: FraudBlacklistType.IP,
        value: '203.0.113.1',
        reason: 'manual',
        addedBy: null,
        expiresAt: null,
        createdAt: new Date('2026-04-19T20:15:00.000Z'),
      };
      expect(buildFraudBlacklistAddedDetails(row).expiresAt).toBeNull();
    });
  });

  describe('buildFraudBlacklistRemovedDetails', () => {
    it('echoes the supplied fields verbatim', () => {
      expect(
        buildFraudBlacklistRemovedDetails({
          type: FraudBlacklistType.EMAIL,
          value: 'fraud@example.com',
          removedCount: 1,
        }),
      ).toEqual({
        type: FraudBlacklistType.EMAIL,
        value: 'fraud@example.com',
        removedCount: 1,
      });
    });
  });

  describe('mapPayoutAuditItem', () => {
    function item(overrides: Partial<PayoutAuditItemLike> = {}): PayoutAuditItemLike {
      return {
        id: 'aud_1',
        action: 'admin.carteira.payout_requested',
        createdAt: new Date('2026-04-19T22:10:00.000Z'),
        details: {
          requestId: 'req_1',
          payoutId: 'po_1',
          status: 'pending',
          amountCents: '5000',
          currency: 'BRL',
        },
        adminUser: { id: 'admin-1' },
        ...overrides,
      };
    }

    it('serialises every string detail field and includes adminUser', () => {
      expect(mapPayoutAuditItem(item())).toEqual({
        id: 'aud_1',
        action: 'admin.carteira.payout_requested',
        createdAt: '2026-04-19T22:10:00.000Z',
        requestId: 'req_1',
        payoutId: 'po_1',
        status: 'pending',
        amountCents: '5000',
        currency: 'BRL',
        error: null,
        adminUser: { id: 'admin-1' },
      });
    });

    it('falls back to null for non-string detail fields', () => {
      const result = mapPayoutAuditItem(
        item({
          details: { requestId: 'req_1', amountCents: 5000 /* number, not string */ },
        }),
      );
      expect(result.payoutId).toBeNull();
      expect(result.status).toBeNull();
      expect(result.amountCents).toBeNull();
      expect(result.currency).toBeNull();
      expect(result.error).toBeNull();
    });

    it('treats malformed details (array, null, primitive) as an empty object', () => {
      expect(mapPayoutAuditItem(item({ details: null })).requestId).toBeNull();
      expect(mapPayoutAuditItem(item({ details: [] })).requestId).toBeNull();
      expect(mapPayoutAuditItem(item({ details: 'oops' })).requestId).toBeNull();
    });

    it('returns adminUser null when the field is missing or non-object', () => {
      expect(mapPayoutAuditItem(item({ adminUser: undefined })).adminUser).toBeNull();
      expect(mapPayoutAuditItem(item({ adminUser: 'string' })).adminUser).toBeNull();
      expect(mapPayoutAuditItem(item({ adminUser: null })).adminUser).toBeNull();
    });
  });

  describe('mapConnectAccount', () => {
    it('stringifies every BigInt and inlines the onboarding blob', () => {
      const balance: ConnectAccountBalanceLike = {
        id: 'cab_seller',
        workspaceId: 'ws-1',
        stripeAccountId: 'acct_seller',
        accountType: 'SELLER',
      };
      const snapshot: ConnectBalanceSnapshotLike = {
        pendingCents: 100n,
        availableCents: 200n,
        lifetimeReceivedCents: 900n,
        lifetimePaidOutCents: 300n,
        lifetimeChargebacksCents: 0n,
      };
      const onboarding = { chargesEnabled: true };

      expect(mapConnectAccount(balance, snapshot, onboarding)).toEqual({
        accountBalanceId: 'cab_seller',
        workspaceId: 'ws-1',
        stripeAccountId: 'acct_seller',
        accountType: 'SELLER',
        pendingCents: '100',
        availableCents: '200',
        lifetimeReceivedCents: '900',
        lifetimePaidOutCents: '300',
        lifetimeChargebacksCents: '0',
        onboarding: { chargesEnabled: true },
      });
    });

    it('preserves a null onboarding blob', () => {
      const result = mapConnectAccount(
        {
          id: 'cab_seller',
          workspaceId: 'ws-1',
          stripeAccountId: 'acct_seller',
          accountType: 'SELLER',
        },
        {
          pendingCents: 0n,
          availableCents: 0n,
          lifetimeReceivedCents: 0n,
          lifetimePaidOutCents: 0n,
          lifetimeChargebacksCents: 0n,
        },
        null,
      );
      expect(result.onboarding).toBeNull();
    });
  });

  describe('buildTreasuryPayoutResponse', () => {
    it('shapes the success body with stringified amount', () => {
      const result: TreasuryPayoutLike = {
        payoutId: 'po_1',
        status: 'pending',
        amountCents: 5000n,
        currency: 'BRL',
      };
      expect(buildTreasuryPayoutResponse(result)).toEqual({
        success: true,
        payoutId: 'po_1',
        status: 'pending',
        amountCents: '5000',
        currency: 'BRL',
      });
    });
  });

  describe('buildTreasuryPayoutRequestedDetails', () => {
    it('echoes the request id and stringifies the BigInt amount', () => {
      const details = buildTreasuryPayoutRequestedDetails({
        requestId: 'req_1',
        result: {
          payoutId: 'po_1',
          status: 'pending',
          amountCents: 5000n,
          currency: 'BRL',
        },
      });
      expect(details).toEqual({
        requestId: 'req_1',
        payoutId: 'po_1',
        status: 'pending',
        amountCents: '5000',
      });
    });
  });

  describe('buildTreasuryPayoutFailedDetails', () => {
    it('captures an Error message verbatim', () => {
      const details = buildTreasuryPayoutFailedDetails({
        requestId: 'req_1',
        amountCents: 5000,
        currency: 'BRL',
        error: new Error('gateway down'),
      });
      expect(details).toEqual({
        requestId: 'req_1',
        amountCents: '5000',
        currency: 'BRL',
        error: 'gateway down',
      });
    });

    it('captures a non-Error value as a string', () => {
      const details = buildTreasuryPayoutFailedDetails({
        requestId: 'req_1',
        amountCents: 5000,
        currency: 'BRL',
        error: { code: 'timeout' },
      });
      expect(details.error).toBe('[object Object]');
    });
  });
});
