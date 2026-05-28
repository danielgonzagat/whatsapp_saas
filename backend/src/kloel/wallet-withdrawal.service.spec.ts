import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialAlertService } from '../common/financial-alert.service';
import { WalletLedgerService } from './wallet-ledger.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

type WalletTxClient = ReturnType<typeof buildTxClient>;
type WalletTxCallback = (tx: WalletTxClient) => Promise<unknown>;

/**
 * Build a fake transactional Prisma client. Tests that exercise confirmPayment
 * inject their own findUnique/updateMany behaviour; the default resolves the
 * happy path where tx-1 belongs to wallet-1/ws-1 and is pending.
 */
function buildTxClient(overrides: {
  findUnique?: jest.Mock;
  updateMany?: jest.Mock;
  update?: jest.Mock;
  walletFindUnique?: jest.Mock;
  walletUpdateMany?: jest.Mock;
}) {
  return {
    kloelWallet: {
      update: overrides.update ?? jest.fn().mockResolvedValue({}),
      updateMany: overrides.walletUpdateMany ?? jest.fn().mockResolvedValue({ count: 1 }),
      findUnique:
        overrides.walletFindUnique ??
        jest.fn().mockResolvedValue({
          id: 'wallet-1',
          workspaceId: 'ws-1',
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
    },
    kloelWalletTransaction: {
      findUnique:
        overrides.findUnique ??
        jest.fn().mockResolvedValue({
          id: 'tx-1',
          walletId: 'wallet-1',
          status: 'pending',
          amount: 92.01,
          amountInCents: BigInt(9201),
          wallet: {
            id: 'wallet-1',
            workspaceId: 'ws-1',
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        }),
      updateMany: overrides.updateMany ?? jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('WalletService', () => {
  let service: WalletService;
  let prismaMock: ReturnType<typeof createPartialPrismaMock>;
  let walletLedger: { appendWithinTx: jest.Mock };

  const mockWallet = {
    id: 'wallet-1',
    workspaceId: 'ws-1',
    availableBalance: 1000,
    pendingBalance: 500,
    blockedBalance: 100,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    prismaMock = createPartialPrismaMock({
      kloelWallet: ['upsert', 'findUnique', 'create', 'update', 'updateMany'],
      kloelWalletTransaction: ['create', 'findUnique', 'findMany', 'count', 'update', 'updateMany'],
      auditLog: ['create'],
    });
    prismaMock.kloelWallet.upsert.mockResolvedValue(mockWallet);
    prismaMock.kloelWallet.findUnique.mockResolvedValue(mockWallet);
    prismaMock.kloelWallet.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.auditLog.create.mockResolvedValue({});

    walletLedger = { appendWithinTx: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: FinancialAlertService,
          useValue: {
            paymentFailed: jest.fn(),
            withdrawalFailed: jest.fn(),
            webhookProcessingFailed: jest.fn(),
            reconciliationAlert: jest.fn(),
          },
        },
        { provide: WalletLedgerService, useValue: walletLedger },
      ],
    }).compile();

    service = module.get(WalletService);
  });

  describe('requestWithdrawal', () => {
    it('rejects withdrawal when insufficient balance', async () => {
      // mockWallet has availableBalance: 1000
      const result = await service.requestWithdrawal('ws-1', 2000, {
        pixKey: '123',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Saldo insuficiente');
      expect(result.message).toContain('R$');
    });

    it('processes withdrawal when balance is sufficient', async () => {
      prismaMock.$transaction.mockImplementation(async (cb: Function) => {
        return cb({
          kloelWallet: prismaMock.kloelWallet,
          kloelWalletTransaction: {
            create: jest.fn().mockResolvedValue({ id: 'wtx-1' }),
          },
        });
      });

      const result = await service.requestWithdrawal('ws-1', 500, {
        pixKey: 'my-pix-key',
      });

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe('wtx-1');
    });

    it('fails closed when a concurrent writer changes the wallet before withdrawal debit', async () => {
      prismaMock.$transaction.mockImplementation(async (cb: Function) => {
        return cb({
          kloelWallet: {
            ...prismaMock.kloelWallet,
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
          kloelWalletTransaction: {
            create: jest.fn(),
          },
        });
      });

      await expect(
        service.requestWithdrawal('ws-1', 500, {
          pixKey: 'my-pix-key',
        }),
      ).rejects.toThrow('KloelWallet modified concurrently');
    });

    it('cross-tenant isolation: debit scoped to workspaceId in updateMany where clause', async () => {
      const walletUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      prismaMock.$transaction.mockImplementation(async (cb: Function) => {
        return cb({
          kloelWallet: { ...prismaMock.kloelWallet, updateMany: walletUpdateMany },
          kloelWalletTransaction: {
            create: jest.fn().mockResolvedValue({ id: 'wtx-1' }),
          },
        });
      });

      await service.requestWithdrawal('ws-1', 500, { pixKey: 'key' });

      expect(walletUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-1' }),
        }),
      );
    });
  });

  describe('getTransactionHistory', () => {
    it('returns paginated transactions with total count', async () => {
      const txList = [
        { id: 'tx-1', amount: 100, type: 'credit' },
        { id: 'tx-2', amount: -50, type: 'withdrawal' },
      ];
      prismaMock.kloelWalletTransaction.findMany.mockResolvedValue(txList);
      prismaMock.kloelWalletTransaction.count.mockResolvedValue(25);

      const result = await service.getTransactionHistory('ws-1', 1, 20);

      expect(result.transactions).toHaveLength(2);
      expect(result.total).toBe(25);
    });

    it('filters by transaction type when provided', async () => {
      prismaMock.kloelWalletTransaction.findMany.mockResolvedValue([]);
      prismaMock.kloelWalletTransaction.count.mockResolvedValue(0);

      await service.getTransactionHistory('ws-1', 1, 20, 'withdrawal');

      const findManyCall = prismaMock.kloelWalletTransaction.findMany.mock.calls[0][0];
      expect(findManyCall.where.wallet).toEqual({ workspaceId: 'ws-1' });
      expect(findManyCall.where.type).toBe('withdrawal');
    });

    it('workspaceId in where ensures cross-tenant isolation: ws-1 does not see ws-2 transactions', async () => {
      prismaMock.kloelWalletTransaction.findMany.mockResolvedValue([]);
      prismaMock.kloelWalletTransaction.count.mockResolvedValue(0);

      await service.getTransactionHistory('ws-1');

      const findManyCall = prismaMock.kloelWalletTransaction.findMany.mock.calls[0][0];
      expect(findManyCall.where.wallet).toEqual({ workspaceId: 'ws-1' });
      // ws-2 transactions are excluded at the DB level via the relation filter
      expect(findManyCall.where.wallet.workspaceId).not.toBe('ws-2');
    });
  });

  describe('reconcilePendingPayments', () => {
    it('exits early when there are no pending transactions to reconcile', async () => {
      prismaMock.kloelWalletTransaction.findMany.mockResolvedValue([]);

      await expect(service.reconcilePendingPayments()).resolves.toBeUndefined();

      expect(prismaMock.kloelWalletTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'pending', type: 'credit' }),
          take: 100,
        }),
      );
    });
  });
});
