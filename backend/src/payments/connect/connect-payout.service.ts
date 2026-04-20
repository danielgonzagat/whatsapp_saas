import { Injectable } from '@nestjs/common';

import { StripeService } from '../../billing/stripe.service';
import type { StripeAccount } from '../../billing/stripe-types';
import { FinancialAlertService } from '../../common/financial-alert.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccountBalanceNotFoundError,
  InsufficientAvailableBalanceError,
} from '../ledger/ledger.types';
import { LedgerService } from '../ledger/ledger.service';

/** Create connect payout input shape. */
export interface CreateConnectPayoutInput {
  /** Account balance id property. */
  accountBalanceId: string;
  /** Amount cents property. */
  amountCents: bigint;
  /** Request id property. */
  requestId: string;
  /** Currency property. */
  currency?: string;
}

/** Create connect payout result shape. */
export interface CreateConnectPayoutResult {
  /** Payout id property. */
  payoutId: string;
  /** Status property. */
  status: string;
  /** Account balance id property. */
  accountBalanceId: string;
  /** Stripe account id property. */
  stripeAccountId: string;
  /** Amount cents property. */
  amountCents: bigint;
}

/** Handle failed connect payout input shape. */
export interface HandleFailedConnectPayoutInput {
  /** Payout id property. */
  payoutId: string;
  /** Account balance id property. */
  accountBalanceId: string;
  /** Request id property. */
  requestId: string;
  /** Amount cents property. */
  amountCents: bigint;
}

/** Connect payouts not enabled error. */
export class ConnectPayoutsNotEnabledError extends Error {
  constructor(
    public readonly accountBalanceId: string,
    public readonly stripeAccountId: string,
    public readonly disabledReason: string | null,
  ) {
    super(
      `Stripe connected account ${stripeAccountId} cannot receive payouts for ${accountBalanceId}${
        disabledReason ? ` (${disabledReason})` : ''
      }.`,
    );
    this.name = 'ConnectPayoutsNotEnabledError';
  }
}

/**
 * Executes Kloel-controlled manual payouts for Stripe Custom connected
 * accounts. Provider call happens with a caller-supplied request id as the
 * Stripe idempotency key; the ledger debit reuses the same request id so
 * retries remain one-payout/one-ledger-debit end-to-end.
 */
@Injectable()
export class ConnectPayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly ledgerService: LedgerService,
    private readonly financialAlert: FinancialAlertService,
  ) {}

  /** Create payout. */
  async createPayout(input: CreateConnectPayoutInput): Promise<CreateConnectPayoutResult> {
    const balance = await this.prisma.connectAccountBalance.findUnique({
      where: { id: input.accountBalanceId },
    });
    if (!balance) {
      throw new AccountBalanceNotFoundError(input.accountBalanceId);
    }

    if (balance.availableBalanceCents < input.amountCents) {
      throw new InsufficientAvailableBalanceError(
        balance.id,
        input.amountCents,
        balance.availableBalanceCents,
      );
    }

    const account = (await this.stripeService.stripe.accounts.retrieve(
      balance.stripeAccountId,
    )) as StripeAccount;
    if (!account.payouts_enabled) {
      throw new ConnectPayoutsNotEnabledError(
        balance.id,
        balance.stripeAccountId,
        account.requirements?.disabled_reason ?? null,
      );
    }

    await this.ledgerService.debitAvailableForPayout({
      accountBalanceId: balance.id,
      amountCents: input.amountCents,
      reference: { type: 'payout', id: input.requestId },
      metadata: {
        requestId: input.requestId,
        stripeAccountId: balance.stripeAccountId,
      },
    });

    let payout;
    try {
      payout = await this.stripeService.stripe.payouts.create(
        {
          amount: Number(input.amountCents),
          currency: input.currency ?? 'brl',
          metadata: {
            accountBalanceId: balance.id,
            requestId: input.requestId,
          },
        },
        {
          stripeAccount: balance.stripeAccountId,
          idempotencyKey: input.requestId,
        },
      );
    } catch (error) {
      await this.ledgerService.creditAvailableByAdjustment({
        accountBalanceId: balance.id,
        amountCents: input.amountCents,
        reference: { type: 'payout_failed_request', id: input.requestId },
        metadata: {
          requestId: input.requestId,
          stripeAccountId: balance.stripeAccountId,
        },
      });
      this.financialAlert.withdrawalFailed(
        error instanceof Error ? error : new Error(String(error)),
        {
          workspaceId: balance.workspaceId,
          amount: Number(input.amountCents),
        },
      );
      throw error;
    }

    return {
      payoutId: payout.id,
      status: String(payout.status ?? 'pending'),
      accountBalanceId: balance.id,
      stripeAccountId: balance.stripeAccountId,
      amountCents: input.amountCents,
    };
  }

  /** Handle failed payout. */
  async handleFailedPayout(input: HandleFailedConnectPayoutInput): Promise<void> {
    await this.ledgerService.creditAvailableByAdjustment({
      accountBalanceId: input.accountBalanceId,
      amountCents: input.amountCents,
      reference: { type: 'payout_failed', id: input.payoutId },
      metadata: {
        requestId: input.requestId,
        stripePayoutId: input.payoutId,
      },
    });
    const balance = await this.prisma.connectAccountBalance.findUnique({
      where: { id: input.accountBalanceId },
      select: { workspaceId: true },
    });
    this.financialAlert.withdrawalFailed(
      new Error(`Stripe payout.failed webhook ${input.payoutId}`),
      {
        workspaceId: balance?.workspaceId,
        amount: Number(input.amountCents),
      },
    );
  }
}
