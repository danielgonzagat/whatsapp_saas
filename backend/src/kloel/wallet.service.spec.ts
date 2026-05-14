import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialAlertService } from '../common/financial-alert.service';
import { WalletLedgerService } from './wallet-ledger.service';

type WalletTxClient = ReturnType<typeof buildTxClient>;
type WalletTxCallback = (tx: WalletTxClient) => Promise<unknown>;
type WalletPrismaMock = {
  kloelWallet: {
    upsert: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  kloelWalletTransaction: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  auditLog: {
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};

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
  let prismaMock: WalletPrismaMock;
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
    prismaMock = {
      kloelWallet: {
        upsert: jest.fn().mockResolvedValue(mockWallet),
        findUnique: jest.fn().mockResolvedValue(mockWallet),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      const newWallet = {
        ...mockWallet,
        availableBalance: 0,
        pendingBalance: 0,
        blockedBalance: 0,
      };
      prismaMock.kloelWallet.upsert.mockResolvedValue(newWallet);

      const balance = await service.getBalance('ws-1');

      expect(prismaMock.kloelWallet.upsert).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        update: {},
        create: {
          workspaceId: 'ws-1',
          availableBalance: 0,
          pendingBalance: 0,
          blockedBalance: 0,
        },
      });
      expect(balance.total).toBe(0);
    });
  });

  describe('processSale', () => {
    it('calculates correct fee split with default rates', async () => {
      const createdTx = { id: 'tx-1' };
      prismaMock.$transaction.mockImplementation(async (cb: Function) => {
        return cb({
          kloelWallet: prismaMock.kloelWallet,
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

    it('dual-writes Float + BigInt cents to both wallet and transaction (I11)', async () => {
      const walletUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      const txCreate = jest.fn().mockResolvedValue({ id: 'tx-1' });
      prismaMock.$transaction.mockImplementation(async (cb: Function) => {
        return cb({
          kloelWallet: { updateMany: walletUpdateMany },
          kloelWalletTransaction: { create: txCreate },
        });
      });

      await service.processSale('ws-1', 100, 'sale-1', 'Product X');

      // Wallet update must include both the legacy Float column and the
      // new BigInt cents column. Integer cents arithmetic: 100 - 2.99 -
      // 5 = 92.01 => 9201 cents.
      expect(walletUpdateMany).toHaveBeenCalledWith({
        where: { id: 'wallet-1', workspaceId: 'ws-1', updatedAt: mockWallet.updatedAt },
        data: {
          pendingBalance: { increment: 92.01 },
          pendingBalanceInCents: { increment: BigInt(9201) },
        },
      });

      // Transaction create must carry both amount and amountInCents.
      const createCall = txCreate.mock.calls[0][0];
      expect(createCall.data.amount).toBe(92.01);
      expect(createCall.data.amountInCents).toBe(BigInt(9201));
      // Metadata also carries the integer-cent receipts for audit.
      expect(createCall.data.metadata.grossAmountInCents).toBe(10000);
      expect(createCall.data.metadata.gatewayFeeInCents).toBe(299);
      expect(createCall.data.metadata.kloelFeeInCents).toBe(500);
      expect(createCall.data.metadata.netAmountInCents).toBe(9201);
    });

    it('appends a single ledger entry for the credit, inside the same tx (I12)', async () => {
      const txCreate = jest.fn().mockResolvedValue({ id: 'tx-ledger-1' });
      prismaMock.$transaction.mockImplementation(async (cb: Function) => {
        return cb({
          kloelWallet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          kloelWalletTransaction: { create: txCreate },
        });
      });

      await service.processSale('ws-1', 50, 'sale-ledger', 'Product L');

      expect(walletLedger.appendWithinTx).toHaveBeenCalledTimes(1);
      const appendCall = walletLedger.appendWithinTx.mock.calls[0][1];
      expect(appendCall.workspaceId).toBe('ws-1');
      expect(appendCall.walletId).toBe('wallet-1');
      expect(appendCall.transactionId).toBe('tx-ledger-1');
      expect(appendCall.direction).toBe('credit');
      expect(appendCall.bucket).toBe('pending');
      // 50 - 1.495(2.99%) - 2.5(5%) = 46.005 → rounded math:
      //   gross 5000c, gatewayFee 150c, kloelFee 250c, net 4600c
      expect(appendCall.amountInCents).toBe(BigInt(4600));
      expect(appendCall.reason).toBe('sale_credit');
    });

    it('rejects a negative or non-integer-cent saleAmount', async () => {
      await expect(service.processSale('ws-1', -50, 'sale-x', 'Bad')).rejects.toThrow(
        /Invalid saleAmount/,
      );
    });

    it('applies custom fee percentages', async () => {
      prismaMock.$transaction.mockImplementation(async (cb: Function) => {
        return cb({
          kloelWallet: prismaMock.kloelWallet,
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

    it('rejects cross-tenant sale: workspaceId in updateMany where ensures wallet-B is never credited by ws-A call', async () => {
      const walletUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      prismaMock.$transaction.mockImplementation(async (cb: Function) => {
        return cb({
          kloelWallet: { updateMany: walletUpdateMany },
          kloelWalletTransaction: {
            create: jest.fn().mockResolvedValue({ id: 'tx-1' }),
          },
        });
      });

      await service.processSale('ws-1', 100, 'sale-1', 'Product X');

      expect(walletUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-1' }),
        }),
      );
    });
  });
});
