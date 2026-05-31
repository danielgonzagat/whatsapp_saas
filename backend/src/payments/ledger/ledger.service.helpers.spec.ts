import {
  buildAbsorptionDebitAuditDetails,
  buildCreditPendingAuditDetails,
  buildDebitPayoutAuditDetails,
  buildLedgerReferenceIdempotencyWhere,
  buildMatureAuditDetails,
  buildMatureEntryMetadata,
  computeCreditPendingBalanceDelta,
  computeDebitPayoutBalanceDelta,
  computeMatureBalanceDelta,
  mapIdempotencyRecoveryReason,
} from './ledger.service.helpers';

/**
 * Pure-helper spec for `ledger.service.helpers.ts` (Wave 107 extraction).
 *
 * Strategy: every function in this file is pure (no Prisma, no logging, no
 * clock). The spec locks the exact wire-shape that downstream observability
 * tools rely on — field names, stringification, optional-field presence —
 * because the inlined originals already emit those exact JSON keys to
 * Datadog. Any drift here is a wire break, not a refactor.
 */

const REFERENCE = { type: 'sale', id: 'pi_test_123' } as const;

describe('buildLedgerReferenceIdempotencyWhere', () => {
  it('emits the canonical (referenceType, referenceId, type) tuple', () => {
    const where = buildLedgerReferenceIdempotencyWhere(REFERENCE, 'CREDIT_PENDING');
    expect(where).toEqual({
      referenceType: 'sale',
      referenceId: 'pi_test_123',
      type: 'CREDIT_PENDING',
    });
  });

  it('supports every monetary entry type the service produces', () => {
    const types = ['CREDIT_PENDING', 'DEBIT_PAYOUT', 'DEBIT_CHARGEBACK', 'DEBIT_REFUND'] as const;
    types.forEach((type) => {
      const where = buildLedgerReferenceIdempotencyWhere(REFERENCE, type);
      expect(where.type).toBe(type);
      expect(where.referenceType).toBe('sale');
      expect(where.referenceId).toBe('pi_test_123');
    });
  });

  it('does not mutate the reference argument', () => {
    const ref = { type: 'payout', id: 'po_1' };
    buildLedgerReferenceIdempotencyWhere(ref, 'DEBIT_PAYOUT');
    expect(ref).toEqual({ type: 'payout', id: 'po_1' });
  });

  it('keeps the key order stable for index planner stability', () => {
    const where = buildLedgerReferenceIdempotencyWhere(REFERENCE, 'DEBIT_PAYOUT');
    expect(Object.keys(where)).toEqual(['referenceType', 'referenceId', 'type']);
  });
});

describe('computeCreditPendingBalanceDelta', () => {
  it('adds amount to PENDING and to LIFETIME_RECEIVED', () => {
    const result = computeCreditPendingBalanceDelta(100n, 1_000n, 50n);
    expect(result).toEqual({ newPending: 150n, newLifetimeReceived: 1_050n });
  });

  it('handles zero starting balances', () => {
    const result = computeCreditPendingBalanceDelta(0n, 0n, 75n);
    expect(result).toEqual({ newPending: 75n, newLifetimeReceived: 75n });
  });

  it('preserves bigint precision at large values', () => {
    const big = 9_999_999_999_999_999n;
    const result = computeCreditPendingBalanceDelta(big, big, 1n);
    expect(result.newPending).toBe(big + 1n);
    expect(result.newLifetimeReceived).toBe(big + 1n);
  });
});

describe('computeMatureBalanceDelta', () => {
  it('shrinks PENDING and grows AVAILABLE by the matured amount', () => {
    const result = computeMatureBalanceDelta(500n, 200n, 100n);
    expect(result).toEqual({ newPending: 400n, newAvailable: 300n });
  });

  it('drains PENDING fully when amount equals the pending bucket', () => {
    const result = computeMatureBalanceDelta(750n, 250n, 750n);
    expect(result).toEqual({ newPending: 0n, newAvailable: 1_000n });
  });

  it('preserves bigint precision', () => {
    const big = 1_234_567_890_123_456_789n;
    const result = computeMatureBalanceDelta(big, 0n, big);
    expect(result.newPending).toBe(0n);
    expect(result.newAvailable).toBe(big);
  });
});

describe('computeDebitPayoutBalanceDelta', () => {
  it('shrinks AVAILABLE and grows LIFETIME_PAID_OUT', () => {
    const result = computeDebitPayoutBalanceDelta(1_000n, 5_000n, 200n);
    expect(result).toEqual({ newAvailable: 800n, newLifetimePaidOut: 5_200n });
  });

  it('handles zero starting lifetime counter', () => {
    const result = computeDebitPayoutBalanceDelta(1_000n, 0n, 1_000n);
    expect(result).toEqual({ newAvailable: 0n, newLifetimePaidOut: 1_000n });
  });
});

