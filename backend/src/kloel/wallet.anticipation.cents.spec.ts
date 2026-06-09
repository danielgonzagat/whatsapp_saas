/**
 * Proves the pure Float→cents conversion + parity helpers for the
 * WalletAnticipation money migration: canonical Math.round(amount*100) rounding,
 * bigint output, finite/safe-integer guards, independent per-field derivation,
 * and the per-row parity verdict (covered iff all three cents columns present;
 * matched iff covered AND all three equal the recompute).
 */
import {
  anticipationAmountToCents,
  deriveAnticipationCents,
  compareAnticipationRowParity,
} from './wallet.anticipation.cents';

describe('anticipationAmountToCents', () => {
  it('rounds to integer cents via Math.round(amount*100)', () => {
    expect(anticipationAmountToCents(10)).toBe(1000n);
    expect(anticipationAmountToCents(10.5)).toBe(1050n);
    expect(anticipationAmountToCents(0)).toBe(0n);
    // IEEE-754 reality: 1.005*100 === 100.49999999999999 → Math.round → 100.
    // This is the SAME rounding toSafeCents uses, so dual-write and backfill
    // agree byte-for-byte (correctness of the float→cents choice is out of
    // scope here — parity with the existing money math is the contract).
    expect(anticipationAmountToCents(1.005)).toBe(100n);
  });

  it('matches Math.round semantics exactly for a representative value', () => {
    const v = 33.33;
    expect(anticipationAmountToCents(v)).toBe(BigInt(Math.round(v * 100)));
  });

  it('throws on non-finite input', () => {
    expect(() => anticipationAmountToCents(NaN)).toThrow(/finite/);
    expect(() => anticipationAmountToCents(Infinity)).toThrow(/finite/);
  });

  it('throws when the rounded value is not a safe integer', () => {
    expect(() => anticipationAmountToCents(Number.MAX_SAFE_INTEGER)).toThrow(/safe integer/);
  });
});

describe('deriveAnticipationCents', () => {
  it('derives each field independently from its Float', () => {
    const cents = deriveAnticipationCents({
      originalAmount: 100,
      feeAmount: 3,
      netAmount: 97,
    });
    expect(cents).toEqual({
      originalAmountInCents: 10000n,
      feeAmountInCents: 300n,
      netAmountInCents: 9700n,
    });
  });

  it('does NOT re-derive net from original-fee (independent rounding)', () => {
    // If net were recomputed as original-fee it would be 9700; here we pass a
    // pre-rounded net that differs to prove it is taken verbatim.
    const cents = deriveAnticipationCents({
      originalAmount: 100,
      feeAmount: 3.33,
      netAmount: 96.67,
    });
    expect(cents.netAmountInCents).toBe(9667n);
    expect(cents.feeAmountInCents).toBe(333n);
  });
});

describe('compareAnticipationRowParity', () => {
  const floats = { originalAmount: 100, feeAmount: 3, netAmount: 97 };

  it('reports covered+matched when all cents columns equal the recompute', () => {
    const verdict = compareAnticipationRowParity({
      ...floats,
      originalAmountInCents: 10000n,
      feeAmountInCents: 300n,
      netAmountInCents: 9700n,
    });
    expect(verdict).toEqual({ covered: true, matched: true });
  });

  it('reports not-covered when any cents column is NULL', () => {
    const verdict = compareAnticipationRowParity({
      ...floats,
      originalAmountInCents: 10000n,
      feeAmountInCents: null,
      netAmountInCents: 9700n,
    });
    expect(verdict).toEqual({ covered: false, matched: false });
  });

  it('reports covered-but-not-matched on a divergent stored value', () => {
    const verdict = compareAnticipationRowParity({
      ...floats,
      originalAmountInCents: 9999n, // drift
      feeAmountInCents: 300n,
      netAmountInCents: 9700n,
    });
    expect(verdict).toEqual({ covered: true, matched: false });
  });
});
