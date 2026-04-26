import { Test, type TestingModule } from '@nestjs/testing';
import type { PrepaidWallet, PrepaidWalletTransaction, PrepaidWalletTxType } from '@prisma/client';

import { StripeService } from '../billing/stripe.service';
import { FraudEngine } from '../payments/fraud/fraud.engine';
import { PrismaService } from '../prisma/prisma.service';

import { PrepaidWalletController } from './prepaid-wallet.controller';
import { WalletService } from './wallet.service';

type StripeStub = {
  stripe: { paymentIntents: { create: jest.Mock } };
};

type FraudEngineStub = {
  evaluate: jest.Mock;
};

function makeStripeStub(): StripeStub {
  return { stripe: { paymentIntents: { create: jest.fn() } } };
}

function makeFraudEngineStub(): FraudEngineStub {
  return {
    evaluate: jest.fn().mockResolvedValue({ action: 'allow', score: 0, reasons: [] }),
  };
}

function makePrismaStub(wallets: PrepaidWallet[] = []) {
  const walletMap = new Map<string, PrepaidWallet>(wallets.map((w) => [w.id, w]));
  const workspaceMap = new Map<string, PrepaidWallet>(wallets.map((w) => [w.workspaceId, w]));
  const transactions: PrepaidWalletTransaction[] = [];
  let nextWalletId = wallets.length + 1;
  let nextTxId = 1;

  const stub = {
    prepaidWallet: {
      findUnique: jest.fn(async ({ where }: { where: { id?: string; workspaceId?: string } }) => {
        if (where.id) return walletMap.get(where.id) ?? null;
        if (where.workspaceId) return workspaceMap.get(where.workspaceId) ?? null;
        return null;
      }),
      findFirst: jest.fn(async ({ where }: { where: { id?: string; workspaceId?: string } }) => {
        if (where.id) return walletMap.get(where.id) ?? null;
        if (where.workspaceId) return workspaceMap.get(where.workspaceId) ?? null;
        return null;
      }),
      upsert: jest.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { workspaceId: string };
          create: { workspaceId: string };
          update: Record<string, unknown>;
        }) => {
          const existing = workspaceMap.get(where.workspaceId);
          if (existing) {
            const merged = { ...existing, ...update, updatedAt: new Date() } as PrepaidWallet;
            walletMap.set(merged.id, merged);
            workspaceMap.set(merged.workspaceId, merged);
            return merged;
          }
          const row = {
            id: `pwl_${nextWalletId++}`,
            workspaceId: create.workspaceId,
            balanceCents: 0n,
            currency: 'BRL',
            autoRechargeEnabled: false,
            autoRechargeThresholdCents: null,
            autoRechargeAmountCents: null,
            defaultPaymentMethodId: null,
            stripeCustomerId: null,
            pendingAutoRechargePaymentIntentId: null,
            pendingAutoRechargeStartedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...create,
          } as PrepaidWallet;
          walletMap.set(row.id, row);
          workspaceMap.set(row.workspaceId, row);
          return row;
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; workspaceId?: string };
          data: Partial<PrepaidWallet>;
        }) => {
          const current = walletMap.get(where.id);
          if (!current) return { count: 0 };
          const next = { ...current, ...data, updatedAt: new Date() } as PrepaidWallet;
          walletMap.set(where.id, next);
          workspaceMap.set(next.workspaceId, next);
          return { count: 1 };
        },
      ),
    },
    prepaidWalletTransaction: {
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: { referenceType: string; referenceId: string; type: PrepaidWalletTxType };
        }) =>
          transactions.find(
            (t) =>
              t.referenceType === where.referenceType &&
              t.referenceId === where.referenceId &&
              t.type === where.type,
          ) ?? null,
      ),
      findMany: jest.fn(async () => transactions.slice().reverse()),
      count: jest.fn(async () => transactions.length),
      create: jest.fn(
        async ({ data }: { data: Omit<PrepaidWalletTransaction, 'id' | 'createdAt'> }) => {
          const row = {
            id: `pwt_${nextTxId++}`,
            createdAt: new Date(),
            ...data,
          } as PrepaidWalletTransaction;
          transactions.push(row);
          return row;
        },
      ),
    },
    $transaction: jest.fn(),
  };

  stub.$transaction.mockImplementation(
    async <T>(callback: (tx: typeof stub) => Promise<T>): Promise<T> => callback(stub),
  );

  return { walletMap, workspaceMap, transactions, stub, prisma: stub as unknown as PrismaService };
}

