/**
 * Proves the flag-gated WalletAnticipation cents reader:
 *   - Flag OFF (default): returns the Float verbatim → byte-identical legacy.
 *   - Flag ON: prefers the *InCents column (÷100) when present, falls back to
 *     the Float when the cents column is NULL (un-backfilled row).
 *   - resolveAnticipationAmounts applies the rule per-field independently.
 */
import { readAnticipationAmount, resolveAnticipationAmounts } from './wallet.anticipation.read';

const FLAG = 'KLOEL_ANTICIPATION_CENTS_READ';

describe('readAnticipationAmount', () => {
  const prev = process.env[FLAG];
  afterEach(() => {
    if (prev === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = prev;
    }
  });

  describe('flag OFF (default)', () => {
    beforeEach(() => delete process.env[FLAG]);

    it('returns the Float verbatim even when cents present (byte-identical)', () => {
      expect(readAnticipationAmount(97.0, 9700n)).toBe(97.0);
    });

    it('returns the Float when cents is NULL', () => {
      expect(readAnticipationAmount(97.0, null)).toBe(97.0);
    });

    it('never diverges from the legacy value for an arbitrary float', () => {
      const f = 123.45;
      expect(readAnticipationAmount(f, 99999n)).toBe(f);
    });
  });

  describe('flag ON', () => {
    beforeEach(() => {
      process.env[FLAG] = 'true';
    });

    it('prefers cents ÷100 when present', () => {
      expect(readAnticipationAmount(0, 9700n)).toBe(97);
      expect(readAnticipationAmount(1, 1050n)).toBe(10.5);
    });

    it('falls back to the Float when cents is NULL (un-backfilled row)', () => {
      expect(readAnticipationAmount(97.0, null)).toBe(97.0);
    });

    it('treats any non-true value as OFF', () => {
      process.env[FLAG] = 'TRUE';
      expect(readAnticipationAmount(97.0, 9700n)).toBe(97.0);
      process.env[FLAG] = '1';
      expect(readAnticipationAmount(97.0, 9700n)).toBe(97.0);
    });
  });
});

describe('resolveAnticipationAmounts', () => {
  const prev = process.env[FLAG];
  afterEach(() => {
    if (prev === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = prev;
    }
  });

  const row = {
    originalAmount: 100,
    feeAmount: 3,
    netAmount: 97,
    originalAmountInCents: 10000n,
    feeAmountInCents: 300n,
    netAmountInCents: 9700n,
  };

  it('returns the Float triple unchanged when OFF', () => {
    delete process.env[FLAG];
    expect(resolveAnticipationAmounts(row)).toEqual({
      originalAmount: 100,
      feeAmount: 3,
      netAmount: 97,
    });
  });

  it('returns the cents-derived triple when ON', () => {
    process.env[FLAG] = 'true';
    expect(resolveAnticipationAmounts(row)).toEqual({
      originalAmount: 100,
      feeAmount: 3,
      netAmount: 97,
    });
  });

  it('mixes per-field: cents where present, Float fallback where NULL (ON)', () => {
    process.env[FLAG] = 'true';
    const mixed = { ...row, feeAmountInCents: null };
    expect(resolveAnticipationAmounts(mixed)).toEqual({
      originalAmount: 100,
      feeAmount: 3, // Float fallback
      netAmount: 97,
    });
  });
});
