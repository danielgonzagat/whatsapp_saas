import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { ConnectAccountBalance } from '@prisma/client';

import { StripeService } from '../../billing/stripe.service';
import type { StripeAccount, StripeClient } from '../../billing/stripe-types';
import { PrismaService } from '../../prisma/prisma.service';

import {
  ConnectAccountAlreadyExistsError,
  type ConnectAddressInput,
  type ConnectBusinessProfileInput,
  type ConnectCompanyInput,
  type ConnectExternalBankAccountInput,
  type ConnectIndividualInput,
  type ConnectTosAcceptanceInput,
  type CreateCustomAccountInput,
  type CreateCustomAccountResult,
  type OnboardingStatus,
  type SubmitOnboardingProfileInput,
} from './connect.types';

type StripeAccountCreateParams = Parameters<StripeClient['accounts']['create']>[0];
type StripeAccountUpdateParams = Parameters<StripeClient['accounts']['update']>[1];

function trimToUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function digitsOnly(value: unknown): string | undefined {
  const raw = trimToUndefined(value);
  if (!raw) {
    return undefined;
  }
  const normalized = raw.replace(/\D/g, '');
  return normalized || undefined;
}

function compactObject<T extends Record<string, unknown>>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined;
}

function buildAddress(address?: ConnectAddressInput): Record<string, string> | undefined {
  if (!address) {
    return undefined;
  }

  return compactObject({
    line1: trimToUndefined(address.line1),
    line2: trimToUndefined(address.line2),
    city: trimToUndefined(address.city),
    state: trimToUndefined(address.state),
    postal_code: trimToUndefined(address.postalCode),
    country: trimToUndefined(address.country),
  });
}

function buildBusinessProfile(
  profile?: ConnectBusinessProfileInput,
): Record<string, string> | undefined {
  if (!profile) {
    return undefined;
  }

  return compactObject({
    name: trimToUndefined(profile.name),
    url: trimToUndefined(profile.url),
    mcc: trimToUndefined(profile.mcc),
    product_description: trimToUndefined(profile.productDescription),
    support_email: trimToUndefined(profile.supportEmail),
    support_phone: trimToUndefined(profile.supportPhone),
    support_url: trimToUndefined(profile.supportUrl),
  });
}

function buildIndividualProfile(
  individual?: ConnectIndividualInput,
): Record<string, unknown> | undefined {
  if (!individual) {
    return undefined;
  }

  const dob = compactObject({
    day: Number.isFinite(individual.dateOfBirth?.day) ? individual.dateOfBirth?.day : undefined,
    month: Number.isFinite(individual.dateOfBirth?.month)
      ? individual.dateOfBirth?.month
      : undefined,
    year: Number.isFinite(individual.dateOfBirth?.year) ? individual.dateOfBirth?.year : undefined,
  });

  return compactObject({
    first_name: trimToUndefined(individual.firstName),
    last_name: trimToUndefined(individual.lastName),
    email: trimToUndefined(individual.email),
    phone: trimToUndefined(individual.phone),
    id_number: digitsOnly(individual.idNumber),
    dob,
    address: buildAddress(individual.address),
  });
}

function buildCompanyProfile(company?: ConnectCompanyInput): Record<string, unknown> | undefined {
  if (!company) {
    return undefined;
  }

  return compactObject({
    name: trimToUndefined(company.name),
    tax_id: digitsOnly(company.taxId),
    phone: trimToUndefined(company.phone),
    address: buildAddress(company.address),
  });
}

function buildExternalAccount(
  externalAccount?: ConnectExternalBankAccountInput,
): string | Record<string, string> | undefined {
  if (!externalAccount) {
    return undefined;
  }

  const token = trimToUndefined(externalAccount.token);
  if (token) {
    return token;
  }

  return compactObject({
    object: 'bank_account',
    country: trimToUndefined(externalAccount.country) ?? 'BR',
    currency: trimToUndefined(externalAccount.currency)?.toLowerCase() ?? 'brl',
    account_holder_name: trimToUndefined(externalAccount.accountHolderName),
    account_holder_type: trimToUndefined(externalAccount.accountHolderType),
    routing_number: digitsOnly(externalAccount.routingNumber),
    account_number: digitsOnly(externalAccount.accountNumber),
  });
}