describe('buildMatureEntryMetadata', () => {
  it('captures the originating entry id under the canonical key', () => {
    expect(buildMatureEntryMetadata('entry_42')).toEqual({ promotedFromEntryId: 'entry_42' });
  });

  it('returns a fresh object each call', () => {
    const a = buildMatureEntryMetadata('e1');
    const b = buildMatureEntryMetadata('e1');
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe('buildCreditPendingAuditDetails', () => {
  it('stringifies both balance fields', () => {
    const details = buildCreditPendingAuditDetails(REFERENCE, 500n, 200n);
    expect(details).toEqual({
      referenceType: 'sale',
      referenceId: 'pi_test_123',
      newPendingBalanceCents: '500',
      newAvailableBalanceCents: '200',
    });
  });

  it('preserves bigint precision via toString()', () => {
    const big = 9_007_199_254_740_993n; // > Number.MAX_SAFE_INTEGER
    const details = buildCreditPendingAuditDetails(REFERENCE, big, 0n);
    expect(details.newPendingBalanceCents).toBe('9007199254740993');
  });
});

describe('buildMatureAuditDetails', () => {
  it('emits the promoted-from-entry plus both balances', () => {
    const details = buildMatureAuditDetails('entry_src', 100n, 900n);
    expect(details).toEqual({
      promotedFromEntryId: 'entry_src',
      newPendingBalanceCents: '100',
      newAvailableBalanceCents: '900',
    });
  });

  it('emits balance fields as strings (not numbers)', () => {
    const details = buildMatureAuditDetails('e', 1n, 2n);
    expect(typeof details.newPendingBalanceCents).toBe('string');
    expect(typeof details.newAvailableBalanceCents).toBe('string');
  });
});

describe('buildDebitPayoutAuditDetails', () => {
  it('emits AVAILABLE + LIFETIME_PAID_OUT under the canonical keys', () => {
    const details = buildDebitPayoutAuditDetails(REFERENCE, 700n, 1_300n);
    expect(details).toEqual({
      referenceType: 'sale',
      referenceId: 'pi_test_123',
      newAvailableBalanceCents: '700',
      newLifetimePaidOutCents: '1300',
    });
  });

  it('does NOT emit a chargeback counter on the payout path', () => {
    const details = buildDebitPayoutAuditDetails(REFERENCE, 1n, 1n);
    expect(details.newLifetimeChargebacksCents).toBeUndefined();
  });
});

describe('buildAbsorptionDebitAuditDetails', () => {
  it('emits absorbed + new balances for the refund shape (no chargeback counter)', () => {
    const details = buildAbsorptionDebitAuditDetails(REFERENCE, 100n, 0n, 0n, 200n);
    expect(details).toEqual({
      referenceType: 'sale',
      referenceId: 'pi_test_123',
      absorbedFromPendingCents: '100',
      absorbedFromAvailableCents: '0',
      newPendingBalanceCents: '0',
      newAvailableBalanceCents: '200',
    });
    expect(details.newLifetimeChargebacksCents).toBeUndefined();
  });

  it('appends the chargeback counter when supplied', () => {
    const details = buildAbsorptionDebitAuditDetails(REFERENCE, 50n, 50n, 50n, 150n, 999n);
    expect(details.newLifetimeChargebacksCents).toBe('999');
    expect(details.absorbedFromPendingCents).toBe('50');
    expect(details.absorbedFromAvailableCents).toBe('50');
  });

  it('handles negative AVAILABLE post-debit (chargeback may drive negative)', () => {
    const details = buildAbsorptionDebitAuditDetails(
      REFERENCE,
      1_000n,
      4_000n,
      0n,
      -2_000n,
      5_000n,
    );
    expect(details.newAvailableBalanceCents).toBe('-2000');
    expect(details.newLifetimeChargebacksCents).toBe('5000');
  });

  it('preserves bigint precision for large values', () => {
    const big = 1_234_567_890_123_456_789n;
    const details = buildAbsorptionDebitAuditDetails(REFERENCE, big, 0n, 0n, 0n, big);
    expect(details.absorbedFromPendingCents).toBe('1234567890123456789');
    expect(details.newLifetimeChargebacksCents).toBe('1234567890123456789');
  });
});

describe('mapIdempotencyRecoveryReason', () => {
  it('maps P2002 to the concurrent-write reason', () => {
    expect(mapIdempotencyRecoveryReason('P2002')).toBe('P2002 concurrent');
  });

  it('maps P2025 to the stale-row reason', () => {
    expect(mapIdempotencyRecoveryReason('P2025')).toBe('P2025 stale row');
  });
});