const seedWallet = (overrides: Partial<PrepaidWallet> = {}): PrepaidWallet =>
  ({
    id: overrides.id ?? 'pwl_seed',
    workspaceId: overrides.workspaceId ?? 'ws_1',
    balanceCents: overrides.balanceCents ?? 0n,
    currency: overrides.currency ?? 'BRL',
    autoRechargeEnabled: overrides.autoRechargeEnabled ?? false,
    autoRechargeThresholdCents: overrides.autoRechargeThresholdCents ?? null,
    autoRechargeAmountCents: overrides.autoRechargeAmountCents ?? null,
    defaultPaymentMethodId: null,
    stripeCustomerId: null,
    pendingAutoRechargePaymentIntentId: null,
    pendingAutoRechargeStartedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as PrepaidWallet;

async function buildModule(
  stripe: StripeStub,
  factory: ReturnType<typeof makePrismaStub>,
  fraudEngine = makeFraudEngineStub(),
) {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [PrepaidWalletController],
    providers: [
      WalletService,
      { provide: StripeService, useValue: stripe },
      { provide: PrismaService, useValue: factory.prisma },
      { provide: FraudEngine, useValue: fraudEngine },
    ],
  }).compile();
  return {
    controller: moduleRef.get<PrepaidWalletController>(PrepaidWalletController),
    service: moduleRef.get<WalletService>(WalletService),
    factory,
  };
}

