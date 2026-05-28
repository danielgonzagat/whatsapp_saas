import {
  ConcurrentWalletUpdateError,
  KloelWalletNotFoundError,
  calculateAnticipationSplit,
  calculateSaleSplit,
  toSafeCents,
} from './wallet.helpers';

describe('wallet.helpers', () => {
  describe('toSafeCents', () => {
    it('rounds reals to integer cents', () => {
      expect(toSafeCents(10)).toBe(1000);
      expect(toSafeCents(10.5)).toBe(1050);
      expect(toSafeCents(0.01)).toBe(1);
    });

    it('rounds floating-point noise to the nearest cent', () => {
      // 0.1 + 0.2 = 0.30000000000000004 → must round to 30 cents.
      expect(toSafeCents(0.1 + 0.2)).toBe(30);
    });

    it('rejects zero by default', () => {
      expect(() => toSafeCents(0)).toThrow(/Invalid amount: 0/);
    });

    it('accepts zero when allowZero=true', () => {
      expect(toSafeCents(0, { allowZero: true })).toBe(0);
    });

    it('rejects negative values', () => {
      expect(() => toSafeCents(-5)).toThrow(/Invalid amount: -5/);
      expect(() => toSafeCents(-0.01, { allowZero: true })).toThrow(/Invalid amount/);
    });

    it('rejects NaN and Infinity', () => {
      expect(() => toSafeCents(Number.NaN)).toThrow(/Invalid amount/);
      expect(() => toSafeCents(Number.POSITIVE_INFINITY)).toThrow(/Invalid amount/);
      expect(() => toSafeCents(Number.NEGATIVE_INFINITY)).toThrow(/Invalid amount/);
    });

    it('uses custom label in the error message', () => {
      expect(() => toSafeCents(-1, { label: 'saleAmount' })).toThrow(/Invalid saleAmount/);
    });
  });

  describe('calculateSaleSplit', () => {
    it('computes the canonical 5% kloel / 2.99% gateway split', () => {
      const split = calculateSaleSplit({
        saleAmount: 100,
        kloelFeePercent: 5,
        gatewayFeePercent: 2.99,
      });

      expect(split.grossAmountInCents).toBe(10_000);
      expect(split.gatewayFeeInCents).toBe(299);
      expect(split.kloelFeeInCents).toBe(500);
      expect(split.netAmountInCents).toBe(9_201);
      // Real projections must equal cents / 100 exactly.
      expect(split.grossAmount).toBe(100);
      expect(split.gatewayFee).toBe(2.99);
      expect(split.kloelFee).toBe(5);
      expect(split.netAmount).toBe(92.01);
    });

    it('keeps gross + fees + net consistent in cents (no drift)', () => {
      const split = calculateSaleSplit({
        saleAmount: 257.37,
        kloelFeePercent: 5,
        gatewayFeePercent: 2.99,
      });

      expect(split.gatewayFeeInCents + split.kloelFeeInCents + split.netAmountInCents).toBe(
        split.grossAmountInCents,
      );
    });

    it('handles 0% fees (free split)', () => {
      const split = calculateSaleSplit({
        saleAmount: 50,
        kloelFeePercent: 0,
        gatewayFeePercent: 0,
      });

      expect(split.gatewayFeeInCents).toBe(0);
      expect(split.kloelFeeInCents).toBe(0);
      expect(split.netAmountInCents).toBe(5_000);
      expect(split.netAmount).toBe(50);
    });

    it('accepts saleAmount=0 (free sample)', () => {
      const split = calculateSaleSplit({
        saleAmount: 0,
        kloelFeePercent: 5,
        gatewayFeePercent: 2.99,
      });

      expect(split.grossAmountInCents).toBe(0);
      expect(split.gatewayFeeInCents).toBe(0);
      expect(split.kloelFeeInCents).toBe(0);
      expect(split.netAmountInCents).toBe(0);
    });

    it('rejects negative saleAmount', () => {
      expect(() =>
        calculateSaleSplit({ saleAmount: -1, kloelFeePercent: 5, gatewayFeePercent: 2.99 }),
      ).toThrow(/Invalid saleAmount/);
    });

    it('rejects NaN saleAmount', () => {
      expect(() =>
        calculateSaleSplit({ saleAmount: Number.NaN, kloelFeePercent: 5, gatewayFeePercent: 2.99 }),
      ).toThrow(/Invalid saleAmount/);
    });
  });

  describe('calculateAnticipationSplit', () => {
    it('computes the 3% anticipation fee in cents', () => {
      const split = calculateAnticipationSplit({ amount: 100, feePercent: 3 });

      expect(split.amountInCents).toBe(10_000);
      expect(split.feeAmountInCents).toBe(300);
      expect(split.netAmountInCents).toBe(BigInt(9_700));
      expect(split.feeAmount).toBe(3);
      expect(split.netAmount).toBe(97);
    });

    it('keeps amount = fee + net in cents (no drift)', () => {
      const split = calculateAnticipationSplit({ amount: 412.83, feePercent: 3.5 });

      const sum = BigInt(split.feeAmountInCents) + split.netAmountInCents;
      expect(sum).toBe(BigInt(split.amountInCents));
    });

    it('returns bigint for the wallet decrement field', () => {
      const split = calculateAnticipationSplit({ amount: 50, feePercent: 3 });
      expect(typeof split.netAmountInCents).toBe('bigint');
    });

    it('rejects amount=0 (zero anticipation is a no-op)', () => {
      expect(() => calculateAnticipationSplit({ amount: 0, feePercent: 3 })).toThrow(
        /Invalid anticipation amount/,
      );
    });

    it('rejects negative amount', () => {
      expect(() => calculateAnticipationSplit({ amount: -1, feePercent: 3 })).toThrow(
        /Invalid anticipation amount/,
      );
    });

    it('handles 0% fee (full net)', () => {
      const split = calculateAnticipationSplit({ amount: 100, feePercent: 0 });
      expect(split.feeAmountInCents).toBe(0);
      expect(split.netAmountInCents).toBe(BigInt(10_000));
    });
  });

  describe('error classes', () => {
    it('ConcurrentWalletUpdateError carries the canonical name + message', () => {
      const err = new ConcurrentWalletUpdateError();
      expect(err.name).toBe('ConcurrentWalletUpdateError');
      expect(err.message).toBe('KloelWallet modified concurrently');
      expect(err).toBeInstanceOf(Error);
    });

    it('KloelWalletNotFoundError embeds the workspaceId in the message', () => {
      const err = new KloelWalletNotFoundError('ws-123');
      expect(err.name).toBe('KloelWalletNotFoundError');
      expect(err.message).toBe('KloelWallet not found for workspace ws-123');
      expect(err).toBeInstanceOf(Error);
    });
  });
});
