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
        where: { id: 'wallet-1', updatedAt: mockWallet.updatedAt },
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
  });

  describe('confirmPayment (I10 — atomic ownership + status guard)', () => {
    /**
     * Helper — run the service with a tx client configured via `buildTxClient`.
     * The service invokes `prismaMock.$transaction(async (tx) => ...)`. We
     * simulate that by routing the callback through our fake tx client and
     * surfacing any thrown error as usual.
     */
    function mockTxWith(overrides: Parameters<typeof buildTxClient>[0]) {
      prismaMock.$transaction.mockImplementation(async (cb: WalletTxCallback) => {
        const tx = buildTxClient(overrides);
        return cb(tx);
      });
      return prismaMock.$transaction;
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
          amountInCents: BigInt(10000),
          wallet: { id: 'wallet-1', workspaceId: 'ws-1', updatedAt: mockWallet.updatedAt },
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
          amountInCents: BigInt(50000),
          wallet: { id: 'wallet-B', workspaceId: 'ws-B', updatedAt: new Date() },
        }),
      });
      const walletUpdate = jest.fn();
      prismaMock.$transaction.mockImplementation(async (cb: WalletTxCallback) => {
        const tx = buildTxClient({
          findUnique: jest.fn().mockResolvedValue({
            id: 'tx-victim',
            walletId: 'wallet-B',
            status: 'pending',
            amount: 500,
            amountInCents: BigInt(50000),
            wallet: { id: 'wallet-B', workspaceId: 'ws-B', updatedAt: new Date() },
          }),
          walletUpdateMany: walletUpdate,
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
      prismaMock.$transaction.mockImplementation(async (cb: WalletTxCallback) => {
        const tx = buildTxClient({ updateMany, walletUpdateMany: walletUpdate });
        return cb(tx);
      });

      const result = await service.confirmPayment('ws-1', 'tx-1');

      expect(result).toBe(false);
      // CRITICAL: when the status guard loses, the balance must NOT move.
      expect(walletUpdate).not.toHaveBeenCalled();
    });

    it('moves amount from pending to available on success and guards the update by status', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const walletUpdate = jest.fn().mockResolvedValue({ count: 1 });
      prismaMock.$transaction.mockImplementation(async (cb: WalletTxCallback) => {
        const tx = buildTxClient({ updateMany, walletUpdateMany: walletUpdate });
        return cb(tx);
      });

      const result = await service.confirmPayment('ws-1', 'tx-1');

      expect(result).toBe(true);
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'tx-1', status: 'pending' },
        data: { status: 'completed' },
      });
      expect(walletUpdate).toHaveBeenCalledWith({
        where: { id: 'wallet-1', updatedAt: mockWallet.updatedAt },
        data: {
          pendingBalance: { decrement: 92.01 },
          availableBalance: { increment: 92.01 },
          pendingBalanceInCents: { decrement: BigInt(9201) },
          availableBalanceInCents: { increment: BigInt(9201) },
        },
      });
    });

    it('double-confirm is idempotent: second call is a no-op and does not double-credit', async () => {
      // First call: happy path (count=1).
      const firstUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      const firstWalletUpdate = jest.fn().mockResolvedValue({ count: 1 });
      prismaMock.$transaction.mockImplementationOnce(async (cb: WalletTxCallback) => {
        const tx = buildTxClient({
          updateMany: firstUpdateMany,
          walletUpdateMany: firstWalletUpdate,
        });
        return cb(tx);
      });
      expect(await service.confirmPayment('ws-1', 'tx-1')).toBe(true);

      // Second call: findUnique now sees status='completed'; caller returns
      // false without touching updateMany OR wallet update.
      const secondUpdateMany = jest.fn();
      const secondWalletUpdate = jest.fn();
      prismaMock.$transaction.mockImplementationOnce(async (cb: WalletTxCallback) => {
        const tx = buildTxClient({
          findUnique: jest.fn().mockResolvedValue({
            id: 'tx-1',
            walletId: 'wallet-1',
            status: 'completed',
            amount: 92.01,
            amountInCents: BigInt(9201),
            wallet: { id: 'wallet-1', workspaceId: 'ws-1', updatedAt: mockWallet.updatedAt },
          }),
          updateMany: secondUpdateMany,
          walletUpdateMany: secondWalletUpdate,
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
      prismaMock.$transaction.mockRejectedValue(new Error('connection refused'));

      await expect(service.confirmPayment('ws-1', 'tx-1')).rejects.toThrow('connection refused');
    });

    it('appends BOTH a debit-on-pending and a credit-on-available ledger entry on success (I12)', async () => {
      mockTxWith({});
      await service.confirmPayment('ws-1', 'tx-1');

      // Two ledger calls inside the same $transaction:
      //   1) debit pending  (the move-out)
      //   2) credit available (the move-in)
      expect(walletLedger.appendWithinTx).toHaveBeenCalledTimes(2);
      const debit = walletLedger.appendWithinTx.mock.calls[0][1];
      const credit = walletLedger.appendWithinTx.mock.calls[1][1];

      expect(debit.direction).toBe('debit');
      expect(debit.bucket).toBe('pending');
      expect(debit.amountInCents).toBe(BigInt(9201));
      expect(debit.reason).toBe('confirm_payment_debit');

      expect(credit.direction).toBe('credit');
      expect(credit.bucket).toBe('available');
      expect(credit.amountInCents).toBe(BigInt(9201));
      expect(credit.reason).toBe('confirm_payment_credit');

      // Both share the same workspace, wallet, and transaction id.
      expect(debit.workspaceId).toBe('ws-1');
      expect(credit.workspaceId).toBe('ws-1');
      expect(debit.walletId).toBe('wallet-1');
      expect(credit.walletId).toBe('wallet-1');
      expect(debit.transactionId).toBe('tx-1');
      expect(credit.transactionId).toBe('tx-1');
    });

    it('does NOT append any ledger entry on a lost race (no double-credit) (I12)', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 0 });
      prismaMock.$transaction.mockImplementation(async (cb: WalletTxCallback) => {
        const tx = buildTxClient({ updateMany });
        return cb(tx);
      });

      const result = await service.confirmPayment('ws-1', 'tx-1');

      expect(result).toBe(false);
      expect(walletLedger.appendWithinTx).not.toHaveBeenCalled();
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
      expect(findManyCall.where.type).toBe('withdrawal');
    });
  });
});
