import { Test, type TestingModule } from '@nestjs/testing';
import type { ConnectAccountBalance, ConnectAccountType } from '@prisma/client';

import { StripeService } from '../../billing/stripe.service';
import { PrismaService } from '../../prisma/prisma.service';

import { ConnectService } from './connect.service';
import { ConnectAccountAlreadyExistsError } from './connect.types';

type StripeStub = {
  stripe: {
    accounts: {
      create: jest.Mock;
      retrieve: jest.Mock;
    };
    accountLinks: {
      create: jest.Mock;
    };
  };
};

function makeStripeStub(): StripeStub {
  return {
    stripe: {
      accounts: {
        create: jest.fn(),
        retrieve: jest.fn(),
      },
      accountLinks: {
        create: jest.fn(),
      },
    },
  };
}

function makePrismaStub(initial: ConnectAccountBalance[] = []) {
  const balances = new Map(initial.map((b) => [b.id, b]));
  let nextId = 1;
  return {
    balances,
    prisma: {
      connectAccountBalance: {
        findFirst: jest.fn(
          async ({ where }: { where: { workspaceId: string; accountType: ConnectAccountType } }) =>
            [...balances.values()].find(
              (b) => b.workspaceId === where.workspaceId && b.accountType === where.accountType,
            ) ?? null,
        ),
        findUnique: jest.fn(
          async ({ where }: { where: { stripeAccountId: string } }) =>
            [...balances.values()].find((b) => b.stripeAccountId === where.stripeAccountId) ?? null,
        ),
        create: jest.fn(
          async ({
            data,
          }: {
            data: {
              workspaceId: string;
              stripeAccountId: string;
              accountType: ConnectAccountType;
            };
          }) => {
            const row: ConnectAccountBalance = {
              id: `cab_${nextId++}`,
              workspaceId: data.workspaceId,
              stripeAccountId: data.stripeAccountId,
              accountType: data.accountType,
              pendingBalanceCents: 0n,
              availableBalanceCents: 0n,
              lifetimeReceivedCents: 0n,
              lifetimePaidOutCents: 0n,
              lifetimeChargebacksCents: 0n,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            balances.set(row.id, row);
            return row;
          },
        ),
      },
    } as unknown as PrismaService,
  };
}

async function buildService(
  stripeStub: StripeStub,
  prismaStub: ReturnType<typeof makePrismaStub>,
): Promise<ConnectService> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      ConnectService,
      { provide: StripeService, useValue: stripeStub },
      { provide: PrismaService, useValue: prismaStub.prisma },
    ],
  }).compile();
  return moduleRef.get(ConnectService);
}

describe('ConnectService.createCustomAccount', () => {
  it('creates a Stripe Custom account with manual payouts and persists balance row', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.accounts.create.mockResolvedValue({ id: 'acct_test_123' });
    const prisma = makePrismaStub();
    const service = await buildService(stripe, prisma);

    const result = await service.createCustomAccount({
      workspaceId: 'ws_1',
      accountType: 'SELLER',
      email: 'seller@example.com',
      displayName: 'Acme Co',
    });

    expect(stripe.stripe.accounts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'custom',
        country: 'BR',
        email: 'seller@example.com',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        settings: { payouts: { schedule: { interval: 'manual' } } },
        metadata: expect.objectContaining({
          workspaceId: 'ws_1',
          accountType: 'SELLER',
          displayName: 'Acme Co',
        }),
      }),
    );
    expect(result.stripeAccountId).toBe('acct_test_123');
    expect(result.accountBalanceId).toMatch(/^cab_/);
    expect(result.requestedCapabilities).toEqual(['card_payments', 'transfers']);

    const balance = prisma.balances.get(result.accountBalanceId);
    expect(balance?.workspaceId).toBe('ws_1');
    expect(balance?.accountType).toBe('SELLER');
    expect(balance?.stripeAccountId).toBe('acct_test_123');
  });

  it('honors a custom country override', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.accounts.create.mockResolvedValue({ id: 'acct_us' });
    const prisma = makePrismaStub();
    const service = await buildService(stripe, prisma);

    await service.createCustomAccount({
      workspaceId: 'ws_2',
      accountType: 'AFFILIATE',
      email: 'aff@example.com',
      country: 'US',
    });

    expect(stripe.stripe.accounts.create).toHaveBeenCalledWith(
      expect.objectContaining({ country: 'US' }),
    );
  });

  it('rejects creating a duplicate (workspaceId, accountType) account', async () => {
    const stripe = makeStripeStub();
    const existing: ConnectAccountBalance = {
      id: 'cab_existing',
      workspaceId: 'ws_dup',
      stripeAccountId: 'acct_dup',
      accountType: 'SELLER',
      pendingBalanceCents: 0n,
      availableBalanceCents: 0n,
      lifetimeReceivedCents: 0n,
      lifetimePaidOutCents: 0n,
      lifetimeChargebacksCents: 0n,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = makePrismaStub([existing]);
    const service = await buildService(stripe, prisma);

    await expect(
      service.createCustomAccount({
        workspaceId: 'ws_dup',
        accountType: 'SELLER',
        email: 'seller@example.com',
      }),
    ).rejects.toBeInstanceOf(ConnectAccountAlreadyExistsError);
    expect(stripe.stripe.accounts.create).not.toHaveBeenCalled();
  });
});

