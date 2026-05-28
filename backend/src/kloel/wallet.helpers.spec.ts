import {
  ConcurrentWalletUpdateError,
  KloelWalletNotFoundError,
  buildAnticipationDescription,
  buildAnticipationTransactionMetadata,
  buildInsufficientBalanceMessage,
  buildSaleTransactionMetadata,
  buildWalletIndex,
  buildWithdrawalDescription,
  calculateAnticipationSplit,
  calculateSaleSplit,
  isValidMonetaryAmount,
  toSafeCents,
  uniqueWalletIds,
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

  describe('isValidMonetaryAmount', () => {
    it('accepts positive finite numbers', () => {
      expect(isValidMonetaryAmount(1)).toBe(true);
      expect(isValidMonetaryAmount(0.01)).toBe(true);
      expect(isValidMonetaryAmount(1_000_000)).toBe(true);
    });

    it('rejects zero, negatives, NaN and infinities', () => {
      expect(isValidMonetaryAmount(0)).toBe(false);
      expect(isValidMonetaryAmount(-1)).toBe(false);
      expect(isValidMonetaryAmount(Number.NaN)).toBe(false);
      expect(isValidMonetaryAmount(Number.POSITIVE_INFINITY)).toBe(false);
      expect(isValidMonetaryAmount(Number.NEGATIVE_INFINITY)).toBe(false);
    });

    it('rejects null and undefined', () => {
      expect(isValidMonetaryAmount(null)).toBe(false);
      expect(isValidMonetaryAmount(undefined)).toBe(false);
    });
  });

  describe('buildInsufficientBalanceMessage', () => {
    const fakeFormat = (n: number) => `R$ ${n.toFixed(2)}`;

    it('builds the available-bucket message for withdrawals', () => {
      expect(buildInsufficientBalanceMessage('available', 12.5, fakeFormat)).toBe(
        'Saldo insuficiente. Disponível: R$ 12.50',
      );
    });

    it('builds the pending-bucket message for anticipations', () => {
      expect(buildInsufficientBalanceMessage('pending', 99, fakeFormat)).toBe(
        'Saldo pendente insuficiente para antecipação. Disponível: R$ 99.00',
      );
    });

    it('routes the balance through the supplied formatter (no math leak)', () => {
      const calls: number[] = [];
      const probe = (n: number) => {
        calls.push(n);
        return 'X';
      };
      buildInsufficientBalanceMessage('available', 7.25, probe);
      expect(calls).toEqual([7.25]);
    });
  });

  describe('buildWithdrawalDescription', () => {
    it('labels withdrawals with PIX when pixKey is present', () => {
      expect(buildWithdrawalDescription({ pixKey: 'abc' })).toBe('Saque via PIX');
    });

    it('labels withdrawals with TED otherwise', () => {
      expect(buildWithdrawalDescription({})).toBe('Saque via TED');
      expect(buildWithdrawalDescription({ pixKey: '' })).toBe('Saque via TED');
      expect(buildWithdrawalDescription({ bank: 'X' })).toBe('Saque via TED');
    });
  });

  describe('buildAnticipationDescription', () => {
    it('embeds the percent verbatim', () => {
      expect(buildAnticipationDescription(3)).toBe('Antecipação de recebíveis (taxa 3%)');
      expect(buildAnticipationDescription(3.5)).toBe('Antecipação de recebíveis (taxa 3.5%)');
    });
  });

  describe('buildSaleTransactionMetadata', () => {
    it('passes the SaleSplit fields straight through', () => {
      const split = calculateSaleSplit({
        saleAmount: 100,
        kloelFeePercent: 5,
        gatewayFeePercent: 2.99,
      });
      const meta = buildSaleTransactionMetadata(split);

      expect(meta).toEqual({
        grossAmount: split.grossAmount,
        grossAmountInCents: split.grossAmountInCents,
        gatewayFee: split.gatewayFee,
        gatewayFeeInCents: split.gatewayFeeInCents,
        kloelFee: split.kloelFee,
        kloelFeeInCents: split.kloelFeeInCents,
        netAmount: split.netAmount,
        netAmountInCents: split.netAmountInCents,
      });
    });
  });

  describe('buildAnticipationTransactionMetadata', () => {
    it('builds the metadata blob with explicit installments', () => {
      const meta = buildAnticipationTransactionMetadata({
        amount: 100,
        feePercent: 3,
        feeAmount: 3,
        netAmount: 97,
        installments: 4,
      });
      expect(meta).toEqual({
        originalAmount: 100,
        feePercent: 3,
        feeAmount: 3,
        netAmount: 97,
        installments: 4,
        anticipationType: 'pending_settlement',
      });
    });

    it('normalizes missing installments to null', () => {
      const meta = buildAnticipationTransactionMetadata({
        amount: 100,
        feePercent: 3,
        feeAmount: 3,
        netAmount: 97,
      });
      expect(meta.installments).toBeNull();
    });
  });

  describe('uniqueWalletIds', () => {
    it('deduplicates wallet ids while preserving valid strings', () => {
      const out = uniqueWalletIds([
        { walletId: 'a' },
        { walletId: 'b' },
        { walletId: 'a' },
        { walletId: 'c' },
      ]);
      expect(out).toEqual(['a', 'b', 'c']);
    });

    it('drops null, undefined and empty wallet ids', () => {
      const out = uniqueWalletIds([
        { walletId: 'x' },
        { walletId: null },
        { walletId: undefined },
        { walletId: '' },
        { walletId: 'y' },
      ]);
      expect(out).toEqual(['x', 'y']);
    });

    it('returns an empty array when input has no valid ids', () => {
      expect(uniqueWalletIds([])).toEqual([]);
      expect(uniqueWalletIds([{ walletId: null }, { walletId: '' }])).toEqual([]);
    });
  });

  describe('buildWalletIndex', () => {
    it('keys wallets by id with O(1) lookup', () => {
      const wallets = [
        { id: 'w1', workspaceId: 'ws-1' },
        { id: 'w2', workspaceId: 'ws-2' },
      ];
      const idx = buildWalletIndex(wallets);
      expect(idx.size).toBe(2);
      expect(idx.get('w1')).toBe(wallets[0]);
      expect(idx.get('w2')).toBe(wallets[1]);
      expect(idx.get('missing')).toBeUndefined();
    });

    it('keeps the LAST occurrence on duplicate ids (Map semantics)', () => {
      const w1a = { id: 'w', workspaceId: 'ws-a' };
      const w1b = { id: 'w', workspaceId: 'ws-b' };
      const idx = buildWalletIndex([w1a, w1b]);
      expect(idx.size).toBe(1);
      expect(idx.get('w')).toBe(w1b);
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
