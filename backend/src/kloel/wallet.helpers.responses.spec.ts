import {
  buildAnticipationSuccessResponse,
  buildInsufficientBalanceFailureResponse,
  buildInsufficientBalanceMessage,
  buildInvalidMonetaryAmountResponse,
  buildProcessSaleResponse,
  buildWalletAnticipationRowData,
  buildWithdrawalSuccessResponse,
  calculateAnticipationSplit,
  calculateSaleSplit,
} from './wallet.helpers';

describe('wallet.helpers (responses)', () => {
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
});
