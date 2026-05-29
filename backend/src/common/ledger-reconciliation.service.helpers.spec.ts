import type { DriftReport } from './ledger-reconciliation.types';
import {
  AUDIT_SUMMARY_SAMPLE_SIZE,
  buildCheckoutDriftSummary,
  buildWalletDriftSummary,
  buildWalletLedgerSumMap,
  computeBucketDerivedBalance,
  countDriftsByKind,
  deriveWalletBucketDrifts,
  describeErrorForLog,
  formatCheckoutDriftLogEntry,
  formatWalletDriftLogEntry,
  isOrderTerminalStatus,
  isPaymentTerminalStatus,
  readStoredBucketBalance,
  sampleDriftsForAudit,
  toLogJson,
  WALLET_BUCKETS,
  type WalletStoredBalances,
} from './ledger-reconciliation.service.helpers';

function makeCheckoutDrift(overrides: Partial<DriftReport> = {}): DriftReport {
  return {
    orderId: 'order-x',
    workspaceId: 'ws-x',
    kind: 'order_without_payment',
    details: { orderStatus: 'PAID' },
    ...overrides,
  };
}

function makeWallet(overrides: Partial<WalletStoredBalances> = {}): WalletStoredBalances {
  return {
    id: 'wallet-x',
    workspaceId: 'ws-x',
    availableBalanceInCents: 0n,
    pendingBalanceInCents: 0n,
    blockedBalanceInCents: 0n,
    ...overrides,
  };
}