function buildTosAcceptance(
  tosAcceptance?: ConnectTosAcceptanceInput,
): Record<string, unknown> | undefined {
  if (!tosAcceptance) {
    return undefined;
  }

  const acceptedAtRaw = trimToUndefined(tosAcceptance.acceptedAt);
  const acceptedAtEpoch =
    acceptedAtRaw && !Number.isNaN(Date.parse(acceptedAtRaw))
      ? Math.floor(Date.parse(acceptedAtRaw) / 1000)
      : undefined;

  return compactObject({
    date: acceptedAtEpoch,
    ip: trimToUndefined(tosAcceptance.ipAddress),
    user_agent: trimToUndefined(tosAcceptance.userAgent),
  });
}

function buildMetadata(metadata?: Record<string, string>): Record<string, string> | undefined {
  if (!metadata) {
    return undefined;
  }

  const entries = Object.entries(metadata).filter(
    ([key, value]) => trimToUndefined(key) && trimToUndefined(value),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function buildOnboardingAccountUpdate(
  input: SubmitOnboardingProfileInput,
): StripeAccountUpdateParams {
  const payload: Record<string, unknown> = {};
  const email = trimToUndefined(input.email);
  const country = trimToUndefined(input.country);
  const businessType = trimToUndefined(input.businessType);
  const businessProfile = buildBusinessProfile(input.businessProfile);
  const individual = buildIndividualProfile(input.individual);
  const company = buildCompanyProfile(input.company);
  const externalAccount = buildExternalAccount(input.externalAccount);
  const tosAcceptance = buildTosAcceptance(input.tosAcceptance);
  const metadata = buildMetadata(input.metadata);

  if (email) {
    payload.email = email;
  }
  if (country) {
    payload.country = country;
  }
  if (businessType) {
    payload.business_type = businessType;
  }
  if (businessProfile) {
    payload.business_profile = businessProfile;
  }
  if (individual) {
    payload.individual = individual;
  }
  if (company) {
    payload.company = company;
  }
  if (externalAccount) {
    payload.external_account = externalAccount;
  }
  if (tosAcceptance) {
    payload.tos_acceptance = tosAcceptance;
  }
  if (metadata) {
    payload.metadata = metadata;
  }

  return payload as StripeAccountUpdateParams;
}

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
    const accountPayload: StripeAccountCreateParams = {
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
    };

    let account: StripeAccount;
    try {
      account = (await this.stripeService.stripe.accounts.create(accountPayload)) as StripeAccount;
    } catch (error) {
      if (!this.shouldRetryWithoutManualPayoutSchedule(error, country)) {
        Sentry.captureException(error, {
          tags: { type: 'financial_alert', operation: 'connect_account_create' },
          extra: { workspaceId: input.workspaceId, accountType: input.accountType, country },
          level: 'error',
        });
        throw error;
      }

      this.logger.warn(
        `Stripe rejected manual payout schedule for country=${country}; retrying workspace=${input.workspaceId} type=${input.accountType} without schedule`,
      );
      Sentry.captureException(error, {
        tags: { type: 'financial_alert', operation: 'connect_account_create_retry' },
        extra: { workspaceId: input.workspaceId, accountType: input.accountType, country },
        level: 'warning',
      });

      const payloadWithoutManualPayoutSchedule: StripeAccountCreateParams = {
        ...accountPayload,
        settings: undefined,
      };
      account = (await this.stripeService.stripe.accounts.create(
        payloadWithoutManualPayoutSchedule,
      )) as StripeAccount;
    }

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
      where: { stripeAccountId },
    });
  }

  /** List balances. */
  async listBalances(workspaceId?: string): Promise<ConnectAccountBalance[]> {
    return this.prisma.connectAccountBalance.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      orderBy: [{ workspaceId: 'asc' }, { accountType: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private shouldRetryWithoutManualPayoutSchedule(error: unknown, country: string): boolean {
    if (country !== 'BR') {
      return false;
    }

    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof error.message === 'string'
          ? error.message
          : '';

    return (
      message.toLowerCase().includes('manual payout plan') &&
      message.toLowerCase().includes('country br')
    );
  }
}
