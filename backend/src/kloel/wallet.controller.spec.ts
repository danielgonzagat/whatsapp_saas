/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import { WalletController } from './wallet.controller';
import { partialMatch } from '../../test/helpers/match-instance';

describe('WalletController withdrawal approval gate', () => {
  let walletService: { requestWithdrawal: jest.Mock; getBalance: jest.Mock };
  let prisma: {
    approvalRequest: {
      create: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let controller: WalletController;

  beforeEach(() => {
    walletService = {
      requestWithdrawal: jest.fn().mockResolvedValue({
        success: true,
        message: 'Saque solicitado',
        transactionId: 'wtx-1',
      }),
      getBalance: jest.fn(),
    };
    prisma = {
      approvalRequest: {
        create: jest.fn().mockResolvedValue({
          id: 'ap-wallet-1',
          state: 'OPEN',
          title: 'Aprovar saque de R$ 500,00',
          createdAt: new Date('2026-05-11T22:45:00.000Z'),
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    controller = new WalletController(walletService as never, prisma as never, {} as never);
  });

  it('creates an approval request instead of executing withdrawal immediately', async () => {
    const result = await controller.withdraw('ws-1', {
      amount: 500,
      pixKey: 'owner@example.com',
    });

    expect(walletService.requestWithdrawal).not.toHaveBeenCalled();
    expect(prisma.approvalRequest.create).toHaveBeenCalledWith(
      partialMatch({
        data: partialMatch({
          workspaceId: 'ws-1',
          kind: 'wallet:withdrawal',
          entityType: 'KloelWallet',
          entityId: 'ws-1',
          state: 'OPEN',
          payload: partialMatch({
            amount: 500,
            bankInfo: { pixKey: 'owner@example.com' },
            risk: 'critical',
            requiresApproval: true,
          }),
        }),
      }),
    );
    expect(result).toEqual(
      partialMatch({
        success: true,
        approvalRequired: true,
        approvalRequestId: 'ap-wallet-1',
      }),
    );
  });

  it('executes withdrawal only when an approved request is supplied', async () => {
    prisma.approvalRequest.findFirst.mockResolvedValueOnce({
      id: 'ap-wallet-1',
      payload: { amount: 500, bankInfo: { pixKey: 'owner@example.com' } },
    });

    const result = await controller.withdraw('ws-1', {
      amount: 1,
      approvalRequestId: 'ap-wallet-1',
    });

    expect(walletService.requestWithdrawal).toHaveBeenCalledWith('ws-1', 500, {
      pixKey: 'owner@example.com',
    });
    expect(prisma.approvalRequest.updateMany).toHaveBeenCalledWith(
      partialMatch({
        where: { id: 'ap-wallet-1', workspaceId: 'ws-1', state: 'APPROVED' },
        data: partialMatch({ state: 'COMPLETED' }),
      }),
    );
    expect(result).toEqual(
      partialMatch({
        success: true,
        transactionId: 'wtx-1',
        approvalExecuted: true,
      }),
    );
  });

  it('does not execute withdrawal when approval is missing', async () => {
    const result = await controller.withdraw('ws-1', {
      amount: 1,
      approvalRequestId: 'ap-wallet-1',
    });

    expect(walletService.requestWithdrawal).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, message: 'Saque aprovado nao encontrado.' });
  });
});

describe('WalletController money reads source bigint cents', () => {
  let prisma: {
    kloelWallet: { findUnique: jest.Mock };
    kloelWalletTransaction: { findMany: jest.Mock };
  };
  let controller: WalletController;

  beforeEach(() => {
    prisma = {
      kloelWallet: { findUnique: jest.fn() },
      kloelWalletTransaction: { findMany: jest.fn() },
    };
    controller = new WalletController({} as never, prisma as never, {} as never);
  });

  describe('getMonthlyBreakdown', () => {
    it('returns zeros when the wallet does not exist', async () => {
      prisma.kloelWallet.findUnique.mockResolvedValue(null);

      const result = await controller.getMonthlyBreakdown('ws-missing');

      expect(result).toEqual({ income: 0, expense: 0, balance: 0, daily: [] });
      expect(prisma.kloelWalletTransaction.findMany).not.toHaveBeenCalled();
    });

    it('sums income/expense from amountInCents (bigint), never the deprecated Float amount', async () => {
      prisma.kloelWallet.findUnique.mockResolvedValue({ id: 'w-1' });
      const now = new Date();
      const dayA = new Date(now.getFullYear(), now.getMonth(), 5, 12);
      const dayB = new Date(now.getFullYear(), now.getMonth(), 9, 12);
      prisma.kloelWalletTransaction.findMany.mockResolvedValue([
        // amount (Float) intentionally WRONG to prove it is not read.
        { amountInCents: 150075n, amount: 999, createdAt: dayA },
        { amountInCents: -50025n, amount: 999, createdAt: dayB },
      ]);

      const result = await controller.getMonthlyBreakdown('ws-1');

      // amountInCents-sourced: 150075c -> R$1500.75 income, 50025c -> R$500.25 expense.
      expect(result.income).toBe(1500.75);
      expect(result.expense).toBe(500.25);
      expect(result.balance).toBe(1000.5);
      // The query must select the cents column, not the Float column.
      const findManyArg = prisma.kloelWalletTransaction.findMany.mock.calls[0][0];
      expect(findManyArg.select).toEqual({ amountInCents: true, createdAt: true });
      // Daily buckets are also cents-sourced.
      expect(result.daily[dayA.getDate() - 1]).toEqual({
        day: dayA.getDate(),
        income: 1500.75,
        expense: 0,
      });
      expect(result.daily[dayB.getDate() - 1]).toEqual({
        day: dayB.getDate(),
        income: 0,
        expense: 500.25,
      });
    });
  });

  describe('getRevenueChart', () => {
    it('returns a zero-filled 7-slot chart when the wallet does not exist', async () => {
      prisma.kloelWallet.findUnique.mockResolvedValue(null);

      const result = await controller.getRevenueChart('ws-missing');

      expect(result).toEqual({ chart: [0, 0, 0, 0, 0, 0, 0] });
      expect(prisma.kloelWalletTransaction.findMany).not.toHaveBeenCalled();
    });

    it('buckets positive revenue from amountInCents (bigint) into the last 7 days', async () => {
      prisma.kloelWallet.findUnique.mockResolvedValue({ id: 'w-1' });
      prisma.kloelWalletTransaction.findMany.mockResolvedValue([
        // today, amount (Float) intentionally WRONG to prove it is not read.
        { amountInCents: 250050n, amount: 999, createdAt: new Date() },
      ]);

      const result = await controller.getRevenueChart('ws-1');

      // Last slot (today) = 250050c -> R$2500.50.
      expect(result.chart[6]).toBe(2500.5);
      expect(result.chart.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 0]);
      // The query must filter + select on the cents column, not the Float column.
      const findManyArg = prisma.kloelWalletTransaction.findMany.mock.calls[0][0];
      expect(findManyArg.where.amountInCents).toEqual({ gt: 0 });
      expect(findManyArg.where.amount).toBeUndefined();
      expect(findManyArg.select).toEqual({ amountInCents: true, createdAt: true });
    });
  });
});
