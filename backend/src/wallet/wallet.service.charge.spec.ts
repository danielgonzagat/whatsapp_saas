import { Test, type TestingModule } from '@nestjs/testing';
import type {
  PrepaidWallet,
  PrepaidWalletTransaction,
  PrepaidWalletTxType,
  UsagePrice,
} from '@prisma/client';

import { StripeService } from '../billing/stripe.service';
import { FraudEngine } from '../payments/fraud/fraud.engine';
import { PrismaService } from '../prisma/prisma.service';

import { WalletService } from './wallet.service';
import { InsufficientWalletBalanceError, UsagePriceNotFoundError } from './wallet.types';

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
    evaluate: jest.fn().mockResolvedValue({
      action: 'allow',
      score: 0,
      reasons: [],
    }),
  };
}

function makePrismaStub(
  opts: {
    wallets?: PrepaidWallet[];
    prices?: UsagePrice[];
  } = {},
) {
  const wallets = new Map((opts.wallets ?? []).map((w) => [w.id, w]));
  const walletsByWorkspace = new Map((opts.wallets ?? []).map((w) => [w.workspaceId, w]));
  const prices = new Map((opts.prices ?? []).map((p) => [p.operation, p]));
  const transactions: PrepaidWalletTransaction[] = [];
  let nextWalletId = wallets.size + 1;
  let nextTxId = 1;

  const stub = {
    prepaidWallet: {
      findUnique: jest.fn(async ({ where }: { where: { id?: string; workspaceId?: string } }) => {
        if (where.id) {
          return wallets.get(where.id) ?? null;
        }
        if (where.workspaceId) {
          return walletsByWorkspace.get(where.workspaceId) ?? null;
        }
        return null;
      }),
      findFirst: jest.fn(async ({ where }: { where: { id?: string; workspaceId?: string } }) => {
        if (where.id) {
          return wallets.get(where.id) ?? null;
        }
        if (where.workspaceId) {
          return walletsByWorkspace.get(where.workspaceId) ?? null;
        }
        return null;
      }),
      upsert: jest.fn(
        async ({
          where,
          create,
        }: {
          where: { workspaceId: string };
          create: { workspaceId: string };
          update: Record<string, unknown>;
        }) => {
          const existing = walletsByWorkspace.get(where.workspaceId);
          if (existing) {
            return existing;
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
          } as object as PrepaidWallet;
          wallets.set(row.id, row);
          walletsByWorkspace.set(row.workspaceId, row);
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
          const current = wallets.get(where.id);
          if (!current) {
            throw new Error(`stub: wallet not found ${where.id}`);
          }
          const next = { ...current, ...data, updatedAt: new Date() } as PrepaidWallet;
          wallets.set(where.id, next);
          walletsByWorkspace.set(next.workspaceId, next);
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
      create: jest.fn(
        async ({ data }: { data: Omit<PrepaidWalletTransaction, 'id' | 'createdAt'> }) => {
          const row: PrepaidWalletTransaction = {
            id: `pwt_${nextTxId++}`,
            createdAt: new Date(),
            ...data,
          } as PrepaidWalletTransaction;
          transactions.push(row);
          return row;
        },
      ),
    },
    usagePrice: {
      findUnique: jest.fn(
        async ({ where }: { where: { operation: string } }) => prices.get(where.operation) ?? null,
      ),
    },
    $transaction: jest.fn(),
  };

  stub.$transaction.mockImplementation(
    async <T>(callback: (tx: typeof stub) => Promise<T>): Promise<T> => callback(stub),
  );

  return { wallets, walletsByWorkspace, transactions, prisma: stub as object as PrismaService };
}

async function buildService(
  stripe: StripeStub,
  prisma: ReturnType<typeof makePrismaStub>,
  fraudEngine = makeFraudEngineStub(),
) {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      WalletService,
      { provide: StripeService, useValue: stripe },
      { provide: PrismaService, useValue: prisma.prisma },
      { provide: FraudEngine, useValue: fraudEngine },
    ],
  }).compile();
  return moduleRef.get(WalletService);
}

