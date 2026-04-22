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
      update: jest.Mock;
    };
  };
};

function makeStripeStub(): StripeStub {
  return {
    stripe: {
      accounts: {
        create: jest.fn(),
        retrieve: jest.fn(),
        update: jest.fn(),
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

  it('retries BR account creation without manual payout schedule when Stripe rejects the manual plan', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.accounts.create
      .mockRejectedValueOnce(new Error('You cannot be on a manual payout plan in country BR.'))
      .mockResolvedValueOnce({ id: 'acct_br_retry' });
    const prisma = makePrismaStub();
    const service = await buildService(stripe, prisma);

    const result = await service.createCustomAccount({
      workspaceId: 'ws_br',
      accountType: 'SELLER',
      email: 'seller-br@example.com',
      displayName: 'Seller BR',
    });

    expect(stripe.stripe.accounts.create).toHaveBeenCalledTimes(2);
    expect(stripe.stripe.accounts.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        country: 'BR',
        settings: { payouts: { schedule: { interval: 'manual' } } },
      }),
    );
    expect(stripe.stripe.accounts.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        country: 'BR',
        settings: undefined,
      }),
    );
    expect(result.stripeAccountId).toBe('acct_br_retry');
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

describe('ConnectService.submitOnboardingProfile', () => {
  it('submits an individual onboarding profile directly to Stripe and returns refreshed status', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.accounts.update.mockResolvedValue({
      id: 'acct_status',
    });
    stripe.stripe.accounts.retrieve.mockResolvedValue({
      id: 'acct_status',
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: true,
      requirements: {
        currently_due: ['individual.verification.document'],
        past_due: [],
        disabled_reason: 'requirements.pending_verification',
      },
      capabilities: {
        card_payments: 'pending',
        transfers: 'pending',
      },
    });
    const prisma = makePrismaStub();
    const service = await buildService(stripe, prisma);

    const result = await service.submitOnboardingProfile({
      stripeAccountId: 'acct_status',
      email: 'seller@example.com',
      country: 'BR',
      businessType: 'individual',
      businessProfile: {
        name: 'Acme Cursos',
        url: 'https://acme.test',
        mcc: '5734',
        productDescription: 'Cursos online',
        supportEmail: 'suporte@acme.test',
        supportPhone: '+55 11 99999-0000',
        supportUrl: 'https://acme.test/ajuda',
      },
      individual: {
        firstName: 'Ana',
        lastName: 'Silva',
        email: 'ana@acme.test',
        phone: '+55 11 99999-0000',
        idNumber: '123.456.789-09',
        dateOfBirth: {
          day: 7,
          month: 5,
          year: 1991,
        },
        address: {
          line1: 'Rua A, 123',
          city: 'Sao Paulo',
          state: 'SP',
          postalCode: '01001-000',
          country: 'BR',
        },
      },
      externalAccount: {
        country: 'BR',
        currency: 'BRL',
        accountHolderName: 'Ana Silva',
        accountHolderType: 'individual',
        routingNumber: '341-0001',
        accountNumber: '12345-6',
      },
      tosAcceptance: {
        acceptedAt: '2026-04-22T12:34:56.000Z',
        ipAddress: '203.0.113.10',
        userAgent: 'Mozilla/5.0',
      },
      metadata: {
        workspaceRole: 'seller',
      },
    });

    expect(stripe.stripe.accounts.update).toHaveBeenCalledWith('acct_status', {
      email: 'seller@example.com',
      country: 'BR',
      business_type: 'individual',
      business_profile: {
        name: 'Acme Cursos',
        url: 'https://acme.test',
        mcc: '5734',
        product_description: 'Cursos online',
        support_email: 'suporte@acme.test',
        support_phone: '+55 11 99999-0000',
        support_url: 'https://acme.test/ajuda',
      },
      individual: {
        first_name: 'Ana',
        last_name: 'Silva',
        email: 'ana@acme.test',
        phone: '+55 11 99999-0000',
        id_number: '12345678909',
        dob: {
          day: 7,
          month: 5,
          year: 1991,
        },
        address: {
          line1: 'Rua A, 123',
          city: 'Sao Paulo',
          state: 'SP',
          postal_code: '01001-000',
          country: 'BR',
        },
      },
      external_account: {
        object: 'bank_account',
        country: 'BR',
        currency: 'brl',
        account_holder_name: 'Ana Silva',
        account_holder_type: 'individual',
        routing_number: '3410001',
        account_number: '123456',
      },
      tos_acceptance: {
        date: Math.floor(Date.parse('2026-04-22T12:34:56.000Z') / 1000),
        ip: '203.0.113.10',
        user_agent: 'Mozilla/5.0',
      },
      metadata: {
        workspaceRole: 'seller',
      },
    });
    expect(result).toEqual({
      stripeAccountId: 'acct_status',
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: true,
      requirementsCurrentlyDue: ['individual.verification.document'],
      requirementsPastDue: [],
      requirementsDisabledReason: 'requirements.pending_verification',
      capabilities: {
        card_payments: 'pending',
        transfers: 'pending',
      },
    });
  });

  it('supports company onboarding with tokenized bank account payloads', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.accounts.update.mockResolvedValue({
      id: 'acct_company',
    });
    stripe.stripe.accounts.retrieve.mockResolvedValue({
      id: 'acct_company',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      requirements: {
        currently_due: [],
        past_due: [],
        disabled_reason: null,
      },
      capabilities: {
        card_payments: 'active',
        transfers: 'active',
      },
    });
    const prisma = makePrismaStub();
    const service = await buildService(stripe, prisma);

    const result = await service.submitOnboardingProfile({
      stripeAccountId: 'acct_company',
      businessType: 'company',
      company: {
        name: 'Kloel Educacao Ltda',
        taxId: '12.345.678/0001-90',
        phone: '+55 11 4002-8922',
        address: {
          line1: 'Av Paulista, 1000',
          city: 'Sao Paulo',
          state: 'SP',
          postalCode: '01310-100',
        },
      },
      externalAccount: {
        token: 'btok_br_test_123',
      },
    });

    expect(stripe.stripe.accounts.update).toHaveBeenCalledWith('acct_company', {
      business_type: 'company',
      company: {
        name: 'Kloel Educacao Ltda',
        tax_id: '12345678000190',
        phone: '+55 11 4002-8922',
        address: {
          line1: 'Av Paulista, 1000',
          city: 'Sao Paulo',
          state: 'SP',
          postal_code: '01310-100',
        },
      },
      external_account: 'btok_br_test_123',
    });
    expect(result).toEqual({
      stripeAccountId: 'acct_company',
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      requirementsCurrentlyDue: [],
      requirementsPastDue: [],
      requirementsDisabledReason: null,
      capabilities: {
        card_payments: 'active',
        transfers: 'active',
      },
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
