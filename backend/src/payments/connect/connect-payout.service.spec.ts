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

const DEFAULT_ACCOUNT_BALANCE_ID = 'cab_seller_1';
const DEFAULT_STRIPE_ACCOUNT_ID = 'acct_seller_1';
const DEFAULT_WORKSPACE_ID = 'ws-1';
const DEFAULT_REQUEST_ID = 'po_req_1';
const DEFAULT_PAYOUT_ID = 'po_123';
const DEFAULT_AMOUNT_CENTS = 5_000n;

function makeBalance(overrides: Record<string, unknown> = {}) {
  return {
    id: DEFAULT_ACCOUNT_BALANCE_ID,
    workspaceId: DEFAULT_WORKSPACE_ID,
    stripeAccountId: DEFAULT_STRIPE_ACCOUNT_ID,
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

type BalanceRecord = ReturnType<typeof makeBalance>;

type StripeAccountRecord = {
  id: string;
  payouts_enabled: boolean;
  requirements?: {
    disabled_reason?: string;
  };
};

type StripePayoutRecord = {
  id: string;
  status: string;
};

type LedgerEntryRecord = {
  id: string;
};

type PrismaMock = {
  connectAccountBalance: {
    findUnique: jest.Mock;
  };
  $transaction: jest.Mock;
};

type StripeMock = {
  stripe: {
    accounts: {
      retrieve: jest.Mock;
    };
    payouts: {
      create: jest.Mock;
    };
  };
};

type LedgerMock = {
  debitAvailableForPayout: jest.Mock;
  creditAvailableByAdjustment: jest.Mock;
};

type FinancialAlertMock = {
  withdrawalFailed: jest.Mock;
};

async function buildService({
  prisma,
  stripe,
  ledger,
  financialAlert,
}: {
  prisma: PrismaMock;
  stripe: StripeMock;
  ledger: LedgerMock;
  financialAlert: FinancialAlertMock;
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

function makeStripeAccount(overrides: Partial<StripeAccountRecord> = {}): StripeAccountRecord {
  return {
    id: DEFAULT_STRIPE_ACCOUNT_ID,
    payouts_enabled: true,
    ...overrides,
  };
}

function makeStripePayout(overrides: Partial<StripePayoutRecord> = {}): StripePayoutRecord {
  return {
    id: DEFAULT_PAYOUT_ID,
    status: 'pending',
    ...overrides,
  };
}

function makeLedgerEntry(id: string): LedgerEntryRecord {
  return { id };
}

function makePayoutRequest(
  overrides: Partial<{
    accountBalanceId: string;
    amountCents: bigint;
    requestId: string;
  }> = {},
) {
  return {
    accountBalanceId: DEFAULT_ACCOUNT_BALANCE_ID,
    amountCents: DEFAULT_AMOUNT_CENTS,
    requestId: DEFAULT_REQUEST_ID,
    ...overrides,
  };
}

function makeLedgerMetadata(requestId: string, stripeAccountId = DEFAULT_STRIPE_ACCOUNT_ID) {
  return {
    requestId,
    stripeAccountId,
  };
}

type HarnessOptions = {
  balance?: BalanceRecord | null;
  stripeAccount?: StripeAccountRecord;
  payout?: StripePayoutRecord;
  payoutError?: Error;
  debitResult?: LedgerEntryRecord;
  creditResult?: LedgerEntryRecord;
};

async function createHarness(options: HarnessOptions = {}) {
  const prisma: PrismaMock = {
    connectAccountBalance: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.balance === undefined ? makeBalance() : options.balance),
    },
    $transaction: jest
      .fn()
      .mockImplementation(async (callback: (tx: PrismaMock) => Promise<unknown>) =>
        callback(prisma),
      ),
  };

  const stripe: StripeMock = {
    stripe: {
      accounts: {
        retrieve: jest.fn().mockResolvedValue(options.stripeAccount ?? makeStripeAccount()),
      },
      payouts: {
        create: options.payoutError
          ? jest.fn().mockRejectedValue(options.payoutError)
          : jest.fn().mockResolvedValue(options.payout ?? makeStripePayout()),
      },
    },
  };

  const ledger: LedgerMock = {
    debitAvailableForPayout: jest
      .fn()
      .mockResolvedValue(options.debitResult ?? makeLedgerEntry('cle_po_1')),
    creditAvailableByAdjustment: jest
      .fn()
      .mockResolvedValue(options.creditResult ?? makeLedgerEntry('cle_adj_1')),
  };

  const financialAlert: FinancialAlertMock = {
    withdrawalFailed: jest.fn(),
  };

  const service = await buildService({ prisma, stripe, ledger, financialAlert });

  return {
    service,
    prisma,
    stripe,
    ledger,
    financialAlert,
  };
}

describe('ConnectPayoutService.createPayout', () => {
  it('creates a Stripe payout on the connected account and debits the ledger with the same idempotency key', async () => {
    const { service, stripe, ledger, financialAlert } = await createHarness({
      creditResult: makeLedgerEntry('cle_adj_unused'),
    });

    const request = makePayoutRequest();
    const result = await service.createPayout(request);

    expect(stripe.stripe.payouts.create).toHaveBeenCalledWith(
      {
        amount: Number(request.amountCents),
        currency: 'brl',
        metadata: {
          accountBalanceId: request.accountBalanceId,
          requestId: request.requestId,
        },
      },
      {
        stripeAccount: DEFAULT_STRIPE_ACCOUNT_ID,
        idempotencyKey: request.requestId,
      },
    );
    expect(ledger.debitAvailableForPayout).toHaveBeenCalledWith({
      accountBalanceId: request.accountBalanceId,
      amountCents: request.amountCents,
      reference: { type: 'payout', id: request.requestId },
      metadata: makeLedgerMetadata(request.requestId),
    });
    expect(ledger.creditAvailableByAdjustment).not.toHaveBeenCalled();
    expect(financialAlert.withdrawalFailed).not.toHaveBeenCalled();
    expect(result).toEqual({
      payoutId: DEFAULT_PAYOUT_ID,
      status: 'pending',
      accountBalanceId: request.accountBalanceId,
      stripeAccountId: DEFAULT_STRIPE_ACCOUNT_ID,
      amountCents: request.amountCents,
    });
  });

  it('throws when the account balance does not exist', async () => {
    const { service, stripe, financialAlert } = await createHarness({
      balance: null,
    });

    await expect(
      service.createPayout(
        makePayoutRequest({
          accountBalanceId: 'cab_missing',
          amountCents: 1_000n,
          requestId: 'po_req_missing',
        }),
      ),
    ).rejects.toBeInstanceOf(AccountBalanceNotFoundError);
    expect(stripe.stripe.payouts.create).not.toHaveBeenCalled();
    expect(stripe.stripe.accounts.retrieve).not.toHaveBeenCalled();
    expect(financialAlert.withdrawalFailed).not.toHaveBeenCalled();
  });

  it('throws before touching Stripe when available balance is insufficient', async () => {
    const { service, stripe, financialAlert } = await createHarness({
      balance: makeBalance({ availableBalanceCents: 999n }),
    });

    await expect(
      service.createPayout(
        makePayoutRequest({
          amountCents: 1_000n,
          requestId: 'po_req_short',
        }),
      ),
    ).rejects.toBeInstanceOf(InsufficientAvailableBalanceError);
    expect(stripe.stripe.accounts.retrieve).not.toHaveBeenCalled();
    expect(stripe.stripe.payouts.create).not.toHaveBeenCalled();
    expect(financialAlert.withdrawalFailed).not.toHaveBeenCalled();
  });

  it('blocks payout execution before ledger debit when Stripe payouts are disabled', async () => {
    const { service, stripe, ledger } = await createHarness({
      stripeAccount: makeStripeAccount({
        payouts_enabled: false,
        requirements: {
          disabled_reason: 'requirements.pending_verification',
        },
      }),
    });

    await expect(
      service.createPayout(
        makePayoutRequest({
          amountCents: 1_000n,
          requestId: 'po_req_disabled',
        }),
      ),
    ).rejects.toBeInstanceOf(ConnectPayoutsNotEnabledError);

    expect(stripe.stripe.accounts.retrieve).toHaveBeenCalledWith(DEFAULT_STRIPE_ACCOUNT_ID);
    expect(ledger.debitAvailableForPayout).not.toHaveBeenCalled();
    expect(stripe.stripe.payouts.create).not.toHaveBeenCalled();
  });

  it('recredits the local balance if Stripe payout creation fails synchronously after the local debit', async () => {
    const stripeTimeout = new Error('stripe timeout');
    const { service, ledger, financialAlert } = await createHarness({
      payoutError: stripeTimeout,
    });

    const request = makePayoutRequest({
      requestId: 'po_req_timeout',
    });

    await expect(service.createPayout(request)).rejects.toThrow('stripe timeout');

    expect(ledger.debitAvailableForPayout).toHaveBeenCalledWith({
      accountBalanceId: request.accountBalanceId,
      amountCents: request.amountCents,
      reference: { type: 'payout', id: request.requestId },
      metadata: makeLedgerMetadata(request.requestId),
    });
    expect(ledger.creditAvailableByAdjustment).toHaveBeenCalledWith({
      accountBalanceId: request.accountBalanceId,
      amountCents: request.amountCents,
      reference: { type: 'payout_failed_request', id: request.requestId },
      metadata: {
        requestId: request.requestId,
        stripeAccountId: DEFAULT_STRIPE_ACCOUNT_ID,
      },
    });
    expect(financialAlert.withdrawalFailed).toHaveBeenCalledWith(expect.any(Error), {
      workspaceId: DEFAULT_WORKSPACE_ID,
      amount: Number(request.amountCents),
    });
  });
});

describe('ConnectPayoutService.handleFailedPayout', () => {
  it('recredits the local available balance via an idempotent ledger adjustment', async () => {
    const { service, prisma, ledger, financialAlert } = await createHarness({
      balance: makeBalance(),
    });

    await service.handleFailedPayout({
      payoutId: DEFAULT_PAYOUT_ID,
      accountBalanceId: DEFAULT_ACCOUNT_BALANCE_ID,
      requestId: DEFAULT_REQUEST_ID,
      amountCents: DEFAULT_AMOUNT_CENTS,
    });

    expect(prisma.connectAccountBalance.findUnique).toHaveBeenCalledWith({
      where: { id: DEFAULT_ACCOUNT_BALANCE_ID },
      select: { workspaceId: true },
    });
    expect(ledger.creditAvailableByAdjustment).toHaveBeenCalledWith({
      accountBalanceId: DEFAULT_ACCOUNT_BALANCE_ID,
      amountCents: DEFAULT_AMOUNT_CENTS,
      reference: { type: 'payout_failed', id: DEFAULT_PAYOUT_ID },
      metadata: {
        requestId: DEFAULT_REQUEST_ID,
        stripePayoutId: DEFAULT_PAYOUT_ID,
      },
    });
    expect(financialAlert.withdrawalFailed).toHaveBeenCalledWith(expect.any(Error), {
      workspaceId: DEFAULT_WORKSPACE_ID,
      amount: Number(DEFAULT_AMOUNT_CENTS),
    });
  });
});