describe('PrepaidWalletController', () => {
  let stripe: StripeStub;
  let deps: {
    controller: PrepaidWalletController;
    service: WalletService;
    factory: ReturnType<typeof makePrismaStub>;
  };

  beforeEach(async () => {
    stripe = makeStripeStub();
    const factory = makePrismaStub();
    deps = await buildModule(stripe, factory);
  });

  // ── getBalance ──

  describe('getBalance', () => {
    it('returns zero balance for a workspace without a wallet', async () => {
      const result = await deps.controller.getBalance('ws_nonexistent');
      expect(result.balanceCents).toBe('0');
      expect(result.currency).toBe('BRL');
      expect(result.autoRechargeEnabled).toBe(false);
    });

    it('returns the current balance for a workspace with a wallet', async () => {
      const wallet = seedWallet({ id: 'pwl_a', workspaceId: 'ws_a', balanceCents: 15_000n });
      deps.factory.workspaceMap.set('ws_a', wallet);
      deps.factory.walletMap.set('pwl_a', wallet);

      const result = await deps.controller.getBalance('ws_a');
      expect(result.balanceCents).toBe('15000');
      expect(result.walletId).toBe('pwl_a');
    });

    it('exposes auto-recharge config when enabled', async () => {
      const wallet = seedWallet({
        id: 'pwl_ar',
        workspaceId: 'ws_ar',
        balanceCents: 500n,
        autoRechargeEnabled: true,
        autoRechargeThresholdCents: 1_000n,
        autoRechargeAmountCents: 5_000n,
      });
      deps.factory.workspaceMap.set('ws_ar', wallet);
      deps.factory.walletMap.set('pwl_ar', wallet);

      const result = await deps.controller.getBalance('ws_ar');
      expect(result.autoRechargeEnabled).toBe(true);
      expect(result.autoRechargeThresholdCents).toBe('1000');
      expect(result.autoRechargeAmountCents).toBe('5000');
    });

    it('ensures workspace isolation by returning empty wallet for unrelated workspace', async () => {
      const walletA = seedWallet({ id: 'pwl_a', workspaceId: 'ws_a', balanceCents: 100n });
      deps.factory.workspaceMap.set('ws_a', walletA);
      deps.factory.walletMap.set('pwl_a', walletA);

      const result = await deps.controller.getBalance('ws_b');
      expect(result.balanceCents).toBe('0');
    });
  });

  // ── createTopup ──

  describe('createTopup', () => {
    it('creates a PIX top-up intent and returns client-secret', async () => {
      stripe.stripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_pix_1',
        client_secret: 'secret_pix',
        amount: 5_000,
        next_action: {
          type: 'pix_display_qr_code',
          pix_display_qr_code: { data: 'pix_qr_data', image_url_png: 'https://img.png' },
        },
      });

      const result = await deps.controller.createTopup('ws_1', {
        amountCents: 5_000,
        method: 'pix',
      });

      expect(result.paymentIntentId).toBe('pi_pix_1');
      expect(result.clientSecret).toBe('secret_pix');
      expect(result.pixQrCode).toBe('pix_qr_data');
    });

    it('creates a card top-up intent', async () => {
      stripe.stripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_card_1',
        client_secret: 'secret_card',
        amount: 10_000,
        next_action: null,
      });

      const result = await deps.controller.createTopup('ws_2', {
        amountCents: 10_000,
        method: 'card',
        buyerEmail: 'buyer@test.com',
      });

      expect(result.paymentIntentId).toBe('pi_card_1');
      expect(stripe.stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_method_types: ['card'],
          metadata: expect.objectContaining({ workspace_id: 'ws_2', method: 'card' }),
        }),
      );
    });

    it('rejects zero or negative amountCents', async () => {
      await expect(
        deps.controller.createTopup('ws_1', { amountCents: 0, method: 'pix' }),
      ).rejects.toThrow(/must be greater than 0/);

      await expect(
        deps.controller.createTopup('ws_1', { amountCents: -100, method: 'pix' }),
      ).rejects.toThrow(/must be greater than 0/);
    });

    it('blocks PIX top-up when FraudEngine returns review', async () => {
      const fraudEngine = makeFraudEngineStub();
      fraudEngine.evaluate.mockResolvedValueOnce({
        action: 'block',
        score: 1,
        reasons: [{ signal: 'blacklist', detail: 'email' }],
      });
      const prisma = makePrismaStub();
      const ctx = await buildModule(stripe, prisma, fraudEngine);

      await expect(
        ctx.controller.createTopup('ws_blocked', {
          amountCents: 10_000,
          method: 'pix',
          buyerEmail: 'bad@test.com',
        }),
      ).rejects.toThrow(/antifraude/);
    });
  });

  // ── getTransactions ──

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

  // ── configureAutoRecharge ──

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

  // ── spend ──

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

  // ── Full prepaid lifecycle (integration) ──

  describe('full prepaid lifecycle', () => {
    it('topup → spend → spend → check balance (complete flow)', async () => {
      stripe.stripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_lifecycle',
        client_secret: 'secret_lifecycle',
        amount: 10_000,
        next_action: null,
      });

      await deps.controller.createTopup('ws_lc', {
        amountCents: 10_000,
        method: 'card',
      });

      const wallet = seedWallet({ id: 'pwl_lc', workspaceId: 'ws_lc', balanceCents: 10_000n });
      deps.factory.workspaceMap.set('ws_lc', wallet);
      deps.factory.walletMap.set('pwl_lc', wallet);

      const spendResult = await deps.controller.spend('ws_lc', {
        operation: 'site_generation',
        quotedCostCents: 2_000,
        requestId: 'req_lc_1',
      });

      expect(spendResult.success).toBe(true);
      expect(spendResult.costCents).toBe('2000');

      await deps.controller.spend('ws_lc', {
        operation: 'kb_ingestion',
        quotedCostCents: 3_000,
        requestId: 'req_lc_2',
      });

      const balanceAfterSpends = await deps.controller.getBalance('ws_lc');
      expect(balanceAfterSpends.balanceCents).toBe('5000');
    });
  });
});