describe('ConnectService.getOnboardingStatus', () => {
  it('maps Stripe account fields to OnboardingStatus shape', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.accounts.retrieve.mockResolvedValue({
      id: 'acct_status',
      charges_enabled: true,
      payouts_enabled: false,
      details_submitted: true,
      requirements: {
        currently_due: ['individual.id_number'],
        past_due: [],
        disabled_reason: null,
      },
      capabilities: {
        card_payments: 'active',
        transfers: 'pending',
      },
    });
    const prisma = makePrismaStub();
    const service = await buildService(stripe, prisma);

    const status = await service.getOnboardingStatus('acct_status');

    expect(status).toEqual({
      stripeAccountId: 'acct_status',
      chargesEnabled: true,
      payoutsEnabled: false,
      detailsSubmitted: true,
      requirementsCurrentlyDue: ['individual.id_number'],
      requirementsPastDue: [],
      requirementsDisabledReason: null,
      capabilities: {
        card_payments: 'active',
        transfers: 'pending',
      },
    });
  });

  it('handles missing requirements/capabilities gracefully', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.accounts.retrieve.mockResolvedValue({ id: 'acct_minimal' });
    const prisma = makePrismaStub();
    const service = await buildService(stripe, prisma);

    const status = await service.getOnboardingStatus('acct_minimal');

    expect(status.chargesEnabled).toBe(false);
    expect(status.payoutsEnabled).toBe(false);
    expect(status.detailsSubmitted).toBe(false);
    expect(status.requirementsCurrentlyDue).toEqual([]);
    expect(status.requirementsPastDue).toEqual([]);
    expect(status.requirementsDisabledReason).toBeNull();
    expect(status.capabilities).toEqual({});
  });
});

describe('ConnectService.createOnboardingLink', () => {
  it('creates an account onboarding link with caller-provided URLs', async () => {
    const stripe = makeStripeStub();
    const expiresAtEpoch = 1_776_000_000;
    stripe.stripe.accountLinks.create.mockResolvedValue({
      url: 'https://connect.stripe.test/onboarding',
      expires_at: expiresAtEpoch,
    });
    const prisma = makePrismaStub();
    const service = await buildService(stripe, prisma);

    const result = await service.createOnboardingLink({
      stripeAccountId: 'acct_status',
      refreshUrl: 'https://app.kloel.test/connect/refresh',
      returnUrl: 'https://app.kloel.test/connect/return',
      type: 'account_update',
    });

    expect(stripe.stripe.accountLinks.create).toHaveBeenCalledWith({
      account: 'acct_status',
      refresh_url: 'https://app.kloel.test/connect/refresh',
      return_url: 'https://app.kloel.test/connect/return',
      type: 'account_update',
    });
    expect(result).toEqual({
      stripeAccountId: 'acct_status',
      url: 'https://connect.stripe.test/onboarding',
      expiresAt: new Date(expiresAtEpoch * 1000).toISOString(),
      type: 'account_update',
    });
  });

  it('defaults to account_onboarding when type is omitted', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.accountLinks.create.mockResolvedValue({
      url: 'https://connect.stripe.test/onboarding',
      expires_at: null,
    });
    const prisma = makePrismaStub();
    const service = await buildService(stripe, prisma);

    const result = await service.createOnboardingLink({
      stripeAccountId: 'acct_status',
      refreshUrl: 'https://app.kloel.test/connect/refresh',
      returnUrl: 'https://app.kloel.test/connect/return',
    });

    expect(stripe.stripe.accountLinks.create).toHaveBeenCalledWith({
      account: 'acct_status',
      refresh_url: 'https://app.kloel.test/connect/refresh',
      return_url: 'https://app.kloel.test/connect/return',
      type: 'account_onboarding',
    });
    expect(result).toEqual({
      stripeAccountId: 'acct_status',
      url: 'https://connect.stripe.test/onboarding',
      expiresAt: null,
      type: 'account_onboarding',
    });
  });
});

describe('ConnectService.findBalanceByStripeAccountId', () => {
  it('returns the balance row when present', async () => {
    const stripe = makeStripeStub();
    const existing: ConnectAccountBalance = {
      id: 'cab_x',
      workspaceId: 'ws_x',
      stripeAccountId: 'acct_x',
      accountType: 'SUPPLIER',
      pendingBalanceCents: 0n,
      availableBalanceCents: 0n,
      lifetimeReceivedCents: 0n,
      lifetimePaidOutCents: 0n,
      lifetimeChargebacksCents: 0n,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = makePrismaStub([existing]);
    const service = await buildService(stripe, prisma);

    const found = await service.findBalanceByStripeAccountId('acct_x');
    expect(found?.id).toBe('cab_x');
  });

  it('returns null when no row matches', async () => {
    const stripe = makeStripeStub();
    const prisma = makePrismaStub();
    const service = await buildService(stripe, prisma);

    const found = await service.findBalanceByStripeAccountId('acct_missing');
    expect(found).toBeNull();
  });
});
