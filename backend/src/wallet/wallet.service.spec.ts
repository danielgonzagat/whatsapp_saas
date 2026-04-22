import { Test, type TestingModule } from '@nestjs/testing';
import type {
  PrepaidWallet,
  PrepaidWalletTransaction,
  PrepaidWalletTxType,
  UsagePrice,
} from '@prisma/client';

import { StripeService } from '../billing/stripe.service';
import { PrismaService } from '../prisma/prisma.service';

import { WalletService } from './wallet.service';
import {
  InsufficientWalletBalanceError,
  UsagePriceNotFoundError,
  WalletNotFoundError,
} from './wallet.types';

type StripeStub = {
  stripe: { paymentIntents: { create: jest.Mock } };
};

function makeStripeStub(): StripeStub {
  return { stripe: { paymentIntents: { create: jest.fn() } } };
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
          const row: PrepaidWallet = {
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
          };
          wallets.set(row.id, row);
          walletsByWorkspace.set(row.workspaceId, row);
          return row;
        },
      ),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<PrepaidWallet> }) => {
          const current = wallets.get(where.id);
          if (!current) {
            throw new Error(`stub: wallet not found ${where.id}`);
          }
          const next = { ...current, ...data, updatedAt: new Date() } as PrepaidWallet;
          wallets.set(where.id, next);
          walletsByWorkspace.set(next.workspaceId, next);
          return next;
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

  return { wallets, walletsByWorkspace, transactions, prisma: stub as unknown as PrismaService };
}

async function buildService(stripe: StripeStub, prisma: ReturnType<typeof makePrismaStub>) {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      WalletService,
      { provide: StripeService, useValue: stripe },
      { provide: PrismaService, useValue: prisma.prisma },
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
  }) as PrepaidWallet;

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

describe('WalletService.createTopupIntent', () => {
  it('creates a PaymentIntent and auto-creates the workspace wallet', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      id: 'pi_topup_1',
      client_secret: 'pi_topup_1_secret_x',
      amount: 5000,
      next_action: null,
    });
    const prisma = makePrismaStub();
    const service = await buildService(stripe, prisma);

    const result = await service.createTopupIntent({
      workspaceId: 'ws_new',
      amountCents: 5_000n,
      method: 'card',
    });

    expect(result.paymentIntentId).toBe('pi_topup_1');
    expect(result.clientSecret).toBe('pi_topup_1_secret_x');
    expect(stripe.stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5000,
        currency: 'brl',
        payment_method_types: ['card'],
        metadata: expect.objectContaining({
          type: 'wallet_topup',
          workspace_id: 'ws_new',
          method: 'card',
        }),
      }),
    );
    expect(prisma.walletsByWorkspace.has('ws_new')).toBe(true);
  });

  it('returns PIX QR code data when next_action is pix_display_qr_code', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      id: 'pi_pix',
      client_secret: 'pi_pix_secret',
      amount: 10000,
      next_action: {
        type: 'pix_display_qr_code',
        pix_display_qr_code: {
          data: '00020126...',
          image_url_png: 'https://stripe.com/pix.png',
        },
      },
    });
    const prisma = makePrismaStub();
    const service = await buildService(stripe, prisma);

    const result = await service.createTopupIntent({
      workspaceId: 'ws_pix',
      amountCents: 10_000n,
      method: 'pix',
    });

    expect(result.pixQrCode).toBe('00020126...');
    expect(result.pixQrCodeUrl).toBe('https://stripe.com/pix.png');
  });

  it('rejects non-positive amount', async () => {
    const stripe = makeStripeStub();
    const prisma = makePrismaStub();
    const service = await buildService(stripe, prisma);

    await expect(
      service.createTopupIntent({ workspaceId: 'ws_x', amountCents: 0n, method: 'card' }),
    ).rejects.toThrow(/must be > 0/);
  });
});

