import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import type { ConnectAccountBalance } from '@prisma/client';

import { StripeService } from '../../billing/stripe.service';
import type { StripeAccount } from '../../billing/stripe-types';
import { PrismaService } from '../../prisma/prisma.service';

import {
  ConnectAccountAlreadyExistsError,
  type CreateCustomAccountInput,
  type CreateCustomAccountResult,
  type OnboardingStatus,
  type SubmitOnboardingProfileInput,
} from './connect.types';
import {
  buildCreateCustomAccountPayload,
  buildOnboardingAccountUpdate,
  CONNECT_REQUESTED_CAPABILITIES,
  projectOnboardingStatus,
  shouldRetryWithoutManualPayoutSchedule,
  stripManualPayoutSchedule,
} from './connect.service.helpers';

/**
 * Stripe Connect orchestration. Creates `type: 'custom'` Connected Accounts
 * with `payouts.schedule.interval: 'manual'` so Kloel orchestrates every
 * payout via the LedgerService — Stripe never sends money to bank accounts
 * automatically.
 *
 * Per ADR 0003: seller never has a Stripe dashboard login. All KYC and
 * status surface through Kloel's own UI.
 */
@Injectable()
export class ConnectService {
  private readonly logger = StructuredLogger.from(ConnectService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Create a Stripe Custom Connected Account and persist the local
   * ConnectAccountBalance row. Idempotent on (workspaceId, accountType):
   * a workspace cannot have two SELLER accounts. Other roles (AFFILIATE,
   * SUPPLIER, COPRODUCER, MANAGER) are also one-per-workspace today;
   * promote to multi-instance later if the product requires it.
   */
  async createCustomAccount(input: CreateCustomAccountInput): Promise<CreateCustomAccountResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.connectAccountBalance.findFirst({
          where: { workspaceId: input.workspaceId, accountType: input.accountType },
        });
        if (existing) {
          throw new ConnectAccountAlreadyExistsError(input.workspaceId, input.accountType);
        }

        const country = input.country ?? 'BR';
        const accountPayload = buildCreateCustomAccountPayload(input, country);

        let account: StripeAccount;
        try {
          account = await this.stripeService.stripe.accounts.create(accountPayload);
        } catch (error) {
          if (!shouldRetryWithoutManualPayoutSchedule(error, country)) {
            throw error;
          }

          this.logger.warn(
            `Stripe rejected manual payout schedule for country=${country}; retrying workspace=${input.workspaceId} type=${input.accountType} without schedule`,
          );

          account = await this.stripeService.stripe.accounts.create(
            stripManualPayoutSchedule(accountPayload),
          );
        }

        const balance = await tx.connectAccountBalance.create({
          data: {
            workspaceId: input.workspaceId,
            stripeAccountId: account.id,
            accountType: input.accountType,
          },
        });

        this.logger.log(
          `Created Custom Connected Account ${account.id} for workspace=${input.workspaceId} type=${input.accountType}`,
        );

        return {
          accountBalanceId: balance.id,
          stripeAccountId: account.id,
          requestedCapabilities: [...CONNECT_REQUESTED_CAPABILITIES],
        };
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  /**
   * Read live onboarding status from Stripe. Used by Kloel's dashboard to
   * surface "missing documents", "verification pending", etc., to the seller
   * without ever exposing a Stripe URL.
   */
  async getOnboardingStatus(stripeAccountId: string): Promise<OnboardingStatus> {
    const account = (await this.stripeService.stripe.accounts.retrieve(
      stripeAccountId,
    )) as StripeAccount;

    return projectOnboardingStatus(account);
  }

  /**
   * Submit onboarding fields from Kloel's own UI directly into the Stripe
   * Custom account. This keeps KYC and bank-account collection hosted inside
   * Kloel while still surfacing live requirement status from Stripe.
   */
  async submitOnboardingProfile(input: SubmitOnboardingProfileInput): Promise<OnboardingStatus> {
    const payload = buildOnboardingAccountUpdate(input);

    await this.stripeService.stripe.accounts.update(input.stripeAccountId, payload);
    this.logger.log(
      `Submitted Kloel-hosted onboarding for stripeAccountId=${input.stripeAccountId}`,
    );

    return this.getOnboardingStatus(input.stripeAccountId);
  }

  /**
   * Find the local balance row by Stripe account id. Returns null when the
   * account exists in Stripe but Kloel has no local mirror — useful when
   * processing webhooks that may arrive before our DB write commits.
   */
  async findBalanceByStripeAccountId(
    stripeAccountId: string,
  ): Promise<ConnectAccountBalance | null> {
    return this.prisma.connectAccountBalance.findUnique({
      where: { stripeAccountId, workspaceId: { not: '' } },
    });
  }

  /** List balances. */
  async listBalances(workspaceId?: string): Promise<ConnectAccountBalance[]> {
    return this.prisma.connectAccountBalance.findMany({
      ...(workspaceId ? { where: { workspaceId } } : {}),
      orderBy: [{ workspaceId: 'asc' }, { accountType: 'asc' }, { createdAt: 'asc' }],
    });
  }
}
