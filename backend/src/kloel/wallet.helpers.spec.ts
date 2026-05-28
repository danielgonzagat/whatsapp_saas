import {
  ConcurrentWalletUpdateError,
  KloelWalletNotFoundError,
  buildAnticipationDescription,
  buildAnticipationSuccessResponse,
  buildAnticipationTransactionMetadata,
  buildConfirmPaymentNoopLogMessage,
  buildInsufficientBalanceFailureResponse,
  buildInsufficientBalanceMessage,
  buildInvalidMonetaryAmountResponse,
  buildProcessSaleResponse,
  buildReconciliationFailedLogMessage,
  buildReconciliationSettledLogMessage,
  buildReconciliationStartLogMessage,
  buildSaleLedgerMetadata,
  buildSaleSplitLogMessage,
  buildSaleTransactionMetadata,
  buildWalletAnticipationRowData,
  buildWalletIndex,
  buildWithdrawalDescription,
  buildWithdrawalSuccessResponse,
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

  describe('buildProcessSaleResponse', () => {
    it('builds the API response envelope from a SaleSplit + transaction id', () => {
      const split = calculateSaleSplit({
        saleAmount: 100,
        kloelFeePercent: 5,
        gatewayFeePercent: 2.99,
      });
      const response = buildProcessSaleResponse({ split, transactionId: 'tx-1' });
      expect(response).toEqual({
        grossAmount: 100,
        gatewayFee: 2.99,
        kloelFee: 5,
        netAmount: 92.01,
        transactionId: 'tx-1',
      });
    });
  });

  describe('buildWithdrawalSuccessResponse', () => {
    it('locks the PT-BR success envelope shape', () => {
      expect(buildWithdrawalSuccessResponse('tx-9')).toEqual({
        success: true,
        message: 'Saque solicitado',
        transactionId: 'tx-9',
      });
    });
  });

  describe('buildInvalidMonetaryAmountResponse', () => {
    it('uses the withdrawal PT-BR sentence', () => {
      expect(buildInvalidMonetaryAmountResponse('withdrawal')).toEqual({
        success: false,
        message: 'Valor de saque invalido.',
      });
    });

    it('uses the anticipation PT-BR sentence with accented characters', () => {
      expect(buildInvalidMonetaryAmountResponse('anticipation')).toEqual({
        success: false,
        message: 'Valor de antecipação inválido.',
      });
    });
  });

  describe('buildInsufficientBalanceFailureResponse', () => {
    const fakeFormat = (n: number) => `R$ ${n.toFixed(2)}`;

    it('wraps the available-bucket message in the failure envelope', () => {
      expect(buildInsufficientBalanceFailureResponse('available', 12.5, fakeFormat)).toEqual({
        success: false,
        message: 'Saldo insuficiente. Disponível: R$ 12.50',
      });
    });

    it('wraps the pending-bucket message in the failure envelope', () => {
      expect(buildInsufficientBalanceFailureResponse('pending', 99, fakeFormat)).toEqual({
        success: false,
        message: 'Saldo pendente insuficiente para antecipação. Disponível: R$ 99.00',
      });
    });

    it('matches buildInsufficientBalanceMessage verbatim for both buckets', () => {
      expect(buildInsufficientBalanceFailureResponse('available', 7, fakeFormat).message).toBe(
        buildInsufficientBalanceMessage('available', 7, fakeFormat),
      );
      expect(buildInsufficientBalanceFailureResponse('pending', 7, fakeFormat).message).toBe(
        buildInsufficientBalanceMessage('pending', 7, fakeFormat),
      );
    });
  });

  describe('buildAnticipationSuccessResponse', () => {
    it('builds the API response envelope from an AnticipationSplit', () => {
      const split = calculateAnticipationSplit({ amount: 1000, feePercent: 3 });
      const response = buildAnticipationSuccessResponse({
        transactionId: 'tx-ant-1',
        amount: 1000,
        feePercent: 3,
        split,
      });
      expect(response).toEqual({
        success: true,
        message: 'Antecipação realizada com sucesso.',
        transactionId: 'tx-ant-1',
        originalAmount: 1000,
        feePercent: 3,
        feeAmount: 30,
        netAmount: 970,
      });
    });

    it('reuses the AnticipationSplit fields without recomputing money', () => {
      // Pass a hand-crafted split (drifted from the math) — helper must echo it,
      // not redo the arithmetic. Locks the "no money math" contract.
      const response = buildAnticipationSuccessResponse({
        transactionId: 'tx-2',
        amount: 500,
        feePercent: 5,
        split: { feeAmount: 99, netAmount: 401 },
      });
      expect(response.feeAmount).toBe(99);
      expect(response.netAmount).toBe(401);
    });
  });

  describe('buildWalletAnticipationRowData', () => {
    it('builds the WalletAnticipation Prisma row payload', () => {
      const data = buildWalletAnticipationRowData({
        workspaceId: 'ws-1',
        amount: 1000,
        feePercent: 3,
        feeAmount: 30,
        netAmount: 970,
        transactionId: 'tx-1',
        installments: 4,
      });
      expect(data).toEqual({
        workspaceId: 'ws-1',
        originalAmount: 1000,
        feePercent: 3,
        feeAmount: 30,
        netAmount: 970,
        installments: 4,
        status: 'COMPLETED',
        transactionId: 'tx-1',
      });
    });

    it('normalizes missing installments to null', () => {
      const data = buildWalletAnticipationRowData({
        workspaceId: 'ws-2',
        amount: 500,
        feePercent: 3,
        feeAmount: 15,
        netAmount: 485,
        transactionId: 'tx-2',
      });
      expect(data.installments).toBeNull();
    });

    it('locks status to COMPLETED (anticipations settle immediately)', () => {
      const data = buildWalletAnticipationRowData({
        workspaceId: 'ws-2',
        amount: 100,
        feePercent: 3,
        feeAmount: 3,
        netAmount: 97,
        transactionId: 'tx-x',
      });
      expect(data.status).toBe('COMPLETED');
    });
  });

  describe('buildReconciliationStartLogMessage', () => {
    it('renders the batch size header', () => {
      expect(buildReconciliationStartLogMessage(5)).toBe('Reconciling 5 pending transaction(s)...');
      expect(buildReconciliationStartLogMessage(1)).toBe('Reconciling 1 pending transaction(s)...');
    });
  });

  describe('buildReconciliationSettledLogMessage', () => {
    const fakeFormat = (n: number) => `R$ ${n.toFixed(2)}`;

    it('renders the settled-tx log line with the formatted amount', () => {
      expect(buildReconciliationSettledLogMessage('tx-7', 99.5, fakeFormat)).toBe(
        'Settled tx tx-7: R$ 99.50 -> available',
      );
    });
  });

  describe('buildReconciliationFailedLogMessage', () => {
    it('renders the per-tx failure log line', () => {
      expect(buildReconciliationFailedLogMessage('tx-bad', 'database unreachable')).toBe(
        'Failed to settle tx tx-bad: database unreachable',
      );
    });
  });

  describe('buildConfirmPaymentNoopLogMessage', () => {
    it('renders the not_found reason', () => {
      expect(buildConfirmPaymentNoopLogMessage('tx-1', 'not_found')).toBe(
        'confirmPayment noop for tx-1: not_found',
      );
    });

    it('renders the not_pending reason', () => {
      expect(buildConfirmPaymentNoopLogMessage('tx-2', 'not_pending')).toBe(
        'confirmPayment noop for tx-2: not_pending',
      );
    });

    it('renders the race_lost reason', () => {
      expect(buildConfirmPaymentNoopLogMessage('tx-3', 'race_lost')).toBe(
        'confirmPayment noop for tx-3: race_lost',
      );
    });
  });
});