describe('WalletService.creditFromWebhook', () => {
  it('credits the wallet for a wallet_topup PaymentIntent', async () => {
    const stripe = makeStripeStub();
    const wallet = seedWallet({ id: 'pwl_1', workspaceId: 'ws_1', balanceCents: 100n });
    const prisma = makePrismaStub({ wallets: [wallet] });
    const service = await buildService(stripe, prisma);

    const tx = await service.creditFromWebhook({
      id: 'pi_credit_1',
      amount: 5_000,
      metadata: { wallet_id: 'pwl_1', method: 'pix' },
    } as never);

    expect(tx).not.toBeNull();
    expect(tx?.amountCents).toBe(5_000n);
    expect(tx?.balanceAfterCents).toBe(5_100n);
    expect(prisma.wallets.get('pwl_1')?.balanceCents).toBe(5_100n);
  });

  it('returns null when PaymentIntent has no wallet_id metadata', async () => {
    const stripe = makeStripeStub();
    const prisma = makePrismaStub();
    const service = await buildService(stripe, prisma);

    const tx = await service.creditFromWebhook({
      id: 'pi_other',
      amount: 1_000,
      metadata: {},
    } as never);

    expect(tx).toBeNull();
  });

  it('is idempotent on the PaymentIntent id (re-delivered webhook)', async () => {
    const stripe = makeStripeStub();
    const wallet = seedWallet({ id: 'pwl_idem', workspaceId: 'ws_idem', balanceCents: 0n });
    const prisma = makePrismaStub({ wallets: [wallet] });
    const service = await buildService(stripe, prisma);

    await service.creditFromWebhook({
      id: 'pi_dup',
      amount: 2_000,
      metadata: { wallet_id: 'pwl_idem' },
    } as never);
    await service.creditFromWebhook({
      id: 'pi_dup',
      amount: 2_000,
      metadata: { wallet_id: 'pwl_idem' },
    } as never);

    expect(prisma.transactions.filter((t) => t.type === 'TOPUP')).toHaveLength(1);
    expect(prisma.wallets.get('pwl_idem')?.balanceCents).toBe(2_000n);
  });

  it('throws WalletNotFoundError when metadata.wallet_id points at missing wallet', async () => {
    const stripe = makeStripeStub();
    const prisma = makePrismaStub();
    const service = await buildService(stripe, prisma);

    await expect(
      service.creditFromWebhook({
        id: 'pi_missing',
        amount: 1_000,
        metadata: { wallet_id: 'pwl_does_not_exist' },
      } as never),
    ).rejects.toBeInstanceOf(WalletNotFoundError);
  });
});

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

describe('WalletService.refundUsageCharge', () => {
  it('credits back a prior usage debit idempotently', async () => {
    const stripe = makeStripeStub();
    const wallet = seedWallet({ balanceCents: 1_000n });
    const price = seedPrice({ pricePerUnitCents: 100n });
    const prisma = makePrismaStub({ wallets: [wallet], prices: [price] });
    const service = await buildService(stripe, prisma);

    await service.chargeForUsage({
      workspaceId: 'ws_1',
      operation: 'ai_message',
      units: 2,
      requestId: 'req_refund',
    });

    const first = await service.refundUsageCharge({
      workspaceId: 'ws_1',
      operation: 'ai_message',
      requestId: 'req_refund',
      reason: 'provider_exception',
    });
    const second = await service.refundUsageCharge({
      workspaceId: 'ws_1',
      operation: 'ai_message',
      requestId: 'req_refund',
      reason: 'provider_exception',
    });

    expect(first?.amountCents).toBe(200n);
    expect(second?.id).toBe(first?.id);
    expect(prisma.wallets.get('pwl_seed')?.balanceCents).toBe(1_000n);
    expect(prisma.transactions.filter((t) => t.type === 'REFUND')).toHaveLength(1);
  });
});

describe('WalletService.settleUsageCharge', () => {
  it('creates a positive adjustment when the quote exceeded actual provider cost', async () => {
    const stripe = makeStripeStub();
    const wallet = seedWallet({ balanceCents: 1_000n });
    const prisma = makePrismaStub({ wallets: [wallet], prices: [] });
    const service = await buildService(stripe, prisma);

    await service.chargeForUsage({
      workspaceId: 'ws_1',
      operation: 'ai_message',
      quotedCostCents: 90n,
      requestId: 'req_settle_refund',
    });

    const adjustment = await service.settleUsageCharge({
      workspaceId: 'ws_1',
      operation: 'ai_message',
      requestId: 'req_settle_refund',
      actualCostCents: 40n,
      reason: 'provider_usage',
    });

    expect(adjustment?.amountCents).toBe(50n);
    expect(prisma.wallets.get('pwl_seed')?.balanceCents).toBe(960n);
  });

  it('debits the wallet for settlement shortfall when the original quote was too low', async () => {
    const stripe = makeStripeStub();
    const wallet = seedWallet({ balanceCents: 1_000n });
    const prisma = makePrismaStub({ wallets: [wallet], prices: [] });
    const service = await buildService(stripe, prisma);

    await service.chargeForUsage({
      workspaceId: 'ws_1',
      operation: 'ai_message',
      quotedCostCents: 40n,
      requestId: 'req_settle_shortfall',
    });

    const adjustment = await service.settleUsageCharge({
      workspaceId: 'ws_1',
      operation: 'ai_message',
      requestId: 'req_settle_shortfall',
      actualCostCents: 70n,
      reason: 'provider_usage',
    });

    expect(adjustment?.amountCents).toBe(-30n);
    expect(prisma.wallets.get('pwl_seed')?.balanceCents).toBe(930n);
  });
});

describe('WalletService.getBalance', () => {
  it('returns the wallet balance', async () => {
    const stripe = makeStripeStub();
    const wallet = seedWallet({ balanceCents: 4_321n });
    const prisma = makePrismaStub({ wallets: [wallet] });
    const service = await buildService(stripe, prisma);

    expect(await service.getBalance('ws_1')).toBe(4_321n);
  });

  it('throws WalletNotFoundError for unknown workspace', async () => {
    const stripe = makeStripeStub();
    const prisma = makePrismaStub();
    const service = await buildService(stripe, prisma);

    await expect(service.getBalance('ws_missing')).rejects.toBeInstanceOf(WalletNotFoundError);
  });
});
