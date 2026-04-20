import { Injectable, Logger } from '@nestjs/common';
import type { ConnectAccountBalance } from '@prisma/client';

import { StripeService } from '../../billing/stripe.service';
import type { StripeAccount, StripeAccountLink } from '../../billing/stripe-types';
import { PrismaService } from '../../prisma/prisma.service';

import {
  ConnectAccountAlreadyExistsError,
  type CreateOnboardingLinkInput,
  type CreateOnboardingLinkResult,
  type CreateCustomAccountInput,
  type CreateCustomAccountResult,
  type OnboardingStatus,
} from './connect.types';

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
  private readonly logger = new Logger(ConnectService.name);

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
    const existing = await this.prisma.connectAccountBalance.findFirst({
      where: { workspaceId: input.workspaceId, accountType: input.accountType },
    });
    if (existing) {
      throw new ConnectAccountAlreadyExistsError(input.workspaceId, input.accountType);
    }

    const country = input.country ?? 'BR';
    const requestedCapabilities = ['card_payments', 'transfers'];

    const account = await this.stripeService.stripe.accounts.create({
      type: 'custom',
      country,
      email: input.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      settings: {
        payouts: {
          schedule: {
            interval: 'manual',
          },
        },
      },
      metadata: {
        workspaceId: input.workspaceId,
        accountType: input.accountType,
        ...(input.displayName ? { displayName: input.displayName } : {}),
      },
    });

    const balance = await this.prisma.connectAccountBalance.create({
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
      requestedCapabilities,
    };
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

    const reqs = account.requirements ?? null;
    const capabilitiesEntries = Object.entries(account.capabilities ?? {});
    const capabilities: Record<string, string> = {};
    for (const [name, value] of capabilitiesEntries) {
      capabilities[name] = String(value);
    }

    return {
      stripeAccountId: account.id,
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
      detailsSubmitted: Boolean(account.details_submitted),
      requirementsCurrentlyDue: reqs?.currently_due ?? [],
      requirementsPastDue: reqs?.past_due ?? [],
      requirementsDisabledReason: reqs?.disabled_reason ?? null,
      capabilities,
    };
  }

  async createOnboardingLink(
    input: CreateOnboardingLinkInput,
  ): Promise<CreateOnboardingLinkResult> {
    const type = input.type ?? 'account_onboarding';
    const link = (await this.stripeService.stripe.accountLinks.create({
      account: input.stripeAccountId,
      refresh_url: input.refreshUrl,
      return_url: input.returnUrl,
      type,
    })) as StripeAccountLink;

    return {
      stripeAccountId: input.stripeAccountId,
      url: link.url,
      expiresAt:
        typeof link.expires_at === 'number' ? new Date(link.expires_at * 1000).toISOString() : null,
      type,
    };
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
      where: { stripeAccountId },
    });
  }

  async listBalances(workspaceId?: string): Promise<ConnectAccountBalance[]> {
    return this.prisma.connectAccountBalance.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      orderBy: [{ workspaceId: 'asc' }, { accountType: 'asc' }, { createdAt: 'asc' }],
    });
  }
}
