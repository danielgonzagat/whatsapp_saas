import { Test, type TestingModule } from '@nestjs/testing';

import { FinancialAlertService } from '../../common/financial-alert.service';
import { StripeService } from '../../billing/stripe.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import {
  AccountBalanceNotFoundError,
  InsufficientAvailableBalanceError,
} from '../ledger/ledger.types';

import { ConnectPayoutService, ConnectPayoutsNotEnabledError } from './connect-payout.service';

function makeBalance(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cab_seller_1',
    workspaceId: 'ws-1',
    stripeAccountId: 'acct_seller_1',
    accountType: 'SELLER',
    pendingBalanceCents: 0n,
    availableBalanceCents: 9_010n,
    lifetimeReceivedCents: 9_010n,
    lifetimePaidOutCents: 0n,
    lifetimeChargebacksCents: 0n,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
  };
}

async function buildService({
  prisma,
  stripe,
  ledger,
  financialAlert,
}: {
  prisma: Record<string, unknown>;
  stripe: Record<string, unknown>;
  ledger: Record<string, unknown>;
  financialAlert: Record<string, unknown>;
}) {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      ConnectPayoutService,
      { provide: PrismaService, useValue: prisma },
      { provide: StripeService, useValue: stripe },
      { provide: LedgerService, useValue: ledger },
      { provide: FinancialAlertService, useValue: financialAlert },
    ],
  }).compile();

  return moduleRef.get(ConnectPayoutService);
}

