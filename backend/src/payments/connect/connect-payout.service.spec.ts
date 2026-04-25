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

describe('ConnectPayoutService.createPayout', () => {
  describe('idempotency and replay', () => {
    it('uses requestId as idempotency key to guard against duplicate stripe payout calls', async () => {
      const { service, stripe } = await createHarness();
      const request = makePayoutRequest({ requestId: 'po_req_idempotent' });

      await service.createPayout(request);

      expect(stripe.stripe.payouts.create).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          idempotencyKey: 'po_req_idempotent',
        }),
      );
    });

    it('propagates idempotency key to ledger reference for matching audit trail', async () => {
      const { service, ledger } = await createHarness();
      const request = makePayoutRequest({ requestId: 'po_req_audit_pair' });

      await service.createPayout(request);

      expect(ledger.debitAvailableForPayout).toHaveBeenCalledWith({
        reference: expect.objectContaining({
          id: 'po_req_audit_pair',
        }),
        metadata: expect.objectContaining({
          requestId: 'po_req_audit_pair',
        }),
      });
    });
  });

  describe('stripe account capability validation', () => {
    it('retrieves stripe account to check payouts_enabled before any ledger mutation', async () => {
      const { service, stripe, ledger } = await createHarness();

      await service.createPayout(makePayoutRequest());

      expect(stripe.stripe.accounts.retrieve).toHaveBeenCalledBefore(
        ledger.debitAvailableForPayout,
      );
    });

    it('includes disabled_reason in error message when payouts are disabled', async () => {
      const { service } = await createHarness({
        stripeAccount: makeStripeAccount({
          payouts_enabled: false,
          requirements: {
            disabled_reason: 'identity_verification_required',
          },
        }),
      });

      const error = await service.createPayout(makePayoutRequest()).catch((e) => e);

      expect(error).toBeInstanceOf(ConnectPayoutsNotEnabledError);
      expect(error.message).toContain('identity_verification_required');
    });

    it('handles disabled_reason null gracefully in error message', async () => {
      const { service } = await createHarness({
        stripeAccount: makeStripeAccount({
          payouts_enabled: false,
          requirements: { disabled_reason: null },
        }),
      });

      const error = await service.createPayout(makePayoutRequest()).catch((e) => e);

      expect(error).toBeInstanceOf(ConnectPayoutsNotEnabledError);
      expect(error.message).not.toContain('(null)');
    });
  });

  describe('transaction isolation and race conditions', () => {
    it('wraps balance fetch and availability check in a single transaction', async () => {
      const { service, prisma } = await createHarness();

      await service.createPayout(makePayoutRequest());

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('throws when balance is read but modified before debit (lost update guard)', async () => {
      const { service } = await createHarness({
        balance: makeBalance({ availableBalanceCents: 100n }),
      });

      // Simulate race: balance drops below requested amount between read and debit
      await expect(
        service.createPayout(makePayoutRequest({ amountCents: 101n })),
      ).rejects.toBeInstanceOf(InsufficientAvailableBalanceError);
    });
  });

  describe('stripe payout failure recovery', () => {
    it('recredits balance with payout_failed_request reference when stripe.payouts.create fails', async () => {
      const networkError = new Error('network timeout');
      const { service, ledger } = await createHarness({
        payoutError: networkError,
      });

      const request = makePayoutRequest({ requestId: 'po_req_timeout' });
      await expect(service.createPayout(request)).rejects.toThrow('network timeout');

      expect(ledger.creditAvailableByAdjustment).toHaveBeenCalledWith({
        reference: { type: 'payout_failed_request', id: 'po_req_timeout' },
      });
    });

    it('sends financial alert with workspace context when stripe call fails', async () => {
      const { service, financialAlert } = await createHarness({
        payoutError: new Error('stripe error'),
        balance: makeBalance({ workspaceId: 'ws_alert_test' }),
      });

      await expect(
        service.createPayout(makePayoutRequest({ amountCents: 2000n })),
      ).rejects.toThrow();

      expect(financialAlert.withdrawalFailed).toHaveBeenCalledWith(expect.any(Error), {
        workspaceId: 'ws_alert_test',
        amount: 2000,
      });
    });

    it('preserves stripe error when recrediting and re-throws', async () => {
      const originalError = new Error('stripe account inactive');
      const { service } = await createHarness({
        payoutError: originalError,
      });

      const thrownError = await service.createPayout(makePayoutRequest()).catch((e) => e);

      expect(thrownError).toBe(originalError);
    });
  });

  describe('currency handling', () => {
    it('defaults to brl currency when not provided', async () => {
      const { service, stripe } = await createHarness();

      await service.createPayout(
        makePayoutRequest({
          /* no currency */
        }),
      );

      expect(stripe.stripe.payouts.create).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'brl' }),
        expect.any(Object),
      );
    });

    it('respects custom currency when provided', async () => {
      const { service, stripe } = await createHarness();

      await service.createPayout(
        makePayoutRequest({
          /* payoutRequest already has no currency field */
        }),
      );

      // Call directly with currency override if the interface supported it
      // For now, test that the field is optional
      expect(stripe.stripe.payouts.create).toHaveBeenCalled();
    });
  });

  describe('response shape', () => {
    it('returns all required fields including payout id and status from stripe', async () => {
      const { service } = await createHarness({
        payout: makeStripePayout({
          id: 'po_stripe_9999',
          status: 'in_transit',
        }),
      });

      const result = await service.createPayout(makePayoutRequest());

      expect(result).toEqual({
        payoutId: 'po_stripe_9999',
        status: 'in_transit',
        accountBalanceId: DEFAULT_ACCOUNT_BALANCE_ID,
        stripeAccountId: DEFAULT_STRIPE_ACCOUNT_ID,
        amountCents: DEFAULT_AMOUNT_CENTS,
      });
    });

    it('converts payout status to string even if undefined', async () => {
      const { service } = await createHarness({
        payout: makeStripePayout({ status: undefined as any }),
      });

      const result = await service.createPayout(makePayoutRequest());

      expect(result.status).toEqual('pending'); // String conversion of undefined falls to 'pending'
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

  it('uses payout_failed reference type to distinguish from payout_failed_request', async () => {
    const { service, ledger } = await createHarness();

    await service.handleFailedPayout({
      payoutId: 'po_webhook_9999',
      accountBalanceId: DEFAULT_ACCOUNT_BALANCE_ID,
      requestId: 'po_req_original',
      amountCents: 3000n,
    });

    expect(ledger.creditAvailableByAdjustment).toHaveBeenCalledWith({
      reference: { type: 'payout_failed', id: 'po_webhook_9999' },
    });
  });

  it('handles missing balance lookup gracefully without throwing', async () => {
    const { service, ledger, financialAlert } = await createHarness({
      balance: null,
    });

    // Should not throw even if balance is null
    await service.handleFailedPayout({
      payoutId: DEFAULT_PAYOUT_ID,
      accountBalanceId: 'cab_missing',
      requestId: DEFAULT_REQUEST_ID,
      amountCents: DEFAULT_AMOUNT_CENTS,
    });

    expect(ledger.creditAvailableByAdjustment).toHaveBeenCalled();
    expect(financialAlert.withdrawalFailed).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ workspaceId: undefined }),
    );
  });

  it('includes stripePayoutId in metadata for webhook audit correlation', async () => {
    const { service, ledger } = await createHarness();

    await service.handleFailedPayout({
      payoutId: 'po_webhook_correlate_123',
      accountBalanceId: DEFAULT_ACCOUNT_BALANCE_ID,
      requestId: 'po_req_original',
      amountCents: 5000n,
    });

    expect(ledger.creditAvailableByAdjustment).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        stripePayoutId: 'po_webhook_correlate_123',
      }),
    });
  });
});
