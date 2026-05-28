import type { StripeClient } from '../../billing/stripe-types';
import { readTrimmedString as trimToUndefined } from '../../common/parse';

import {
  buildBusinessProfile,
  buildCompanyProfile,
  buildExternalAccount,
  buildIndividualProfile,
  buildMetadata,
  buildTosAcceptance,
} from './connect.service.helpers.payloads';
import type { CreateCustomAccountInput, SubmitOnboardingProfileInput } from './connect.types';

type StripeAccountCreateParams = Parameters<StripeClient['accounts']['create']>[0];
type StripeAccountUpdateParams = Parameters<StripeClient['accounts']['update']>[1];

/**
 * Assemble the Stripe `accounts.update` payload for Kloel-hosted onboarding.
 * Pure transform — no Stripe call, no logging — so it remains trivially
 * unit-testable.
 */
export function buildOnboardingAccountUpdate(
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

  return payload;
}

/**
 * Build the Stripe `accounts.create` payload for a Custom Connected
 * Account. Encodes the non-negotiables: `type: 'custom'`,
 * `card_payments`+`transfers` capabilities and `payouts.schedule.interval:
 * 'manual'` — Stripe must never wire money to the seller's bank without
 * Kloel orchestrating it through LedgerService.
 */
export function buildCreateCustomAccountPayload(
  input: CreateCustomAccountInput,
  country: string,
): StripeAccountCreateParams {
  return {
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
}

/**
 * Strip the `settings.payouts.schedule.interval: 'manual'` block. Stripe
 * rejects the manual payout schedule on some country/account combinations
 * (notably BR) at creation time — we retry once without the schedule and
 * keep payout orchestration in LedgerService instead.
 */
export function stripManualPayoutSchedule(
  payload: StripeAccountCreateParams,
): StripeAccountCreateParams {
  const { settings: _settings, ...rest } = payload;
  return rest;
}

/**
 * Decide whether to retry account creation without the manual payout
 * schedule. Today only Brazil (BR) hits this Stripe rejection path; the
 * predicate is country-scoped to avoid silently masking unrelated errors.
 */
export function shouldRetryWithoutManualPayoutSchedule(error: unknown, country: string): boolean {
  if (country !== 'BR') {
    return false;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : '';

  return (
    message.toLowerCase().includes('manual payout plan') &&
    message.toLowerCase().includes('country br')
  );
}

/** Subset of the Stripe `Account` retrieve payload consumed by Kloel. */
export interface OnboardingStatusProjectionInput {
  readonly id: string;
  readonly charges_enabled?: boolean | null;
  readonly payouts_enabled?: boolean | null;
  readonly details_submitted?: boolean | null;
  readonly requirements?: {
    readonly currently_due?: readonly string[] | null;
    readonly past_due?: readonly string[] | null;
    readonly disabled_reason?: string | null;
  } | null;
  readonly capabilities?: object | null;
}

/** View-model returned by `projectOnboardingStatus`. */
export interface ProjectedOnboardingStatus {
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsCurrentlyDue: string[];
  requirementsPastDue: string[];
  requirementsDisabledReason: string | null;
  capabilities: Record<string, string>;
}

/**
 * Project the Stripe `accounts.retrieve` response onto Kloel's onboarding
 * status view-model. Accepts a permissive structural shape so callers can
 * pass either a `Stripe.Account` directly or a test fixture — the
 * `capabilities` field is iterated via `Object.entries` so it does not need
 * an explicit index signature.
 */
export function projectOnboardingStatus(
  account: OnboardingStatusProjectionInput,
): ProjectedOnboardingStatus {
  const reqs = account.requirements ?? null;
  const capabilitiesSource = (account.capabilities ?? {}) as Record<string, unknown>;
  const capabilitiesEntries = Object.entries(capabilitiesSource);
  const capabilities: Record<string, string> = {};
  for (const [name, value] of capabilitiesEntries) {
    capabilities[name] = String(value);
  }

  return {
    stripeAccountId: account.id,
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    requirementsCurrentlyDue: (reqs?.currently_due ?? []) as string[],
    requirementsPastDue: (reqs?.past_due ?? []) as string[],
    requirementsDisabledReason: reqs?.disabled_reason ?? null,
    capabilities,
  };
}
