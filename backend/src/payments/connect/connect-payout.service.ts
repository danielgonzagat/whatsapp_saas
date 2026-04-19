import { Injectable } from '@nestjs/common';

import { StripeService } from '../../billing/stripe.service';
import { FinancialAlertService } from '../../common/financial-alert.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccountBalanceNotFoundError,
  InsufficientAvailableBalanceError,
} from '../ledger/ledger.types';
import { LedgerService } from '../ledger/ledger.service';

export interface CreateConnectPayoutInput {
  accountBalanceId: string;
  amountCents: bigint;
  requestId: string;
  currency?: string;
}

export interface CreateConnectPayoutResult {
  payoutId: string;
  status: string;
  accountBalanceId: string;
  stripeAccountId: string;
  amountCents: bigint;
}

export interface HandleFailedConnectPayoutInput {
  payoutId: string;
  accountBalanceId: string;
  requestId: string;
  amountCents: bigint;
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
