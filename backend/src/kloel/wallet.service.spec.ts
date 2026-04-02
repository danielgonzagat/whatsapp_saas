import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';

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
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [WalletService, { provide: PrismaService, useValue: prismaAny }],
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

  describe('confirmPayment', () => {
    it('returns false when transaction not found', async () => {
      prismaAny.kloelWalletTransaction.findUnique.mockResolvedValue(null);

      const result = await service.confirmPayment('ws-1', 'bad-tx');

      expect(result).toBe(false);
    });

    it('returns false when transaction is not pending', async () => {
      prismaAny.kloelWalletTransaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        status: 'completed',
        amount: 100,
      });

      const result = await service.confirmPayment('ws-1', 'tx-1');

      expect(result).toBe(false);
    });

    it('moves amount from pending to available on success', async () => {
      prismaAny.kloelWalletTransaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        status: 'pending',
        amount: 92.01,
      });
      prismaAny.$transaction.mockResolvedValue(undefined);

      const result = await service.confirmPayment('ws-1', 'tx-1');

      expect(result).toBe(true);
      // Verify the batch transaction was called with wallet update + tx update
      expect(prismaAny.$transaction).toHaveBeenCalled();
    });

    it('returns false on unexpected error', async () => {
      prismaAny.kloelWalletTransaction.findUnique.mockRejectedValue(new Error('DB down'));

      const result = await service.confirmPayment('ws-1', 'tx-1');

      expect(result).toBe(false);
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
