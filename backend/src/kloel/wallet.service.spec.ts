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

  describe('requestAnticipation', () => {
    const mockAnticipationWallet = {
      id: 'wallet-1',
      workspaceId: 'ws-1',
      availableBalance: 1000,
      pendingBalance: 2000,
      blockedBalance: 100,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    beforeEach(() => {
      prismaMock.kloelWallet.findUnique.mockResolvedValue(mockAnticipationWallet);
      prismaMock.kloelWallet.updateMany.mockResolvedValue({ count: 1 });
    });

    it('moves amount from pending to available minus fee, creates anticipation record and ledger entries', async () => {
      const txCreate = jest.fn().mockResolvedValue({ id: 'tx-anticipation-1' });
      const anticipationCreate = jest.fn().mockResolvedValue({ id: 'ant-1' });
      prismaMock.$transaction.mockImplementation(async (cb: Function) => {
        return cb({
          kloelWallet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          kloelWalletTransaction: { create: txCreate },
          walletAnticipation: { create: anticipationCreate },
        });
      });

      const result = await service.requestAnticipation('ws-1', 1000);

      expect(result.success).toBe(true);
      expect(result.originalAmount).toBe(1000);
      expect(result.feePercent).toBe(3.0);
      expect(result.feeAmount).toBe(30);
      expect(result.netAmount).toBe(970);
      expect(result.transactionId).toBe('tx-anticipation-1');

      // Ledger entries: debit pending (full amount), credit available (net).
      expect(walletLedger.appendWithinTx).toHaveBeenCalledTimes(2);
      const debitCall = walletLedger.appendWithinTx.mock.calls[0][1];
      expect(debitCall.direction).toBe('debit');
      expect(debitCall.bucket).toBe('pending');
      expect(debitCall.amountInCents).toBe(BigInt(100000));
      const creditCall = walletLedger.appendWithinTx.mock.calls[1][1];
      expect(creditCall.direction).toBe('credit');
      expect(creditCall.bucket).toBe('available');
      // net = 1000 - 30 = 970 => 97000 cents
      expect(creditCall.amountInCents).toBe(BigInt(97000));

      // Anticipation record persisted.
      expect(anticipationCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          originalAmount: 1000,
          feePercent: 3.0,
          feeAmount: 30,
          netAmount: 970,
          status: 'COMPLETED',
          transactionId: 'tx-anticipation-1',
        }),
      });
    });

    it('rejects invalid amount (zero, negative, non-finite)', async () => {
      await expect(service.requestAnticipation('ws-1', 0)).resolves.toEqual({
        success: false,
        message: 'Valor de antecipação inválido.',
      });
      await expect(service.requestAnticipation('ws-1', -50)).resolves.toEqual({
        success: false,
        message: 'Valor de antecipação inválido.',
      });
      await expect(service.requestAnticipation('ws-1', NaN)).resolves.toEqual({
        success: false,
        message: 'Valor de antecipação inválido.',
      });
    });

    it('rejects when pending balance is insufficient', async () => {
      prismaMock.kloelWallet.findUnique.mockResolvedValue({
        ...mockAnticipationWallet,
        pendingBalance: 100,
      });

      const result = await service.requestAnticipation('ws-1', 500);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Saldo pendente insuficiente');
    });

    it('dual-writes Float + BigInt cents to wallet (I11)', async () => {
      const walletUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      prismaMock.$transaction.mockImplementation(async (cb: Function) => {
        return cb({
          kloelWallet: { updateMany: walletUpdateMany },
          kloelWalletTransaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
          walletAnticipation: { create: jest.fn().mockResolvedValue({ id: 'ant-1' }) },
        });
      });

      await service.requestAnticipation('ws-1', 500);

      // 3% fee on 500 = 15, net = 485
      expect(walletUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            pendingBalance: { decrement: 500 },
            availableBalance: { increment: 485 },
            pendingBalanceInCents: { decrement: BigInt(50000) },
            availableBalanceInCents: { increment: BigInt(48500) },
          },
        }),
      );
    });

    it('uses custom fee percent', async () => {
      prismaMock.$transaction.mockImplementation(async (cb: Function) => {
        return cb({
          kloelWallet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          kloelWalletTransaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
          walletAnticipation: { create: jest.fn().mockResolvedValue({ id: 'ant-1' }) },
        });
      });

      const result = await service.requestAnticipation('ws-1', 1000, undefined, 5.0);

      expect(result.feePercent).toBe(5.0);
      expect(result.feeAmount).toBe(50);
      expect(result.netAmount).toBe(950);
    });

    it('accepts installments parameter', async () => {
      const anticipationCreate = jest.fn().mockResolvedValue({ id: 'ant-1' });
      prismaMock.$transaction.mockImplementation(async (cb: Function) => {
        return cb({
          kloelWallet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          kloelWalletTransaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
          walletAnticipation: { create: anticipationCreate },
        });
      });

      const result = await service.requestAnticipation('ws-1', 1000, 3);

      expect(result.success).toBe(true);
      expect(anticipationCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ installments: 3 }),
      });
    });

    it('throws when wallet is not found', async () => {
      prismaMock.kloelWallet.findUnique.mockResolvedValue(null);

      await expect(service.requestAnticipation('ws-missing', 500)).rejects.toThrow(
        'KloelWallet not found',
      );
    });

    it('throws ConcurrentWalletUpdateError when optimistic lock fails', async () => {
      prismaMock.$transaction.mockImplementation(async (cb: Function) => {
        return cb({
          kloelWallet: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
          kloelWalletTransaction: { create: jest.fn() },
          walletAnticipation: { create: jest.fn() },
        });
      });

      await expect(service.requestAnticipation('ws-1', 500)).rejects.toThrow(
        'KloelWallet modified concurrently',
      );
    });

    it('cross-tenant isolation: updateMany where scoped to workspaceId', async () => {
      const walletUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      prismaMock.$transaction.mockImplementation(async (cb: Function) => {
        return cb({
          kloelWallet: { updateMany: walletUpdateMany },
          kloelWalletTransaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
          walletAnticipation: { create: jest.fn().mockResolvedValue({ id: 'ant-1' }) },
        });
      });

      await service.requestAnticipation('ws-1', 500);

      expect(walletUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-1' }),
        }),
      );
    });
  });
});