describe('ledger-reconciliation helpers — pure formatters & validators', () => {
  describe('toLogJson', () => {
    it('serialises a payload deterministically', () => {
      expect(toLogJson({ a: 1, b: 'two' })).toBe('{"a":1,"b":"two"}');
    });
  });

  describe('isOrderTerminalStatus', () => {
    it.each(['PAID', 'SHIPPED', 'DELIVERED', 'paid', 'shipped'])(
      'accepts terminal status %s',
      (status) => {
        expect(isOrderTerminalStatus(status)).toBe(true);
      },
    );

    it.each(['PENDING', 'CREATED', '', null, undefined])(
      'rejects non-terminal status %s',
      (status) => {
        expect(isOrderTerminalStatus(status)).toBe(false);
      },
    );
  });

  describe('isPaymentTerminalStatus', () => {
    it.each(['CONFIRMED', 'RECEIVED', 'APPROVED', 'PAID', 'confirmed'])(
      'accepts terminal payment status %s',
      (status) => {
        expect(isPaymentTerminalStatus(status)).toBe(true);
      },
    );

    it.each(['PENDING', 'FAILED', '', null, undefined])(
      'rejects non-terminal payment status %s',
      (status) => {
        expect(isPaymentTerminalStatus(status)).toBe(false);
      },
    );
  });

  describe('countDriftsByKind', () => {
    it('returns an empty object for an empty list', () => {
      expect(countDriftsByKind([])).toEqual({});
    });

    it('counts each kind independently', () => {
      const drifts = [
        makeCheckoutDrift({ kind: 'order_without_payment' }),
        makeCheckoutDrift({ kind: 'order_without_payment' }),
        makeCheckoutDrift({ kind: 'webhook_event_missing' }),
        makeCheckoutDrift({ kind: 'wallet_balance_ledger_mismatch' }),
      ];
      expect(countDriftsByKind(drifts)).toEqual({
        order_without_payment: 2,
        webhook_event_missing: 1,
        wallet_balance_ledger_mismatch: 1,
      });
    });
  });

  describe('buildCheckoutDriftSummary', () => {
    it('builds the summary used for ledger_drift_detected', () => {
      const drifts = [
        makeCheckoutDrift({ kind: 'order_without_payment' }),
        makeCheckoutDrift({ kind: 'payment_status_mismatch' }),
      ];
      expect(buildCheckoutDriftSummary(42, drifts)).toEqual({
        scannedOrders: 42,
        driftCount: 2,
        kinds: {
          order_without_payment: 1,
          payment_status_mismatch: 1,
        },
      });
    });
  });

  describe('buildWalletDriftSummary', () => {
    it('builds the summary used for wallet_ledger_drift_detected', () => {
      const drifts = [makeCheckoutDrift({ kind: 'wallet_balance_ledger_mismatch' })];
      expect(buildWalletDriftSummary(7, drifts)).toEqual({
        scannedWallets: 7,
        driftCount: 1,
      });
    });
  });

  describe('formatCheckoutDriftLogEntry', () => {
    it('projects a drift into the per-line log shape', () => {
      const drift = makeCheckoutDrift({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        kind: 'order_without_payment',
        details: { orderStatus: 'PAID' },
      });
      expect(formatCheckoutDriftLogEntry(drift)).toEqual({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        kind: 'order_without_payment',
        details: { orderStatus: 'PAID' },
      });
    });
  });

  describe('formatWalletDriftLogEntry', () => {
    it('rewrites the drift orderId field as walletId in the log shape', () => {
      const drift = makeCheckoutDrift({
        orderId: 'wallet-99',
        workspaceId: 'ws-9',
        kind: 'wallet_balance_ledger_mismatch',
        details: { bucket: 'available' },
      });
      expect(formatWalletDriftLogEntry(drift)).toEqual({
        workspaceId: 'ws-9',
        walletId: 'wallet-99',
        kind: 'wallet_balance_ledger_mismatch',
        details: { bucket: 'available' },
      });
    });
  });

  describe('buildWalletLedgerSumMap', () => {
    it('returns an empty map for no aggregates', () => {
      expect(buildWalletLedgerSumMap([])).toEqual(new Map());
    });

    it('coerces string, number and bigint _sum payloads to BigInt', () => {
      const map = buildWalletLedgerSumMap([
        { bucket: 'available', direction: 'credit', _sum: { amountInCents: '4000' } },
        { bucket: 'available', direction: 'debit', _sum: { amountInCents: 1000 } },
        { bucket: 'pending', direction: 'credit', _sum: { amountInCents: 500n } },
      ]);
      expect(map.get('available:credit')).toBe(4000n);
      expect(map.get('available:debit')).toBe(1000n);
      expect(map.get('pending:credit')).toBe(500n);
    });

    it('treats null _sum payload as 0n', () => {
      const map = buildWalletLedgerSumMap([
        { bucket: 'blocked', direction: 'credit', _sum: { amountInCents: null } },
      ]);
      expect(map.get('blocked:credit')).toBe(0n);
    });
  });

  describe('computeBucketDerivedBalance', () => {
    it('subtracts debit from credit and returns BigInts', () => {
      const map = new Map<string, bigint>([
        ['available:credit', 9300n],
        ['available:debit', 2300n],
      ]);
      expect(computeBucketDerivedBalance('available', map)).toEqual({
        credit: 9300n,
        debit: 2300n,
        derived: 7000n,
      });
    });

    it('treats missing entries as 0n on both sides', () => {
      expect(computeBucketDerivedBalance('blocked', new Map())).toEqual({
        credit: 0n,
        debit: 0n,
        derived: 0n,
      });
    });
  });

  describe('readStoredBucketBalance', () => {
    it('reads the matching bucket column as BigInt', () => {
      const wallet = makeWallet({ availableBalanceInCents: 1234n });
      expect(readStoredBucketBalance(wallet, 'available')).toBe(1234n);
    });

    it('coerces missing/zero balances to 0n safely', () => {
      const wallet = makeWallet({ pendingBalanceInCents: 0n });
      expect(readStoredBucketBalance(wallet, 'pending')).toBe(0n);
    });
  });

  describe('deriveWalletBucketDrifts', () => {
    it('returns no drift when every bucket matches', () => {
      const wallet = makeWallet({
        availableBalanceInCents: 7000n,
        pendingBalanceInCents: 2300n,
        blockedBalanceInCents: 0n,
      });
      const drifts = deriveWalletBucketDrifts(wallet, [
        { bucket: 'available', direction: 'credit', _sum: { amountInCents: 9300n } },
        { bucket: 'available', direction: 'debit', _sum: { amountInCents: 2300n } },
        { bucket: 'pending', direction: 'credit', _sum: { amountInCents: 2300n } },
      ]);
      expect(drifts).toEqual([]);
    });

    it('emits a wallet_balance_ledger_mismatch drift per mismatched bucket', () => {
      const wallet = makeWallet({
        id: 'wallet-multi',
        workspaceId: 'ws-multi',
        availableBalanceInCents: 1000n,
        pendingBalanceInCents: 2000n,
        blockedBalanceInCents: 0n,
      });
      const drifts = deriveWalletBucketDrifts(wallet, [
        { bucket: 'pending', direction: 'credit', _sum: { amountInCents: 500n } },
      ]);
      const buckets = drifts.map((d) => d.details.bucket).sort();
      expect(buckets).toEqual(['available', 'pending']);
      for (const drift of drifts) {
        expect(drift.kind).toBe('wallet_balance_ledger_mismatch');
        expect(drift.orderId).toBe('wallet-multi');
        expect(drift.workspaceId).toBe('ws-multi');
      }
    });

    it('serialises stored and derived BigInt values as decimal strings', () => {
      const wallet = makeWallet({
        id: 'wallet-drift',
        workspaceId: 'ws-2',
        availableBalanceInCents: 5000n,
      });
      const drifts = deriveWalletBucketDrifts(wallet, [
        { bucket: 'available', direction: 'credit', _sum: { amountInCents: 4000n } },
      ]);
      expect(drifts).toHaveLength(1);
      expect(drifts[0].details).toMatchObject({
        walletId: 'wallet-drift',
        bucket: 'available',
        storedInCents: '5000',
        ledgerSumInCents: '4000',
        creditInCents: '4000',
        debitInCents: '0',
      });
    });
  });

  describe('describeErrorForLog', () => {
    it('returns the message for Error instances', () => {
      expect(describeErrorForLog(new Error('boom'))).toBe('boom');
    });

    it('coerces non-Error values via String()', () => {
      expect(describeErrorForLog('plain-string')).toBe('plain-string');
      expect(describeErrorForLog(42)).toBe('42');
      expect(describeErrorForLog(null)).toBe('null');
      expect(describeErrorForLog(undefined)).toBe('undefined');
    });
  });

  describe('sampleDriftsForAudit', () => {
    it('returns at most AUDIT_SUMMARY_SAMPLE_SIZE entries', () => {
      const drifts = Array.from({ length: AUDIT_SUMMARY_SAMPLE_SIZE + 5 }, (_, i) =>
        makeCheckoutDrift({ orderId: `order-${i}` }),
      );
      const sample = sampleDriftsForAudit(drifts);
      expect(sample).toHaveLength(AUDIT_SUMMARY_SAMPLE_SIZE);
      expect(sample[0].orderId).toBe('order-0');
      expect(sample[AUDIT_SUMMARY_SAMPLE_SIZE - 1].orderId).toBe(
        `order-${AUDIT_SUMMARY_SAMPLE_SIZE - 1}`,
      );
    });

    it('returns the whole array when shorter than the sample size', () => {
      const drifts = [makeCheckoutDrift(), makeCheckoutDrift()];
      expect(sampleDriftsForAudit(drifts)).toEqual(drifts);
    });
  });

  describe('WALLET_BUCKETS', () => {
    it('exposes the three bucket names in a stable order', () => {
      expect(WALLET_BUCKETS).toEqual(['available', 'pending', 'blocked']);
    });
  });
});
