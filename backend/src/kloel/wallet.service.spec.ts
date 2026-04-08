import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialAlertService } from '../common/financial-alert.service';

/**
 * Build a fake transactional Prisma client. Tests that exercise confirmPayment
 * inject their own findUnique/updateMany behaviour; the default resolves the
 * happy path where tx-1 belongs to wallet-1/ws-1 and is pending.
 */
function buildTxClient(overrides: {
  findUnique?: jest.Mock;
  updateMany?: jest.Mock;
  update?: jest.Mock;
}) {
  return {
    kloelWallet: {
      update: overrides.update ?? jest.fn().mockResolvedValue({}),
    },
    kloelWalletTransaction: {
      findUnique:
        overrides.findUnique ??
        jest.fn().mockResolvedValue({
          id: 'tx-1',
          walletId: 'wallet-1',
          status: 'pending',
          amount: 92.01,
          wallet: { id: 'wallet-1', workspaceId: 'ws-1' },
        }),
      updateMany: overrides.updateMany ?? jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('WalletService', () => {
  let service: WalletService;
  let prismaAny: any;

  const mockWallet = {
    id: 'wallet-1',
    workspaceId: 'ws-1',
    availableBalance: 1000,
    pendingBalance: 500,
    blockedBalance: 100,
  };

  beforeEach(async () => {
    prismaAny = {
      kloelWallet: {
        findUnique: jest.fn().mockResolvedValue(mockWallet),
        create: jest.fn(),
        update: jest.fn(),
      },
      kloelWalletTransaction: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: prismaAny },
        {
          provide: FinancialAlertService,
          useValue: {
            paymentFailed: jest.fn(),
            withdrawalFailed: jest.fn(),
            webhookProcessingFailed: jest.fn(),
            reconciliationAlert: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(WalletService);
  });

  describe('getBalance', () => {
    it('returns available, pending, blocked and total', async () => {
      const balance = await service.getBalance('ws-1');

      expect(balance).toEqual({
        available: 1000,
        pending: 500,
        blocked: 100,
        total: 1600,
      });
    });

    it('creates wallet if none exists', async () => {
      prismaAny.kloelWallet.findUnique.mockResolvedValue(null);
      const newWallet = {
        ...mockWallet,
        availableBalance: 0,
        pendingBalance: 0,
        blockedBalance: 0,
      };
      prismaAny.kloelWallet.create.mockResolvedValue(newWallet);

      const balance = await service.getBalance('ws-1');

      expect(prismaAny.kloelWallet.create).toHaveBeenCalled();
      expect(balance.total).toBe(0);
    });
  });

  describe('processSale', () => {
    it('calculates correct fee split with default rates', async () => {
      const createdTx = { id: 'tx-1' };
      prismaAny.$transaction.mockImplementation(async (cb: Function) => {
        return cb({
          kloelWallet: prismaAny.kloelWallet,
          kloelWalletTransaction: {
            create: jest.fn().mockResolvedValue(createdTx),
          },
        });
      });

      const result = await service.processSale('ws-1', 100, 'sale-1', 'Product X');

      expect(result.grossAmount).toBe(100);
      expect(result.gatewayFee).toBeCloseTo(2.99); // 2.99%
      expect(result.kloelFee).toBe(5); // 5%
      expect(result.netAmount).toBeCloseTo(92.01); // 100 - 2.99 - 5
      expect(result.transactionId).toBe('tx-1');
    });

    it('applies custom fee percentages', async () => {
      prismaAny.$transaction.mockImplementation(async (cb: Function) => {
        return cb({
          kloelWallet: prismaAny.kloelWallet,
          kloelWalletTransaction: {
            create: jest.fn().mockResolvedValue({ id: 'tx-2' }),
          },
        });
      });

      const result = await service.processSale('ws-1', 200, 'sale-2', 'Product Y', 10, 3);

      expect(result.kloelFee).toBe(20); // 10% of 200
      expect(result.gatewayFee).toBe(6); // 3% of 200
      expect(result.netAmount).toBe(174); // 200 - 20 - 6
    });
  });

  describe('confirmPayment (I10 — atomic ownership + status guard)', () => {
    /**
     * Helper — run the service with a tx client configured via `buildTxClient`.
     * The service invokes `prismaAny.$transaction(async (tx) => ...)`. We
     * simulate that by routing the callback through our fake tx client and
     * surfacing any thrown error as usual.
     */
    function mockTxWith(overrides: Parameters<typeof buildTxClient>[0]) {
      prismaAny.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTxClient(overrides);
        return cb(tx);
      });
      return prismaAny.$transaction;
    }

    it('returns false when the transaction does not exist', async () => {
      mockTxWith({ findUnique: jest.fn().mockResolvedValue(null) });

      const result = await service.confirmPayment('ws-1', 'bad-tx');

      expect(result).toBe(false);
    });

    it('returns false when the transaction is not pending (already completed)', async () => {
      mockTxWith({
        findUnique: jest.fn().mockResolvedValue({
          id: 'tx-1',
          walletId: 'wallet-1',
          status: 'completed',
          amount: 100,
          wallet: { id: 'wallet-1', workspaceId: 'ws-1' },
        }),
      });

      const result = await service.confirmPayment('ws-1', 'tx-1');

      expect(result).toBe(false);
    });

    it('throws ForbiddenException when caller is not the owning workspace (I10)', async () => {
      // Transaction belongs to ws-B's wallet; attacker tries from ws-A.
      mockTxWith({
        findUnique: jest.fn().mockResolvedValue({
          id: 'tx-victim',
          walletId: 'wallet-B',
          status: 'pending',
          amount: 500,
          wallet: { id: 'wallet-B', workspaceId: 'ws-B' },
        }),
      });
      const walletUpdate = jest.fn();
      prismaAny.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTxClient({
          findUnique: jest.fn().mockResolvedValue({
            id: 'tx-victim',
            walletId: 'wallet-B',
            status: 'pending',
            amount: 500,
            wallet: { id: 'wallet-B', workspaceId: 'ws-B' },
          }),
          update: walletUpdate,
        });
        return cb(tx);
      });

      await expect(service.confirmPayment('ws-A', 'tx-victim')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      // CRITICAL: no wallet may be mutated when ownership fails
      expect(walletUpdate).not.toHaveBeenCalled();
    });

    it('returns false on lost race: updateMany affected count is 0', async () => {
      // Another worker already flipped the status to 'completed' between our
      // read and our guarded updateMany. count=0 means nothing changed.
      const updateMany = jest.fn().mockResolvedValue({ count: 0 });
      const walletUpdate = jest.fn();
      prismaAny.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTxClient({ updateMany, update: walletUpdate });
        return cb(tx);
      });

      const result = await service.confirmPayment('ws-1', 'tx-1');

      expect(result).toBe(false);
      // CRITICAL: when the status guard loses, the balance must NOT move.
      expect(walletUpdate).not.toHaveBeenCalled();
    });

    it('moves amount from pending to available on success and guards the update by status', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const walletUpdate = jest.fn().mockResolvedValue({});
      prismaAny.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTxClient({ updateMany, update: walletUpdate });
        return cb(tx);
      });

      const result = await service.confirmPayment('ws-1', 'tx-1');

      expect(result).toBe(true);
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'tx-1', status: 'pending' },
        data: { status: 'completed' },
      });
      expect(walletUpdate).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: {
          pendingBalance: { decrement: 92.01 },
          availableBalance: { increment: 92.01 },
        },
      });
    });

    it('double-confirm is idempotent: second call is a no-op and does not double-credit', async () => {
      // First call: happy path (count=1).
      const firstUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      const firstWalletUpdate = jest.fn().mockResolvedValue({});
      prismaAny.$transaction.mockImplementationOnce(async (cb: any) => {
        const tx = buildTxClient({ updateMany: firstUpdateMany, update: firstWalletUpdate });
        return cb(tx);
      });
      expect(await service.confirmPayment('ws-1', 'tx-1')).toBe(true);

      // Second call: findUnique now sees status='completed'; caller returns
      // false without touching updateMany OR wallet update.
      const secondUpdateMany = jest.fn();
      const secondWalletUpdate = jest.fn();
      prismaAny.$transaction.mockImplementationOnce(async (cb: any) => {
        const tx = buildTxClient({
          findUnique: jest.fn().mockResolvedValue({
            id: 'tx-1',
            walletId: 'wallet-1',
            status: 'completed',
            amount: 92.01,
            wallet: { id: 'wallet-1', workspaceId: 'ws-1' },
          }),
          updateMany: secondUpdateMany,
          update: secondWalletUpdate,
        });
        return cb(tx);
      });
      expect(await service.confirmPayment('ws-1', 'tx-1')).toBe(false);
      expect(secondUpdateMany).not.toHaveBeenCalled();
      expect(secondWalletUpdate).not.toHaveBeenCalled();
    });

    it('rethrows unexpected DB errors instead of swallowing them (no silent false)', async () => {
      // Wave 1/Wave 2 invariant: DB errors must propagate so the caller (and
      // ops) can distinguish "not pending" from "DB unavailable".
      prismaAny.$transaction.mockRejectedValue(new Error('connection refused'));

      await expect(service.confirmPayment('ws-1', 'tx-1')).rejects.toThrow('connection refused');
    });
  });

  describe('requestWithdrawal', () => {
    it('rejects withdrawal when insufficient balance', async () => {
      // mockWallet has availableBalance: 1000
      const result = await service.requestWithdrawal('ws-1', 2000, {
        pixKey: '123',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Saldo insuficiente');
      expect(result.message).toContain('1000');
    });

    it('processes withdrawal when balance is sufficient', async () => {
      prismaAny.$transaction.mockImplementation(async (cb: Function) => {
        return cb({
          kloelWallet: prismaAny.kloelWallet,
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
  });

  describe('getTransactionHistory', () => {
    it('returns paginated transactions with total count', async () => {
      const txList = [
        { id: 'tx-1', amount: 100, type: 'credit' },
        { id: 'tx-2', amount: -50, type: 'withdrawal' },
      ];
      prismaAny.kloelWalletTransaction.findMany.mockResolvedValue(txList);
      prismaAny.kloelWalletTransaction.count.mockResolvedValue(25);

      const result = await service.getTransactionHistory('ws-1', 1, 20);

      expect(result.transactions).toHaveLength(2);
      expect(result.total).toBe(25);
    });

    it('filters by transaction type when provided', async () => {
      prismaAny.kloelWalletTransaction.findMany.mockResolvedValue([]);
      prismaAny.kloelWalletTransaction.count.mockResolvedValue(0);

      await service.getTransactionHistory('ws-1', 1, 20, 'withdrawal');

      const findManyCall = prismaAny.kloelWalletTransaction.findMany.mock.calls[0][0];
      expect(findManyCall.where.type).toBe('withdrawal');
    });
  });
});
