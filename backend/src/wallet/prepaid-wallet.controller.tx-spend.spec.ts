jest.mock('@nestjs/throttler', () => {
  const actual = jest.requireActual<typeof import('@nestjs/throttler')>('@nestjs/throttler');
  return {
    ...actual,
    ThrottlerGuard: class SpecThrottlerGuard {
      canActivate() {
        return true;
      }
    },
  };
});

import type { PrepaidWalletTransaction } from '@prisma/client';

import {
  type PrepaidWalletSpecDeps,
  type StripeStub,
  buildModule,
  makePrismaStub,
  makeStripeStub,
  seedWallet,
} from './__test-support__/prepaid-wallet.controller.spec-helpers';

describe('PrepaidWalletController — transactions, auto-recharge & spend', () => {
  let stripe: StripeStub;
  let deps: PrepaidWalletSpecDeps;

  beforeEach(async () => {
    stripe = makeStripeStub();
    const factory = makePrismaStub();
    deps = await buildModule(stripe, factory);
  });

  describe('getTransactions', () => {
    it('returns empty list when wallet does not exist', async () => {
      const result = await deps.controller.getTransactions('ws_nonexistent');
      expect(result.transactions).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns transactions for a wallet', async () => {
      const wallet = seedWallet({ id: 'pwl_tx', workspaceId: 'ws_tx', balanceCents: 1_000n });
      deps.factory.workspaceMap.set('ws_tx', wallet);
      deps.factory.walletMap.set('pwl_tx', wallet);

      (deps.factory.stub.prepaidWalletTransaction.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'tx_1',
          type: 'TOPUP',
          amountCents: 5_000n,
          balanceAfterCents: 5_000n,
          referenceType: 'stripe_topup',
          referenceId: 'pi_1',
          metadata: {},
          createdAt: new Date(),
        },
        {
          id: 'tx_2',
          type: 'USAGE',
          amountCents: -1_000n,
          balanceAfterCents: 4_000n,
          referenceType: 'usage:kb_ingestion',
          referenceId: 'req_1',
          metadata: {},
          createdAt: new Date(),
        },
      ] as PrepaidWalletTransaction[]);
      (deps.factory.stub.prepaidWalletTransaction.count as jest.Mock).mockResolvedValueOnce(2);

      const result = await deps.controller.getTransactions('ws_tx');
      expect(result.total).toBe(2);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].type).toBe('TOPUP');
    });

    it('ensures workspace isolation in transaction queries', async () => {
      const walletA = seedWallet({ id: 'pwl_a', workspaceId: 'ws_a' });
      const walletB = seedWallet({ id: 'pwl_b', workspaceId: 'ws_b' });
      deps.factory.workspaceMap.set('ws_a', walletA);
      deps.factory.workspaceMap.set('ws_b', walletB);
      deps.factory.walletMap.set('pwl_a', walletA);
      deps.factory.walletMap.set('pwl_b', walletB);

      (deps.factory.stub.prepaidWalletTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (deps.factory.stub.prepaidWalletTransaction.count as jest.Mock).mockResolvedValueOnce(0);

      const _result = await deps.controller.getTransactions('ws_a');

      const findCall = (deps.factory.stub.prepaidWalletTransaction.findMany as jest.Mock).mock
        .calls[0]?.[0];
      expect(findCall.where.walletId).toBe('pwl_a');
    });
  });

  describe('configureAutoRecharge', () => {
    it('enables auto-recharge with valid threshold and amount', async () => {
      const result = await deps.controller.configureAutoRecharge('ws_ar', {
        enabled: true,
        thresholdCents: 1_000,
        amountCents: 5_000,
      });

      expect(result.autoRechargeEnabled).toBe(true);
      expect(result.autoRechargeThresholdCents).toBe('1000');
      expect(result.autoRechargeAmountCents).toBe('5000');
    });

    it('rejects auto-recharge enable with zero threshold', async () => {
      await expect(
        deps.controller.configureAutoRecharge('ws_ar', {
          enabled: true,
          thresholdCents: 0,
          amountCents: 5_000,
        }),
      ).rejects.toThrow(/thresholdCents must be greater than 0/);
    });

    it('rejects auto-recharge enable with zero amount', async () => {
      await expect(
        deps.controller.configureAutoRecharge('ws_ar', {
          enabled: true,
          thresholdCents: 1_000,
          amountCents: 0,
        }),
      ).rejects.toThrow(/amountCents must be greater than 0/);
    });

    it('disables auto-recharge', async () => {
      const result = await deps.controller.configureAutoRecharge('ws_ar', {
        enabled: false,
      });

      expect(result.autoRechargeEnabled).toBe(false);
      expect(result.autoRechargeThresholdCents).toBeNull();
      expect(result.autoRechargeAmountCents).toBeNull();
    });

    it('workspace isolation: auto-recharge config affects only target workspace', async () => {
      const walletA = seedWallet({ id: 'pwl_a', workspaceId: 'ws_a' });
      deps.factory.workspaceMap.set('ws_a', walletA);
      deps.factory.walletMap.set('pwl_a', walletA);

      await deps.controller.configureAutoRecharge('ws_a', {
        enabled: true,
        thresholdCents: 1_000,
        amountCents: 5_000,
      });

      const walletBResult = await deps.controller.getBalance('ws_b');
      expect(walletBResult.autoRechargeEnabled).toBe(false);
    });
  });

  describe('spend', () => {
    it('charges usage and returns new balance', async () => {
      const wallet = seedWallet({ id: 'pwl_sp', workspaceId: 'ws_sp', balanceCents: 10_000n });
      deps.factory.workspaceMap.set('ws_sp', wallet);
      deps.factory.walletMap.set('pwl_sp', wallet);

      const result = await deps.controller.spend('ws_sp', {
        operation: 'kb_ingestion',
        quotedCostCents: 1_500,
        requestId: 'req_sp_1',
      });

      expect(result.success).toBe(true);
      expect(result.costCents).toBe('1500');
      expect(result.transactionId).toBeTruthy();
    });

    it('returns insufficient_balance when wallet is too low', async () => {
      const wallet = seedWallet({ id: 'pwl_low', workspaceId: 'ws_low', balanceCents: 100n });
      deps.factory.workspaceMap.set('ws_low', wallet);
      deps.factory.walletMap.set('pwl_low', wallet);

      const result = await deps.controller.spend('ws_low', {
        operation: 'kb_ingestion',
        quotedCostCents: 1_500,
        requestId: 'req_low',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('insufficient_balance');
      expect(result.currentBalanceCents).toBe('100');
      expect(result.requestedCents).toBe('1500');
    });

    it('is idempotent on requestId (duplicate spend returns same result)', async () => {
      const wallet = seedWallet({ id: 'pwl_idem', workspaceId: 'ws_idem', balanceCents: 10_000n });
      deps.factory.workspaceMap.set('ws_idem', wallet);
      deps.factory.walletMap.set('pwl_idem', wallet);

      await deps.controller.spend('ws_idem', {
        operation: 'site_generation',
        quotedCostCents: 500,
        requestId: 'req_dup',
      });

      const result2 = await deps.controller.spend('ws_idem', {
        operation: 'site_generation',
        quotedCostCents: 500,
        requestId: 'req_dup',
      });

      expect(result2.success).toBe(true);
    });

    it('workspace isolation: spend on ws_a does not affect ws_b balance', async () => {
      const walletA = seedWallet({ id: 'pwl_a', workspaceId: 'ws_a', balanceCents: 10_000n });
      const walletB = seedWallet({ id: 'pwl_b', workspaceId: 'ws_b', balanceCents: 10_000n });
      deps.factory.workspaceMap.set('ws_a', walletA);
      deps.factory.workspaceMap.set('ws_b', walletB);
      deps.factory.walletMap.set('pwl_a', walletA);
      deps.factory.walletMap.set('pwl_b', walletB);

      await deps.controller.spend('ws_a', {
        operation: 'kb_ingestion',
        quotedCostCents: 5_000,
        requestId: 'req_iso_a',
      });

      const balanceB = await deps.controller.getBalance('ws_b');
      expect(balanceB.balanceCents).toBe('10000');
    });
  });
});
