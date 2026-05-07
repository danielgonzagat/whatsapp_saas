/**
 * Shared test helpers for the ConnectPayoutService spec suite.
 *
 * Stripe payouts have several semantic surfaces (createPayout, idempotency,
 * capability checks, failure recovery, currency, response shape and the
 * separate handleFailedPayout path). They share Prisma/Stripe/Ledger mocks, so
 * the typed builders live here to keep each spec file under the architecture
 * line cap.
 */
import { Test, type TestingModule } from '@nestjs/testing';

import { FinancialAlertService } from '../../common/financial-alert.service';
import { StripeService } from '../../billing/stripe.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';

import { ConnectPayoutService } from './connect-payout.service';

export const DEFAULT_ACCOUNT_BALANCE_ID = 'cab_seller_1';
export const DEFAULT_STRIPE_ACCOUNT_ID = 'acct_seller_1';
export const DEFAULT_WORKSPACE_ID = 'ws-1';
export const DEFAULT_REQUEST_ID = 'po_req_1';
export const DEFAULT_PAYOUT_ID = 'po_123';
export const DEFAULT_AMOUNT_CENTS = 5_000n;

export function makeBalance(overrides: Record<string, unknown> = {}) {
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
    disabled_reason?: string | null;
  };
};

/**
 * Mirrors the subset of Stripe.Payout the service consumes. `status` is
 * optional so tests can exercise the `payout.status ?? 'pending'` fallback in
 * production code without resorting to type bypasses.
 */
type StripePayoutRecord = {
  id: string;
  status?: string;
};

type LedgerEntryRecord = {
  id: string;
};

type PrismaMock = {
  connectAccountBalance: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
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

type BuildServiceDeps = {
  prisma: PrismaMock;
  stripe: StripeMock;
  ledger: LedgerMock;
  financialAlert: FinancialAlertMock;
};

async function buildService(deps: BuildServiceDeps) {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      ConnectPayoutService,
      { provide: PrismaService, useValue: deps.prisma },
      { provide: StripeService, useValue: deps.stripe },
      { provide: LedgerService, useValue: deps.ledger },
      { provide: FinancialAlertService, useValue: deps.financialAlert },
    ],
  }).compile();

  return moduleRef.get(ConnectPayoutService);
}

export function makeStripeAccount(
  overrides: Partial<StripeAccountRecord> = {},
): StripeAccountRecord {
  return {
    id: DEFAULT_STRIPE_ACCOUNT_ID,
    payouts_enabled: true,
    ...overrides,
  };
}

export function makeStripePayout(overrides: Partial<StripePayoutRecord> = {}): StripePayoutRecord {
  return {
    id: DEFAULT_PAYOUT_ID,
    status: 'pending',
    ...overrides,
  };
}

export function makeLedgerEntry(id: string): LedgerEntryRecord {
  return { id };
}

export function makePayoutRequest(
  overrides: Partial<{
    accountBalanceId: string;
    workspaceId: string;
    amountCents: bigint;
    requestId: string;
  }> = {},
) {
  return {
    accountBalanceId: DEFAULT_ACCOUNT_BALANCE_ID,
    workspaceId: DEFAULT_WORKSPACE_ID,
    amountCents: DEFAULT_AMOUNT_CENTS,
    requestId: DEFAULT_REQUEST_ID,
    ...overrides,
  };
}

export function makeLedgerMetadata(
  requestId: string,
  stripeAccountId: string = DEFAULT_STRIPE_ACCOUNT_ID,
) {
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

export async function createHarness(options: HarnessOptions = {}) {
  const balanceValue = options.balance === undefined ? makeBalance() : options.balance;
  const prisma: PrismaMock = {
    connectAccountBalance: {
      findUnique: jest.fn().mockResolvedValue(balanceValue),
      findFirst: jest.fn().mockResolvedValue(balanceValue),
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
