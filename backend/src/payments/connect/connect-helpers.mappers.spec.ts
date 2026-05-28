import { ConnectAccountType, ConnectLedgerEntryType } from '@prisma/client';

import {
  buildBalanceById,
  mapConnectLedgerEntry,
  mapPayoutAuditItem,
} from './connect-helpers';

describe('connect-helpers (balance + audit + ledger mappers)', () => {
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
});
