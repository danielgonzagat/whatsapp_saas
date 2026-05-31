import {
  LEDGER_IDEMPOTENCY_RECOVERY_CODES,
  isLedgerIdempotencyRecoveryCode,
  mapBalanceToSnapshot,
  type LedgerBalanceRow,
} from './ledger-entry.helper';

describe('mapBalanceToSnapshot', () => {
  const baseRow: LedgerBalanceRow = {
    id: 'cab_seller',
    stripeAccountId: 'acct_seller',
    // ConnectAccountType is a string literal union — 'SELLER' is one of its
    // members so the test stays free of Prisma client coupling.
    accountType: 'SELLER',
    pendingBalanceCents: 100n,
    availableBalanceCents: 200n,
    lifetimeReceivedCents: 500n,
    lifetimePaidOutCents: 200n,
    lifetimeChargebacksCents: 0n,
  };

  it('renames Prisma balance columns to the public snapshot shape', () => {
    expect(mapBalanceToSnapshot(baseRow)).toEqual({
      accountBalanceId: 'cab_seller',
      stripeAccountId: 'acct_seller',
      accountType: 'SELLER',
      pendingCents: 100n,
      availableCents: 200n,
      lifetimeReceivedCents: 500n,
      lifetimePaidOutCents: 200n,
      lifetimeChargebacksCents: 0n,
    });
  });

  it('preserves bigint precision (no Number coercion)', () => {
    const row: LedgerBalanceRow = {
      ...baseRow,
      pendingBalanceCents: 9_007_199_254_740_993n,
      availableBalanceCents: 12_345_678_901_234_567n,
    };
    const snapshot = mapBalanceToSnapshot(row);
    expect(typeof snapshot.pendingCents).toBe('bigint');
    expect(typeof snapshot.availableCents).toBe('bigint');
    expect(snapshot.pendingCents).toBe(9_007_199_254_740_993n);
    expect(snapshot.availableCents).toBe(12_345_678_901_234_567n);
  });

  it('passes negative balances through unchanged (chargeback/refund contract)', () => {
    const row: LedgerBalanceRow = {
      ...baseRow,
      availableBalanceCents: -50n,
    };
    expect(mapBalanceToSnapshot(row).availableCents).toBe(-50n);
  });
});

describe('isLedgerIdempotencyRecoveryCode', () => {
  it('matches the documented recovery codes', () => {
    expect(isLedgerIdempotencyRecoveryCode('P2002')).toBe(true);
    expect(isLedgerIdempotencyRecoveryCode('P2025')).toBe(true);
  });

  it('rejects unrelated Prisma codes', () => {
    expect(isLedgerIdempotencyRecoveryCode('P2003')).toBe(false);
    expect(isLedgerIdempotencyRecoveryCode('P1001')).toBe(false);
    expect(isLedgerIdempotencyRecoveryCode('')).toBe(false);
  });

  it('rejects undefined safely', () => {
    expect(isLedgerIdempotencyRecoveryCode(undefined)).toBe(false);
  });

  it('exposes the exact code set for inspection', () => {
    expect([...LEDGER_IDEMPOTENCY_RECOVERY_CODES]).toEqual(['P2002', 'P2025']);
  });
});
