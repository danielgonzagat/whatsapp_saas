import { Test } from '@nestjs/testing';
import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletLedgerService } from './wallet-ledger.service';
import { WalletService } from './wallet.service';

type ReconcileTxClient = {
  kloelWallet: { update: jest.Mock };
  kloelWalletTransaction: { updateMany: jest.Mock };
};

describe('WalletService.reconcilePendingPayments', () => {
  async function makeService() {
    const prisma = {
      kloelWallet: {
        findMany: jest.fn(),
      },
      kloelWalletTransaction: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };
    const walletLedger = {
      appendWithinTx: jest.fn().mockResolvedValue(undefined),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: prisma },
        { provide: FinancialAlertService, useValue: financialAlert },
        { provide: WalletLedgerService, useValue: walletLedger },
      ],
    }).compile();

    return { financialAlert, prisma, service: moduleRef.get(WalletService), walletLedger };
  }

  it('settles old pending credits into available balance with ledger pair', async () => {
    const { prisma, service, walletLedger } = await makeService();
    const statusUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const walletUpdate = jest.fn().mockResolvedValue({});

    prisma.kloelWalletTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-old',
        walletId: 'wallet-1',
        amount: 42.5,
        amountInCents: BigInt(4250),
        description: 'Venda antiga',
        status: 'pending',
        type: 'credit',
      },
    ]);
    prisma.kloelWallet.findMany.mockResolvedValue([
      {
        id: 'wallet-1',
        workspaceId: 'ws-1',
        availableBalance: 100,
        pendingBalance: 42.5,
        blockedBalance: 0,
      },
    ]);
    prisma.$transaction.mockImplementation(
      async (cb: (tx: ReconcileTxClient) => Promise<unknown>) =>
        cb({
          kloelWallet: { update: walletUpdate },
          kloelWalletTransaction: { updateMany: statusUpdate },
        }),
    );

    await service.reconcilePendingPayments();

    expect(statusUpdate).toHaveBeenCalledWith({
      where: { id: 'tx-old', status: 'pending' },
      data: { status: 'completed' },
    });
    expect(walletUpdate).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: {
        pendingBalance: { decrement: 42.5 },
        availableBalance: { increment: 42.5 },
        pendingBalanceInCents: { decrement: BigInt(4250) },
        availableBalanceInCents: { increment: BigInt(4250) },
      },
    });

    expect(walletLedger.appendWithinTx).toHaveBeenCalledTimes(2);
    expect(walletLedger.appendWithinTx.mock.calls[0][1]).toMatchObject({
      workspaceId: 'ws-1',
      walletId: 'wallet-1',
      transactionId: 'tx-old',
      direction: 'debit',
      bucket: 'pending',
      amountInCents: BigInt(4250),
      reason: 'reconcile_settle_debit',
    });
    expect(walletLedger.appendWithinTx.mock.calls[1][1]).toMatchObject({
      workspaceId: 'ws-1',
      walletId: 'wallet-1',
      transactionId: 'tx-old',
      direction: 'credit',
      bucket: 'available',
      amountInCents: BigInt(4250),
      reason: 'reconcile_settle_credit',
    });
  });
});
