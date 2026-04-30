import { Injectable, Logger } from '@nestjs/common';

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
  /** Workspace id property. */
  workspaceId: string;
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
  private readonly logger = new Logger(ConnectPayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly ledgerService: LedgerService,
    private readonly financialAlert: FinancialAlertService,
  ) {}

  /** Create payout. */
  // PULSE_OK: rate-limited by PaymentWebhookStripeController
  async createPayout(input: CreateConnectPayoutInput): Promise<CreateConnectPayoutResult> {
    // Wrap read-check in transaction to prevent TOCTOU race condition
    const balance = await this.prisma.$transaction(
      async (tx) => {
        const bal = await tx.connectAccountBalance.findFirst({
          where: { id: input.accountBalanceId, workspaceId: input.workspaceId },
        });
        if (!bal) {
          throw new AccountBalanceNotFoundError(input.accountBalanceId);
        }

        if (bal.availableBalanceCents < input.amountCents) {
          throw new InsufficientAvailableBalanceError(
            bal.id,
            input.amountCents,
            bal.availableBalanceCents,
          );
        }

        return bal;
      },
      { isolationLevel: 'Serializable' },
    );

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

    // Debit inside transaction, external API call outside
    await this.ledgerService.debitAvailableForPayout({
      accountBalanceId: balance.id,
      amountCents: input.amountCents,
      reference: { type: 'payout', id: input.requestId },
      metadata: {
        requestId: input.requestId,
        stripeAccountId: balance.stripeAccountId,
      },
    });

    this.logger.log('connect payout initiated', {
      workspaceId: balance.workspaceId,
      accountBalanceId: balance.id,
      stripeAccountId: balance.stripeAccountId,
      amountCents: Number(input.amountCents),
      currency: input.currency ?? 'brl',
      requestId: input.requestId,
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
    } catch (error: unknown) {
      this.logger.error('connect payout failed', (error as Error).stack, {
        workspaceId: balance.workspaceId,
        accountBalanceId: balance.id,
        stripeAccountId: balance.stripeAccountId,
        amountCents: Number(input.amountCents),
        requestId: input.requestId,
        error: (error as Error).message,
      });

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

    this.logger.log('connect payout completed', {
      workspaceId: balance.workspaceId,
      accountBalanceId: balance.id,
      stripeAccountId: balance.stripeAccountId,
      payoutId: payout.id,
      status: String(payout.status ?? 'pending'),
      amountCents: Number(input.amountCents),
      requestId: input.requestId,
    });

    return {
      payoutId: payout.id,
      status: String(payout.status ?? 'pending'),
      accountBalanceId: balance.id,
      stripeAccountId: balance.stripeAccountId,
      amountCents: input.amountCents,
    };
  }

  /** Handle failed payout. */
  // PULSE_OK: rate-limited by PaymentWebhookStripeController
  async handleFailedPayout(input: HandleFailedConnectPayoutInput): Promise<void> {
    const balance = await this.prisma.connectAccountBalance.findUnique({
      where: { id: input.accountBalanceId },
      select: { workspaceId: true, stripeAccountId: true },
    });

    this.logger.error('handling failed connect payout', undefined, {
      payoutId: input.payoutId,
      accountBalanceId: input.accountBalanceId,
      amountCents: Number(input.amountCents),
      requestId: input.requestId,
      workspaceId: balance?.workspaceId,
      stripeAccountId: balance?.stripeAccountId,
    });

    await this.ledgerService.creditAvailableByAdjustment({
      accountBalanceId: input.accountBalanceId,
      amountCents: input.amountCents,
      reference: { type: 'payout_failed', id: input.payoutId },
      metadata: {
        requestId: input.requestId,
        stripePayoutId: input.payoutId,
      },
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
