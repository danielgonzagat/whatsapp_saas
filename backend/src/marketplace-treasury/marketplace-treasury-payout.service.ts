import { Injectable } from '@nestjs/common';

import { StripeService } from '../billing/stripe.service';
import { FinancialAlertService } from '../common/financial-alert.service';

import { MarketplaceTreasuryService } from './marketplace-treasury.service';

/** Create marketplace treasury payout input shape. */
export interface CreateMarketplaceTreasuryPayoutInput {
  /** Amount cents property. */
  amountCents: bigint;
  /** Request id property. */
  requestId: string;
  /** Currency property. */
  currency?: string;
}

/** Create marketplace treasury payout result shape. */
export interface CreateMarketplaceTreasuryPayoutResult {
  /** Payout id property. */
  payoutId: string;
  /** Status property. */
  status: string;
  /** Amount cents property. */
  amountCents: bigint;
  /** Currency property. */
  currency: string;
}

/** Handle failed marketplace treasury payout input shape. */
export interface HandleFailedMarketplaceTreasuryPayoutInput {
  /** Payout id property. */
  payoutId: string;
  /** Amount cents property. */
  amountCents: bigint;
  /** Request id property. */
  requestId: string;
  /** Currency property. */
  currency?: string;
}

/** Marketplace treasury payout service. */
@Injectable()
export class MarketplaceTreasuryPayoutService {
  constructor(
    private readonly stripeService: StripeService,
    private readonly wallet: MarketplaceTreasuryService,
    private readonly financialAlert: FinancialAlertService,
  ) {}

  /** Create payout. */
  async createPayout(
    input: CreateMarketplaceTreasuryPayoutInput,
  ): Promise<CreateMarketplaceTreasuryPayoutResult> {
    const currency = (input.currency ?? 'BRL').toUpperCase();

    await this.wallet.debitAvailableForPayout({
      currency,
      amountInCents: input.amountCents,
      requestId: input.requestId,
      metadata: {
        requestId: input.requestId,
      },
    });

    try {
      const payout = await this.stripeService.stripe.payouts.create(
        {
          amount: Number(input.amountCents),
          currency: currency.toLowerCase(),
          metadata: {
            marketplaceTreasury: 'true',
            marketplaceTreasuryCurrency: currency,
            requestId: input.requestId,
          },
        },
        {
          idempotencyKey: input.requestId,
        },
      );

      return {
        payoutId: payout.id,
        status: String(payout.status ?? 'pending'),
        amountCents: input.amountCents,
        currency,
      };
    } catch (error) {
      await this.wallet.creditAvailableByAdjustment({
        currency,
        amountInCents: input.amountCents,
        requestId: `payout_failed_request:${input.requestId}`,
        reason: 'marketplace_treasury_payout_failed_request_credit',
        metadata: {
          requestId: input.requestId,
        },
      });
      this.financialAlert.withdrawalFailed(
        error instanceof Error ? error : new Error(String(error)),
        {
          amount: Number(input.amountCents),
        },
      );
      throw error;
    }
  }

  /** Handle failed payout. */
  async handleFailedPayout(input: HandleFailedMarketplaceTreasuryPayoutInput): Promise<void> {
    const currency = (input.currency ?? 'BRL').toUpperCase();

    await this.wallet.creditAvailableByAdjustment({
      currency,
      amountInCents: input.amountCents,
      requestId: `payout_failed:${input.payoutId}`,
      reason: 'marketplace_treasury_payout_failed_credit',
      metadata: {
        requestId: input.requestId,
        stripePayoutId: input.payoutId,
      },
    });
    this.financialAlert.withdrawalFailed(
      new Error(`Stripe payout.failed webhook ${input.payoutId}`),
      {
        amount: Number(input.amountCents),
      },
    );
  }
}
