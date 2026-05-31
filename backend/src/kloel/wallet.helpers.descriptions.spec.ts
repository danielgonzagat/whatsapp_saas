import {
  buildAnticipationDescription,
  buildAnticipationTransactionMetadata,
  buildInsufficientBalanceMessage,
  buildSaleLedgerMetadata,
  buildSaleSplitLogMessage,
  buildSaleTransactionMetadata,
  buildWithdrawalDescription,
  calculateSaleSplit,
} from './wallet.helpers';

describe('wallet.helpers (descriptions)', () => {
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

  describe('buildSaleSplitLogMessage', () => {
    const fakeFormat = (n: number) => `R$ ${n.toFixed(2)}`;

    it('renders the gross/net + cents breakdown', () => {
      const split = calculateSaleSplit({
        saleAmount: 100,
        kloelFeePercent: 5,
        gatewayFeePercent: 2.99,
      });
      expect(buildSaleSplitLogMessage(split, fakeFormat)).toBe(
        'Split: R$ 100.00 -> Líquido: R$ 92.01 (cents: gross=10000, gateway=299, kloel=500, net=9201)',
      );
    });

    it('routes both gross and net amounts through the formatter', () => {
      const calls: number[] = [];
      const probe = (n: number) => {
        calls.push(n);
        return 'X';
      };
      const split = calculateSaleSplit({
        saleAmount: 50,
        kloelFeePercent: 0,
        gatewayFeePercent: 0,
      });
      buildSaleSplitLogMessage(split, probe);
      // gross then net — order matters for the log line readability.
      expect(calls).toEqual([50, 50]);
    });
  });

  describe('buildSaleLedgerMetadata', () => {
    it('builds the {saleId, cents...} metadata blob for the sale_credit ledger', () => {
      const split = calculateSaleSplit({
        saleAmount: 100,
        kloelFeePercent: 5,
        gatewayFeePercent: 2.99,
      });
      const meta = buildSaleLedgerMetadata({ saleId: 'sale-7', split });
      expect(meta).toEqual({
        saleId: 'sale-7',
        grossAmountInCents: 10_000,
        gatewayFeeInCents: 299,
        kloelFeeInCents: 500,
      });
    });

    it('does not leak the net amount into the metadata (legacy contract)', () => {
      const split = calculateSaleSplit({
        saleAmount: 100,
        kloelFeePercent: 5,
        gatewayFeePercent: 2.99,
      });
      const meta = buildSaleLedgerMetadata({ saleId: 'sale-x', split }) as Record<string, unknown>;
      expect(meta.netAmountInCents).toBeUndefined();
      expect(meta.netAmount).toBeUndefined();
    });
  });
});
