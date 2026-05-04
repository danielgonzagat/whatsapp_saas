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
import { WalletNotFoundError } from './wallet.types';

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
          const next = { ...current, ...data, updatedAt: new Date() };
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
          };
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

  it('blocks the top-up before hitting Stripe when antifraud returns block', async () => {
    const stripe = makeStripeStub();
    const prisma = makePrismaStub();
    const fraudEngine = makeFraudEngineStub();
    fraudEngine.evaluate.mockResolvedValueOnce({
      action: 'block',
      score: 1,
      reasons: [{ signal: 'blacklist', detail: 'email' }],
    });
    const service = await buildService(stripe, prisma, fraudEngine);

    await expect(
      service.createTopupIntent({
        workspaceId: 'ws_blocked',
        amountCents: 5_000n,
        method: 'card',
        buyerEmail: 'blocked@example.com',
      }),
    ).rejects.toThrow(/antifraude/i);

    expect(stripe.stripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(prisma.walletsByWorkspace.has('ws_blocked')).toBe(false);
  });

  it('forces 3DS on card top-ups when antifraud returns require_3ds', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      id: 'pi_topup_3ds',
      client_secret: 'pi_topup_3ds_secret',
      amount: 250000,
      next_action: null,
    });
    const prisma = makePrismaStub();
    const fraudEngine = makeFraudEngineStub();
    fraudEngine.evaluate.mockResolvedValueOnce({
      action: 'require_3ds',
      score: 0.35,
      reasons: [{ signal: 'high_amount', detail: 'large card top-up' }],
    });
    const service = await buildService(stripe, prisma, fraudEngine);

    await service.createTopupIntent({
      workspaceId: 'ws_3ds',
      amountCents: 250_000n,
      method: 'card',
      buyerEmail: 'seller@example.com',
    });

    expect(stripe.stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method_types: ['card'],
        payment_method_options: {
          card: {
            request_three_d_secure: 'any',
          },
        },
      }),
    );
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
