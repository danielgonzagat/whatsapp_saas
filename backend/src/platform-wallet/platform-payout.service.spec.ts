import { Test, type TestingModule } from '@nestjs/testing';

import { FinancialAlertService } from '../common/financial-alert.service';
import { StripeService } from '../billing/stripe.service';

import { PlatformPayoutService } from './platform-payout.service';
import {
  PlatformWalletInsufficientAvailableBalanceError,
  PlatformWalletService,
} from './platform-wallet.service';

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
      PlatformPayoutService,
      { provide: StripeService, useValue: stripe },
      { provide: PlatformWalletService, useValue: wallet },
      { provide: FinancialAlertService, useValue: financialAlert },
    ],
  }).compile();

  return moduleRef.get(PlatformPayoutService);
}

describe('PlatformPayoutService.createPayout', () => {
  it('creates a Stripe payout on the platform account and debits the platform wallet with the same idempotency key', async () => {
    const stripe = {
      stripe: {
        payouts: {
          create: jest.fn().mockResolvedValue({ id: 'po_platform_123', status: 'pending' }),
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
      requestId: 'platform_po_req_1',
      currency: 'BRL',
    });

    expect(wallet.debitAvailableForPayout).toHaveBeenCalledWith({
      currency: 'BRL',
      amountInCents: 5_000n,
      requestId: 'platform_po_req_1',
      metadata: {
        requestId: 'platform_po_req_1',
      },
    });
    expect(stripe.stripe.payouts.create).toHaveBeenCalledWith(
      {
        amount: 5000,
        currency: 'brl',
        metadata: {
          platformWallet: 'true',
          platformWalletCurrency: 'BRL',
          requestId: 'platform_po_req_1',
        },
      },
      {
        idempotencyKey: 'platform_po_req_1',
      },
    );
    expect(wallet.creditAvailableByAdjustment).not.toHaveBeenCalled();
    expect(financialAlert.withdrawalFailed).not.toHaveBeenCalled();
    expect(result).toEqual({
      payoutId: 'po_platform_123',
      status: 'pending',
      amountCents: 5_000n,
      currency: 'BRL',
    });
  });

  it('recredits the platform wallet when Stripe payout creation fails after the local debit', async () => {
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
        requestId: 'platform_po_req_timeout',
        currency: 'BRL',
      }),
    ).rejects.toThrow('stripe timeout');

    expect(wallet.creditAvailableByAdjustment).toHaveBeenCalledWith({
      currency: 'BRL',
      amountInCents: 5_000n,
      requestId: 'payout_failed_request:platform_po_req_timeout',
      reason: 'platform_wallet_payout_failed_request_credit',
      metadata: {
        requestId: 'platform_po_req_timeout',
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
          new PlatformWalletInsufficientAvailableBalanceError('BRL', 5_000n, 999n),
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
        requestId: 'platform_po_req_short',
        currency: 'BRL',
      }),
    ).rejects.toBeInstanceOf(PlatformWalletInsufficientAvailableBalanceError);

    expect(stripe.stripe.payouts.create).not.toHaveBeenCalled();
    expect(wallet.creditAvailableByAdjustment).not.toHaveBeenCalled();
    expect(financialAlert.withdrawalFailed).not.toHaveBeenCalled();
  });
});

describe('PlatformPayoutService.handleFailedPayout', () => {
  it('recredits the platform wallet via an idempotent adjustment', async () => {
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
      payoutId: 'po_platform_123',
      amountCents: 5_000n,
      requestId: 'platform_po_req_1',
      currency: 'BRL',
    });

    expect(wallet.creditAvailableByAdjustment).toHaveBeenCalledWith({
      currency: 'BRL',
      amountInCents: 5_000n,
      requestId: 'payout_failed:po_platform_123',
      reason: 'platform_wallet_payout_failed_credit',
      metadata: {
        requestId: 'platform_po_req_1',
        stripePayoutId: 'po_platform_123',
      },
    });
    expect(financialAlert.withdrawalFailed).toHaveBeenCalledWith(expect.any(Error), {
      amount: 5000,
    });
  });
});