describe('ConnectPayoutService.createPayout', () => {
  it('creates a Stripe payout on the connected account and debits the ledger with the same idempotency key', async () => {
    const prisma = {
      connectAccountBalance: {
        findUnique: jest.fn().mockResolvedValue(makeBalance()),
      },
    };
    const stripe = {
      stripe: {
        accounts: {
          retrieve: jest.fn().mockResolvedValue({ id: 'acct_seller_1', payouts_enabled: true }),
        },
        payouts: {
          create: jest.fn().mockResolvedValue({ id: 'po_123', status: 'pending' }),
        },
      },
    };
    const ledger = {
      debitAvailableForPayout: jest.fn().mockResolvedValue({ id: 'cle_po_1' }),
      creditAvailableByAdjustment: jest.fn(),
    };
    const financialAlert = {
      withdrawalFailed: jest.fn(),
    };
    const service = await buildService({ prisma, stripe, ledger, financialAlert });

    const result = await service.createPayout({
      accountBalanceId: 'cab_seller_1',
      amountCents: 5_000n,
      requestId: 'po_req_1',
    });

    expect(stripe.stripe.payouts.create).toHaveBeenCalledWith(
      {
        amount: 5000,
        currency: 'brl',
        metadata: {
          accountBalanceId: 'cab_seller_1',
          requestId: 'po_req_1',
        },
      },
      {
        stripeAccount: 'acct_seller_1',
        idempotencyKey: 'po_req_1',
      },
    );
    expect(ledger.debitAvailableForPayout).toHaveBeenCalledWith({
      accountBalanceId: 'cab_seller_1',
      amountCents: 5_000n,
      reference: { type: 'payout', id: 'po_req_1' },
      metadata: {
        requestId: 'po_req_1',
        stripeAccountId: 'acct_seller_1',
      },
    });
    expect(ledger.creditAvailableByAdjustment).not.toHaveBeenCalled();
    expect(financialAlert.withdrawalFailed).not.toHaveBeenCalled();
    expect(result).toEqual({
      payoutId: 'po_123',
      status: 'pending',
      accountBalanceId: 'cab_seller_1',
      stripeAccountId: 'acct_seller_1',
      amountCents: 5_000n,
    });
  });

  it('throws when the account balance does not exist', async () => {
    const prisma = {
      connectAccountBalance: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const stripe = {
      stripe: {
        accounts: { retrieve: jest.fn() },
        payouts: { create: jest.fn() },
      },
    };
    const ledger = { debitAvailableForPayout: jest.fn(), creditAvailableByAdjustment: jest.fn() };
    const financialAlert = {
      withdrawalFailed: jest.fn(),
    };
    const service = await buildService({ prisma, stripe, ledger, financialAlert });

    await expect(
      service.createPayout({
        accountBalanceId: 'cab_missing',
        amountCents: 1_000n,
        requestId: 'po_req_missing',
      }),
    ).rejects.toBeInstanceOf(AccountBalanceNotFoundError);
    expect(stripe.stripe.payouts.create).not.toHaveBeenCalled();
    expect(stripe.stripe.accounts.retrieve).not.toHaveBeenCalled();
    expect(financialAlert.withdrawalFailed).not.toHaveBeenCalled();
  });

  it('throws before touching Stripe when available balance is insufficient', async () => {
    const prisma = {
      connectAccountBalance: {
        findUnique: jest.fn().mockResolvedValue(makeBalance({ availableBalanceCents: 999n })),
      },
    };
    const stripe = {
      stripe: {
        accounts: {
          retrieve: jest.fn().mockResolvedValue({ id: 'acct_seller_1', payouts_enabled: true }),
        },
        payouts: { create: jest.fn() },
      },
    };
    const ledger = { debitAvailableForPayout: jest.fn(), creditAvailableByAdjustment: jest.fn() };
    const financialAlert = {
      withdrawalFailed: jest.fn(),
    };
    const service = await buildService({ prisma, stripe, ledger, financialAlert });

    await expect(
      service.createPayout({
        accountBalanceId: 'cab_seller_1',
        amountCents: 1_000n,
        requestId: 'po_req_short',
      }),
    ).rejects.toBeInstanceOf(InsufficientAvailableBalanceError);
    expect(stripe.stripe.accounts.retrieve).not.toHaveBeenCalled();
    expect(stripe.stripe.payouts.create).not.toHaveBeenCalled();
    expect(financialAlert.withdrawalFailed).not.toHaveBeenCalled();
  });

  it('blocks payout execution before ledger debit when Stripe payouts are disabled', async () => {
    const prisma = {
      connectAccountBalance: {
        findUnique: jest.fn().mockResolvedValue(makeBalance()),
      },
    };
    const stripe = {
      stripe: {
        accounts: {
          retrieve: jest.fn().mockResolvedValue({
            id: 'acct_seller_1',
            payouts_enabled: false,
            requirements: {
              disabled_reason: 'requirements.pending_verification',
            },
          }),
        },
        payouts: { create: jest.fn() },
      },
    };
    const ledger = { debitAvailableForPayout: jest.fn(), creditAvailableByAdjustment: jest.fn() };
    const financialAlert = {
      withdrawalFailed: jest.fn(),
    };
    const service = await buildService({ prisma, stripe, ledger, financialAlert });

    await expect(
      service.createPayout({
        accountBalanceId: 'cab_seller_1',
        amountCents: 1_000n,
        requestId: 'po_req_disabled',
      }),
    ).rejects.toBeInstanceOf(ConnectPayoutsNotEnabledError);

    expect(stripe.stripe.accounts.retrieve).toHaveBeenCalledWith('acct_seller_1');
    expect(ledger.debitAvailableForPayout).not.toHaveBeenCalled();
    expect(stripe.stripe.payouts.create).not.toHaveBeenCalled();
  });

  it('recredits the local balance if Stripe payout creation fails synchronously after the local debit', async () => {
    const prisma = {
      connectAccountBalance: {
        findUnique: jest.fn().mockResolvedValue(makeBalance()),
      },
    };
    const stripe = {
      stripe: {
        accounts: {
          retrieve: jest.fn().mockResolvedValue({ id: 'acct_seller_1', payouts_enabled: true }),
        },
        payouts: {
          create: jest.fn().mockRejectedValue(new Error('stripe timeout')),
        },
      },
    };
    const ledger = {
      debitAvailableForPayout: jest.fn().mockResolvedValue({ id: 'cle_po_1' }),
      creditAvailableByAdjustment: jest.fn().mockResolvedValue({ id: 'cle_adj_1' }),
    };
    const financialAlert = {
      withdrawalFailed: jest.fn(),
    };
    const service = await buildService({ prisma, stripe, ledger, financialAlert });

    await expect(
      service.createPayout({
        accountBalanceId: 'cab_seller_1',
        amountCents: 5_000n,
        requestId: 'po_req_timeout',
      }),
    ).rejects.toThrow('stripe timeout');

    expect(ledger.debitAvailableForPayout).toHaveBeenCalledWith({
      accountBalanceId: 'cab_seller_1',
      amountCents: 5_000n,
      reference: { type: 'payout', id: 'po_req_timeout' },
      metadata: {
        requestId: 'po_req_timeout',
        stripeAccountId: 'acct_seller_1',
      },
    });
    expect(ledger.creditAvailableByAdjustment).toHaveBeenCalledWith({
      accountBalanceId: 'cab_seller_1',
      amountCents: 5_000n,
      reference: { type: 'payout_failed_request', id: 'po_req_timeout' },
      metadata: {
        requestId: 'po_req_timeout',
        stripeAccountId: 'acct_seller_1',
      },
    });
    expect(financialAlert.withdrawalFailed).toHaveBeenCalledWith(expect.any(Error), {
      workspaceId: 'ws-1',
      amount: 5000,
    });
  });
});

describe('ConnectPayoutService.handleFailedPayout', () => {
  it('recredits the local available balance via an idempotent ledger adjustment', async () => {
    const prisma = {
      connectAccountBalance: {
        findUnique: jest.fn(),
      },
    };
    const stripe = {
      stripe: {
        accounts: { retrieve: jest.fn() },
        payouts: { create: jest.fn() },
      },
    };
    const ledger = {
      debitAvailableForPayout: jest.fn(),
      creditAvailableByAdjustment: jest.fn().mockResolvedValue({ id: 'cle_adj_1' }),
    };
    prisma.connectAccountBalance.findUnique.mockResolvedValue({
      id: 'cab_seller_1',
      workspaceId: 'ws-1',
      stripeAccountId: 'acct_seller_1',
    });
    const financialAlert = {
      withdrawalFailed: jest.fn(),
    };
    const service = await buildService({ prisma, stripe, ledger, financialAlert });

    await service.handleFailedPayout({
      payoutId: 'po_123',
      accountBalanceId: 'cab_seller_1',
      requestId: 'po_req_1',
      amountCents: 5_000n,
    });

    expect(ledger.creditAvailableByAdjustment).toHaveBeenCalledWith({
      accountBalanceId: 'cab_seller_1',
      amountCents: 5_000n,
      reference: { type: 'payout_failed', id: 'po_123' },
      metadata: {
        requestId: 'po_req_1',
        stripePayoutId: 'po_123',
      },
    });
    expect(financialAlert.withdrawalFailed).toHaveBeenCalledWith(expect.any(Error), {
      workspaceId: 'ws-1',
      amount: 5000,
    });
  });
});
