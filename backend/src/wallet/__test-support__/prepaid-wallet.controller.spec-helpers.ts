// Test helpers for PrepaidWalletController spec suite.
// Extracted to keep individual spec files within architecture guardrail size limits.

import { Test, type TestingModule } from '@nestjs/testing';
import type { PrepaidWallet, PrepaidWalletTransaction, PrepaidWalletTxType } from '@prisma/client';

import { StripeService } from '../../billing/stripe.service';
import { FraudEngine } from '../../payments/fraud/fraud.engine';
import { PrismaService } from '../../prisma/prisma.service';

import { PrepaidWalletController } from '../prepaid-wallet.controller';
import { WalletService } from '../wallet.service';

/** Stripe stub shape used by prepaid wallet specs. */
export type StripeStub = {
  stripe: { paymentIntents: { create: jest.Mock } };
};

/** Fraud engine stub shape used by prepaid wallet specs. */
export type FraudEngineStub = {
  evaluate: jest.Mock;
};

/** Build a fresh Stripe stub with a `paymentIntents.create` jest mock. */
export function makeStripeStub(): StripeStub {
  return { stripe: { paymentIntents: { create: jest.fn() } } };
}

/** Build a fresh FraudEngine stub that allows by default. */
export function makeFraudEngineStub(): FraudEngineStub {
  return {
    evaluate: jest.fn().mockResolvedValue({ action: 'allow', score: 0, reasons: [] }),
  };
}

function lookupWallet(
  walletMap: Map<string, PrepaidWallet>,
  workspaceMap: Map<string, PrepaidWallet>,
  where: { id?: string; workspaceId?: string },
): PrepaidWallet | null {
  if (where.id) return walletMap.get(where.id) ?? null;
  if (where.workspaceId) return workspaceMap.get(where.workspaceId) ?? null;
  return null;
}

/** Build the in-memory Prisma stub used by prepaid wallet specs. */
export function makePrismaStub(wallets: PrepaidWallet[] = []) {
  const walletMap = new Map<string, PrepaidWallet>(wallets.map((w) => [w.id, w]));
  const workspaceMap = new Map<string, PrepaidWallet>(wallets.map((w) => [w.workspaceId, w]));
  const transactions: PrepaidWalletTransaction[] = [];
  let nextWalletId = wallets.length + 1;
  let nextTxId = 1;

  const stub = {
    prepaidWallet: {
      findUnique: jest.fn(({ where }: { where: { id?: string; workspaceId?: string } }) =>
        Promise.resolve(lookupWallet(walletMap, workspaceMap, where)),
      ),
      findFirst: jest.fn(({ where }: { where: { id?: string; workspaceId?: string } }) =>
        Promise.resolve(lookupWallet(walletMap, workspaceMap, where)),
      ),
      upsert: jest.fn(
        ({
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
            return Promise.resolve(merged);
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
          return Promise.resolve(row);
        },
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; workspaceId?: string };
          data: Partial<PrepaidWallet>;
        }) => {
          const current = walletMap.get(where.id);
          if (!current) return Promise.resolve({ count: 0 });
          const next = { ...current, ...data, updatedAt: new Date() } as PrepaidWallet;
          walletMap.set(where.id, next);
          workspaceMap.set(next.workspaceId, next);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
    prepaidWalletTransaction: {
      findFirst: jest.fn(
        ({
          where,
        }: {
          where: { referenceType: string; referenceId: string; type: PrepaidWalletTxType };
        }) =>
          Promise.resolve(
            transactions.find(
              (t) =>
                t.referenceType === where.referenceType &&
                t.referenceId === where.referenceId &&
                t.type === where.type,
            ) ?? null,
          ),
      ),
      findMany: jest.fn(() => Promise.resolve(transactions.slice().reverse())),
      count: jest.fn(() => Promise.resolve(transactions.length)),
      create: jest.fn(({ data }: { data: Omit<PrepaidWalletTransaction, 'id' | 'createdAt'> }) => {
        const row = {
          id: `pwt_${nextTxId++}`,
          createdAt: new Date(),
          ...data,
        } as PrepaidWalletTransaction;
        transactions.push(row);
        return Promise.resolve(row);
      }),
    },
    $transaction: jest.fn(),
  };

  stub.$transaction.mockImplementation(
    <T>(callback: (tx: typeof stub) => Promise<T>): Promise<T> => callback(stub),
  );

  return { walletMap, workspaceMap, transactions, stub, prisma: stub as unknown as PrismaService };
}

/** Seed a wallet row with sensible defaults. */
export const seedWallet = (overrides: Partial<PrepaidWallet> = {}): PrepaidWallet =>
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

/** Build a Nest testing module wired with the test stubs. */
export async function buildModule(
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

/** Standard deps shape used across prepaid wallet specs. */
export type PrepaidWalletSpecDeps = {
  controller: PrepaidWalletController;
  service: WalletService;
  factory: ReturnType<typeof makePrismaStub>;
};