const seedWallet = (overrides: Partial<PrepaidWallet> = {}): PrepaidWallet =>
  ({
    id: overrides.id ?? 'pwl_seed',
    workspaceId: overrides.workspaceId ?? 'ws_1',
    balanceCents: overrides.balanceCents ?? 0n,
    currency: overrides.currency ?? 'BRL',
    autoRechargeEnabled: false,
    autoRechargeThresholdCents: null,
    autoRechargeAmountCents: null,
    defaultPaymentMethodId: null,
    stripeCustomerId: null,
    pendingAutoRechargePaymentIntentId: null,
    pendingAutoRechargeStartedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as object as PrepaidWallet;

const seedPrice = (overrides: Partial<UsagePrice> = {}): UsagePrice =>
  ({
    id: overrides.id ?? 'up_seed',
    operation: overrides.operation ?? 'ai_message',
    pricePerUnitCents: overrides.pricePerUnitCents ?? 100n,
    unit: overrides.unit ?? 'message',
    active: overrides.active ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as UsagePrice;

describe('WalletService.chargeForUsage', () => {
  it('debits the wallet by units * pricePerUnit', async () => {
    const stripe = makeStripeStub();
    const wallet = seedWallet({ balanceCents: 1_000n });
    const price = seedPrice({ operation: 'ai_message', pricePerUnitCents: 100n });
    const prisma = makePrismaStub({ wallets: [wallet], prices: [price] });
    const service = await buildService(stripe, prisma);

    const result = await service.chargeForUsage({
      workspaceId: 'ws_1',
      operation: 'ai_message',
      units: 3,
      requestId: 'req_1',
    });

    expect(result.costCents).toBe(300n);
    expect(result.newBalanceCents).toBe(700n);
    expect(prisma.wallets.get('pwl_seed')?.balanceCents).toBe(700n);
  });

  it('throws InsufficientWalletBalanceError when balance is too low', async () => {
    const stripe = makeStripeStub();
    const wallet = seedWallet({ balanceCents: 50n });
    const price = seedPrice({ pricePerUnitCents: 100n });
    const prisma = makePrismaStub({ wallets: [wallet], prices: [price] });
    const service = await buildService(stripe, prisma);

    await expect(
      service.chargeForUsage({
        workspaceId: 'ws_1',
        operation: 'ai_message',
        units: 1,
        requestId: 'req_short',
      }),
    ).rejects.toBeInstanceOf(InsufficientWalletBalanceError);
  });

  it('throws UsagePriceNotFoundError when operation has no active price', async () => {
    const stripe = makeStripeStub();
    const wallet = seedWallet({ balanceCents: 10_000n });
    const prisma = makePrismaStub({ wallets: [wallet], prices: [] });
    const service = await buildService(stripe, prisma);

    await expect(
      service.chargeForUsage({
        workspaceId: 'ws_1',
        operation: 'unknown_op',
        units: 1,
        requestId: 'req_1',
      }),
    ).rejects.toBeInstanceOf(UsagePriceNotFoundError);
  });

  it('throws UsagePriceNotFoundError when price exists but is inactive', async () => {
    const stripe = makeStripeStub();
    const wallet = seedWallet({ balanceCents: 10_000n });
    const price = seedPrice({ active: false });
    const prisma = makePrismaStub({ wallets: [wallet], prices: [price] });
    const service = await buildService(stripe, prisma);

    await expect(
      service.chargeForUsage({
        workspaceId: 'ws_1',
        operation: 'ai_message',
        units: 1,
        requestId: 'req_1',
      }),
    ).rejects.toBeInstanceOf(UsagePriceNotFoundError);
  });

  it('rejects non-positive units', async () => {
    const stripe = makeStripeStub();
    const wallet = seedWallet({ balanceCents: 1_000n });
    const price = seedPrice();
    const prisma = makePrismaStub({ wallets: [wallet], prices: [price] });
    const service = await buildService(stripe, prisma);

    await expect(
      service.chargeForUsage({
        workspaceId: 'ws_1',
        operation: 'ai_message',
        units: 0,
        requestId: 'req_zero',
      }),
    ).rejects.toThrow(/units must be > 0/);
  });

  it('is idempotent on requestId (retried API call does not double-debit)', async () => {
    const stripe = makeStripeStub();
    const wallet = seedWallet({ balanceCents: 1_000n });
    const price = seedPrice({ pricePerUnitCents: 100n });
    const prisma = makePrismaStub({ wallets: [wallet], prices: [price] });
    const service = await buildService(stripe, prisma);

    await service.chargeForUsage({
      workspaceId: 'ws_1',
      operation: 'ai_message',
      units: 2,
      requestId: 'req_idem',
    });
    const second = await service.chargeForUsage({
      workspaceId: 'ws_1',
      operation: 'ai_message',
      units: 2,
      requestId: 'req_idem',
    });

    expect(second.newBalanceCents).toBe(800n);
    expect(prisma.transactions.filter((t) => t.type === 'USAGE')).toHaveLength(1);
  });

  it('supports provider-quoted debits without consulting usage_prices', async () => {
    const stripe = makeStripeStub();
    const wallet = seedWallet({ balanceCents: 1_000n });
    const prisma = makePrismaStub({ wallets: [wallet], prices: [] });
    const service = await buildService(stripe, prisma);

    const result = await service.chargeForUsage({
      workspaceId: 'ws_1',
      operation: 'ai_message',
      quotedCostCents: 45n,
      requestId: 'req_quote',
      metadata: { channel: 'ai_assistant' },
    });

    expect(result.costCents).toBe(45n);
    expect(result.newBalanceCents).toBe(955n);
    expect(prisma.prisma.usagePrice.findUnique).not.toHaveBeenCalled();
  });
});
