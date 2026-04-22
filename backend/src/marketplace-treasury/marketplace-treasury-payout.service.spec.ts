import { Test, type TestingModule } from '@nestjs/testing';

import { FinancialAlertService } from '../common/financial-alert.service';
import { StripeService } from '../billing/stripe.service';

import { MarketplaceTreasuryPayoutService } from './marketplace-treasury-payout.service';
import {
  MarketplaceTreasuryInsufficientAvailableBalanceError,
  MarketplaceTreasuryService,
} from './marketplace-treasury.service';

async function buildService({
  stripe,
  wallet,
  financialAlert,
}: {
  stripe: Record<string, unknown>;
  wallet: Record<string, unknown>;
  financialAlert: Record<string, unknown>;
}) {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      MarketplaceTreasuryPayoutService,
      { provide: StripeService, useValue: stripe },
      { provide: MarketplaceTreasuryService, useValue: wallet },
      { provide: FinancialAlertService, useValue: financialAlert },
    ],
  }).compile();

  return moduleRef.get(MarketplaceTreasuryPayoutService);
}

describe('MarketplaceTreasuryPayoutService.createPayout', () => {
  it('creates a Stripe payout on the marketplace treasury account and debits the marketplace treasury with the same idempotency key', async () => {
    const stripe = {
      stripe: {
        payouts: {
          create: jest
            .fn()
            .mockResolvedValue({ id: 'po_marketplace_treasury_123', status: 'pending' }),
        },
      },
    };
    const wallet = {
      debitAvailableForPayout: jest.fn().mockResolvedValue(undefined),
      creditAvailableByAdjustment: jest.fn(),
    };
    const financialAlert = {
      withdrawalFailed: jest.fn(),
    };
    const service = await buildService({ stripe, wallet, financialAlert });

    const result = await service.createPayout({
      amountCents: 5_000n,
      requestId: 'marketplace_treasury_po_req_1',
      currency: 'BRL',
    });

    expect(wallet.debitAvailableForPayout).toHaveBeenCalledWith({
      currency: 'BRL',
      amountInCents: 5_000n,
      requestId: 'marketplace_treasury_po_req_1',
      metadata: {
        requestId: 'marketplace_treasury_po_req_1',
      },
    });
    expect(stripe.stripe.payouts.create).toHaveBeenCalledWith(
      {
        amount: 5000,
        currency: 'brl',
        metadata: {
          marketplaceTreasury: 'true',
          marketplaceTreasuryCurrency: 'BRL',
          requestId: 'marketplace_treasury_po_req_1',
        },
      },
      {
        idempotencyKey: 'marketplace_treasury_po_req_1',
      },
    );
    expect(wallet.creditAvailableByAdjustment).not.toHaveBeenCalled();
    expect(financialAlert.withdrawalFailed).not.toHaveBeenCalled();
    expect(result).toEqual({
      payoutId: 'po_marketplace_treasury_123',
      status: 'pending',
      amountCents: 5_000n,
      currency: 'BRL',
    });
  });

  it('recredits the marketplace treasury when Stripe payout creation fails after the local debit', async () => {
    const stripe = {
      stripe: {
        payouts: {
          create: jest.fn().mockRejectedValue(new Error('stripe timeout')),
        },
      },
    };
    const wallet = {
      debitAvailableForPayout: jest.fn().mockResolvedValue(undefined),
      creditAvailableByAdjustment: jest.fn().mockResolvedValue(undefined),
    };
    const financialAlert = {
      withdrawalFailed: jest.fn(),
    };
    const service = await buildService({ stripe, wallet, financialAlert });

    await expect(
      service.createPayout({
        amountCents: 5_000n,
        requestId: 'marketplace_treasury_po_req_timeout',
        currency: 'BRL',
      }),
    ).rejects.toThrow('stripe timeout');

    expect(wallet.creditAvailableByAdjustment).toHaveBeenCalledWith({
      currency: 'BRL',
      amountInCents: 5_000n,
      requestId: 'payout_failed_request:marketplace_treasury_po_req_timeout',
      reason: 'marketplace_treasury_payout_failed_request_credit',
      metadata: {
        requestId: 'marketplace_treasury_po_req_timeout',
      },
    });
    expect(financialAlert.withdrawalFailed).toHaveBeenCalledWith(expect.any(Error), {
      amount: 5000,
    });
  });

  it('propagates insufficient balance before touching Stripe', async () => {
    const stripe = {
      stripe: {
        payouts: {
          create: jest.fn(),
        },
      },
    };
    const wallet = {
      debitAvailableForPayout: jest
        .fn()
        .mockRejectedValue(
          new MarketplaceTreasuryInsufficientAvailableBalanceError('BRL', 5_000n, 999n),
        ),
      creditAvailableByAdjustment: jest.fn(),
    };
    const financialAlert = {
      withdrawalFailed: jest.fn(),
    };
    const service = await buildService({ stripe, wallet, financialAlert });

    await expect(
      service.createPayout({
        amountCents: 5_000n,
        requestId: 'marketplace_treasury_po_req_short',
        currency: 'BRL',
      }),
    ).rejects.toBeInstanceOf(MarketplaceTreasuryInsufficientAvailableBalanceError);

    expect(stripe.stripe.payouts.create).not.toHaveBeenCalled();
    expect(wallet.creditAvailableByAdjustment).not.toHaveBeenCalled();
    expect(financialAlert.withdrawalFailed).not.toHaveBeenCalled();
  });
});

describe('MarketplaceTreasuryPayoutService.handleFailedPayout', () => {
  it('recredits the marketplace treasury via an idempotent adjustment', async () => {
    const stripe = {
      stripe: {
        payouts: {
          create: jest.fn(),
        },
      },
    };
    const wallet = {
      debitAvailableForPayout: jest.fn(),
      creditAvailableByAdjustment: jest.fn().mockResolvedValue(undefined),
    };
    const financialAlert = {
      withdrawalFailed: jest.fn(),
    };
    const service = await buildService({ stripe, wallet, financialAlert });

    await service.handleFailedPayout({
      payoutId: 'po_marketplace_treasury_123',
      amountCents: 5_000n,
      requestId: 'marketplace_treasury_po_req_1',
      currency: 'BRL',
    });

    expect(wallet.creditAvailableByAdjustment).toHaveBeenCalledWith({
      currency: 'BRL',
      amountInCents: 5_000n,
      requestId: 'payout_failed:po_marketplace_treasury_123',
      reason: 'marketplace_treasury_payout_failed_credit',
      metadata: {
        requestId: 'marketplace_treasury_po_req_1',
        stripePayoutId: 'po_marketplace_treasury_123',
      },
    });
    expect(financialAlert.withdrawalFailed).toHaveBeenCalledWith(expect.any(Error), {
      amount: 5000,
    });
  });
});
