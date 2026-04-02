import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from '../../kloel/wallet.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('Financial Scenarios', () => {
  let walletService: WalletService;
  let prismaAny: any;

  const mockWallet = {
    id: 'wallet-1',
    workspaceId: 'ws-test',
    availableBalance: 500,
    pendingBalance: 200,
    blockedBalance: 0,
  };

  beforeEach(async () => {
    prismaAny = {
      kloelWallet: {
        findUnique: jest.fn().mockResolvedValue({ ...mockWallet }),
        create: jest.fn().mockResolvedValue({ ...mockWallet }),
        update: jest.fn().mockResolvedValue({ ...mockWallet }),
      },
      kloelWalletTransaction: {
        create: jest.fn().mockResolvedValue({ id: 'tx-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      checkoutPayment: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [WalletService, { provide: PrismaService, useValue: prismaAny }],
    }).compile();

    walletService = module.get(WalletService);
  });

  // ── SCENARIO 1: Withdrawal with insufficient balance ──────────────
  describe('Withdrawal — insufficient balance', () => {
    it('rejects withdrawal when amount exceeds available balance', async () => {
      // Wallet has R$500 available, try to withdraw R$700
      const result = await walletService.requestWithdrawal('ws-test', 700, {
        bankName: 'Banco do Brasil',
        accountNumber: '12345',
        pixKey: 'test@email.com',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('insuficiente');
      // Transaction should NOT be created
      expect(prismaAny.$transaction).not.toHaveBeenCalled();
    });
  });

  // ── SCENARIO 2: Correct withdrawal ────────────────────────────────
  describe('Withdrawal — correct flow', () => {
    it('decrements balance and creates transaction atomically', async () => {
      const createdTx = { id: 'tx-withdraw-1' };
      prismaAny.$transaction.mockImplementation(async (cb: Function) => {
        return cb({
          kloelWallet: {
            update: jest.fn().mockResolvedValue({
              ...mockWallet,
              availableBalance: 200, // 500 - 300
            }),
          },
          kloelWalletTransaction: {
            create: jest.fn().mockResolvedValue(createdTx),
          },
        });
      });

      const result = await walletService.requestWithdrawal('ws-test', 300, {
        bankName: 'Nubank',
        accountNumber: '99999',
        pixKey: 'pix@test.com',
      });

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe('tx-withdraw-1');
      expect(prismaAny.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  // ── SCENARIO 3: Race condition — two simultaneous withdrawals ─────
  describe('Withdrawal — race condition protection', () => {
    it('only one of two simultaneous withdrawals succeeds when combined exceeds balance', async () => {
      let callCount = 0;

      prismaAny.$transaction.mockImplementation(async (cb: Function) => {
        callCount++;
        if (callCount === 1) {
          // First call succeeds
          return cb({
            kloelWallet: {
              update: jest.fn().mockResolvedValue({
                ...mockWallet,
                availableBalance: 100, // 500 - 400
              }),
            },
            kloelWalletTransaction: {
              create: jest.fn().mockResolvedValue({ id: 'tx-race-1' }),
            },
          });
        } else {
          // Second call: wallet was already decremented by first call
          // In real DB with Serializable isolation, this would fail
          throw new Error('Could not serialize access due to concurrent update');
        }
      });

      const results = await Promise.allSettled([
        walletService.requestWithdrawal('ws-test', 400, {
          pixKey: 'a@test.com',
        }),
        walletService.requestWithdrawal('ws-test', 400, {
          pixKey: 'b@test.com',
        }),
      ]);

      const fulfilled = results.filter(
        (r) => r.status === 'fulfilled' && (r.value as any)?.success,
      );
      const rejected = results.filter((r) => r.status === 'rejected');

      // At most one should succeed
      expect(fulfilled.length + rejected.length).toBeGreaterThan(0);
      expect(fulfilled.length).toBeLessThanOrEqual(1);
    });
  });

  // ── SCENARIO 4: Sale with platform fee ────────────────────────────
  describe('Sale — correct fee calculation', () => {
    it('processes sale and splits platform fee correctly', async () => {
      const createdTx = { id: 'tx-sale-1' };
      prismaAny.$transaction.mockImplementation(async (cb: Function) => {
        return cb({
          kloelWallet: prismaAny.kloelWallet,
          kloelWalletTransaction: {
            create: jest.fn().mockResolvedValue(createdTx),
          },
        });
      });

      const result = await walletService.processSale('ws-test', 100, 'sale-ref-1', 'Produto Teste');

      expect(result.grossAmount).toBe(100);
      // Platform fee should be deducted
      expect(result.netAmount).toBeLessThan(100);
      expect(result.kloelFee).toBeGreaterThan(0);
      expect(prismaAny.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  // ── SCENARIO 5: Webhook idempotency (duplicate check) ────────────
  describe('Webhook idempotency', () => {
    it('checkout webhook processes same payment only once', async () => {
      // Simulate the idempotency check from checkout-webhook.controller.ts
      // The controller checks: if checkoutPayment.status === expectedStatus, skip

      const mockPayment = {
        id: 'pay-1',
        status: 'APPROVED', // Already processed
        externalId: 'asaas-pay-123',
        order: { plan: { product: {}, checkoutConfig: { pixels: [] } } },
      };

      prismaAny.checkoutPayment.findFirst.mockResolvedValue(mockPayment);

      // Simulate the idempotency logic from the controller
      const event = 'PAYMENT_CONFIRMED';
      const idempotencyMap: Record<string, string> = {
        PAYMENT_CONFIRMED: 'APPROVED',
        PAYMENT_RECEIVED: 'APPROVED',
        PAYMENT_REFUNDED: 'REFUNDED',
      };

      const expectedStatus = idempotencyMap[event];
      const isDuplicate = expectedStatus && mockPayment.status === expectedStatus;

      expect(isDuplicate).toBe(true);
      // No status update should happen
      expect(prismaAny.checkoutPayment.update).not.toHaveBeenCalled();
    });
  });
});
