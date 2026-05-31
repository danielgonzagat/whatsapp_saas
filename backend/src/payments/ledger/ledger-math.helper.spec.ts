import {
  applyAbsorptionDebit,
  assertPositiveAmount,
  buildAbsorptionMetadata,
  computeAbsorptionSplit,
  type LedgerAmountOperation,
} from './ledger-math.helper';

/**
 * Pure-helper spec for {@link ./ledger-math.helper}. No Prisma, no I/O — the
 * math is locked here so chargeback + refund spec failures can be diagnosed
 * without spinning up the in-memory stub.
 */

describe('assertPositiveAmount', () => {
  const cases: LedgerAmountOperation[] = [
    'creditPending',
    'creditAvailableByAdjustment',
    'debitAvailableForPayout',
    'debitForChargeback',
    'debitForRefund',
  ];

  cases.forEach((op) => {
    it(`accepts strictly positive amounts (${op})`, () => {
      expect(() => assertPositiveAmount(1n, op)).not.toThrow();
      expect(() => assertPositiveAmount(123_456_789n, op)).not.toThrow();
    });

    it(`rejects zero (${op})`, () => {
      expect(() => assertPositiveAmount(0n, op)).toThrow(RangeError);
      expect(() => assertPositiveAmount(0n, op)).toThrow(/must be > 0/);
    });

    it(`rejects negative amounts (${op})`, () => {
      expect(() => assertPositiveAmount(-1n, op)).toThrow(/must be > 0/);
    });
  });

  it('error message embeds operation name + numeric amount', () => {
    let captured: unknown;
    try {
      assertPositiveAmount(-50n, 'debitForRefund');
    } catch (error: unknown) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(RangeError);
    const message = (captured as Error).message;
    expect(message).toContain('debitForRefund');
    expect(message).toContain('-50');
  });
});

describe('computeAbsorptionSplit', () => {
  it('absorbs entirely from PENDING when reserve is sufficient', () => {
    const result = computeAbsorptionSplit(3_000n, 5_000n);
    expect(result.fromPending).toBe(3_000n);
    expect(result.fromAvailable).toBe(0n);
  });

  it('spills into AVAILABLE when PENDING is insufficient', () => {
    const result = computeAbsorptionSplit(4_000n, 1_000n);
    expect(result.fromPending).toBe(1_000n);
    expect(result.fromAvailable).toBe(3_000n);
  });

  it('returns full request from AVAILABLE when PENDING is zero', () => {
    const result = computeAbsorptionSplit(2_500n, 0n);
    expect(result.fromPending).toBe(0n);
    expect(result.fromAvailable).toBe(2_500n);
  });

  it('exact match: PENDING == amount drains PENDING fully, AVAILABLE untouched', () => {
    const result = computeAbsorptionSplit(7_777n, 7_777n);
    expect(result.fromPending).toBe(7_777n);
    expect(result.fromAvailable).toBe(0n);
  });
});

describe('applyAbsorptionDebit', () => {
  it('returns split + post-debit balances when PENDING absorbs fully', () => {
    const result = applyAbsorptionDebit(3_000n, 5_000n, 10_000n);
    expect(result.fromPending).toBe(3_000n);
    expect(result.fromAvailable).toBe(0n);
    expect(result.newPending).toBe(2_000n);
    expect(result.newAvailable).toBe(10_000n);
  });

  it('drives AVAILABLE negative when PENDING is exhausted (chargeback contract)', () => {
    const result = applyAbsorptionDebit(5_000n, 1_000n, 2_000n);
    expect(result.fromPending).toBe(1_000n);
    expect(result.fromAvailable).toBe(4_000n);
    expect(result.newPending).toBe(0n);
    expect(result.newAvailable).toBe(-2_000n);
  });

  it('handles zero PENDING — full spill to AVAILABLE', () => {
    const result = applyAbsorptionDebit(2_500n, 0n, 5_000n);
    expect(result.fromPending).toBe(0n);
    expect(result.fromAvailable).toBe(2_500n);
    expect(result.newPending).toBe(0n);
    expect(result.newAvailable).toBe(2_500n);
  });

  it('preserves bigint precision at large values', () => {
    const big = 9_999_999_999_999_999n;
    const result = applyAbsorptionDebit(big, big, big);
    expect(result.fromPending).toBe(big);
    expect(result.fromAvailable).toBe(0n);
    expect(result.newPending).toBe(0n);
    expect(result.newAvailable).toBe(big);
  });
});

describe('buildAbsorptionMetadata', () => {
  it('merges caller metadata with absorption fields', () => {
    const out = buildAbsorptionMetadata({ disputeId: 'dp_1' }, 1_500n, 500n);
    expect(out).toEqual({
      disputeId: 'dp_1',
      absorbedFromPendingCents: '1500',
      absorbedFromAvailableCents: '500',
    });
  });

  it('handles undefined caller metadata', () => {
    const out = buildAbsorptionMetadata(undefined, 0n, 7_000n);
    expect(out).toEqual({
      absorbedFromPendingCents: '0',
      absorbedFromAvailableCents: '7000',
    });
  });

  it('caller metadata may override absorption fields if it sets them (last write wins is spread order)', () => {
    // Spread order: caller first → absorption fields overwrite. Documented contract.
    const out = buildAbsorptionMetadata(
      { absorbedFromPendingCents: 'BOGUS', extra: true },
      10n,
      20n,
    );
    expect(out.absorbedFromPendingCents).toBe('10');
    expect(out.absorbedFromAvailableCents).toBe('20');
    expect(out.extra).toBe(true);
  });

  it('stringifies large bigints without precision loss', () => {
    const big = 1_234_567_890_123_456_789n;
    const out = buildAbsorptionMetadata(undefined, big, 0n);
    expect(out.absorbedFromPendingCents).toBe('1234567890123456789');
  });
});
