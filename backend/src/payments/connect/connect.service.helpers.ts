import type { StripeClient } from '../../billing/stripe-types';
import { readTrimmedString as trimToUndefined } from '../../common/parse';
import { digitsOrUndefined as digitsOnly } from '../../common/phone';

import type {
  ConnectAddressInput,
  ConnectBusinessProfileInput,
  ConnectCompanyInput,
  ConnectExternalBankAccountInput,
  ConnectIndividualInput,
  ConnectTosAcceptanceInput,
  CreateCustomAccountInput,
  SubmitOnboardingProfileInput,
} from './connect.types';

type StripeAccountCreateParams = Parameters<StripeClient['accounts']['create']>[0];
type StripeAccountUpdateParams = Parameters<StripeClient['accounts']['update']>[1];

/**
 * Stripe Connect capabilities Kloel requests for every Custom Connected
 * Account at creation. The constant lives in the helpers module so the
 * service projection and downstream tests share the same source of truth.
 */
export const CONNECT_REQUESTED_CAPABILITIES: readonly string[] = Object.freeze([
  'card_payments',
  'transfers',
]);

/**
 * Drop keys whose values are `undefined`. Returns `undefined` when the object
 * has no defined entries — keeps Stripe payloads lean.
 */
export function compactObject<T extends Record<string, unknown>>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined;
}

/**
 * Project a Kloel `ConnectAddressInput` onto Stripe's snake_case address
 * shape. Returns `undefined` when no trimmed field survives.
 */
export function buildAddress(address?: ConnectAddressInput): Record<string, string> | undefined {
  if (!address) {
    return undefined;
  }

  const line1 = trimToUndefined(address.line1);
  const line2 = trimToUndefined(address.line2);
  const city = trimToUndefined(address.city);
  const state = trimToUndefined(address.state);
  const postal_code = trimToUndefined(address.postalCode);
  const country = trimToUndefined(address.country);

  const result: Record<string, string> = {};
  if (line1 !== undefined) {
    result.line1 = line1;
  }
  if (line2 !== undefined) {
    result.line2 = line2;
  }
  if (city !== undefined) {
    result.city = city;
  }
  if (state !== undefined) {
    result.state = state;
  }
  if (postal_code !== undefined) {
    result.postal_code = postal_code;
  }
  if (country !== undefined) {
    result.country = country;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Project a Kloel `ConnectBusinessProfileInput` onto Stripe's snake_case
 * business_profile payload. Returns `undefined` when nothing survives.
 */
export function buildBusinessProfile(
  profile?: ConnectBusinessProfileInput,
): Record<string, string> | undefined {
  if (!profile) {
    return undefined;
  }

  const name = trimToUndefined(profile.name);
  const url = trimToUndefined(profile.url);
  const mcc = trimToUndefined(profile.mcc);
  const product_description = trimToUndefined(profile.productDescription);
  const support_email = trimToUndefined(profile.supportEmail);
  const support_phone = trimToUndefined(profile.supportPhone);
  const support_url = trimToUndefined(profile.supportUrl);

  const result: Record<string, string> = {};
  if (name !== undefined) {
    result.name = name;
  }
  if (url !== undefined) {
    result.url = url;
  }
  if (mcc !== undefined) {
    result.mcc = mcc;
  }
  if (product_description !== undefined) {
    result.product_description = product_description;
  }
  if (support_email !== undefined) {
    result.support_email = support_email;
  }
  if (support_phone !== undefined) {
    result.support_phone = support_phone;
  }
  if (support_url !== undefined) {
    result.support_url = support_url;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Project a Kloel `ConnectIndividualInput` onto Stripe's individual payload.
 * Numeric DOB fields are validated via `Number.isFinite` so partial DOBs do
 * not poison the Stripe call.
 */
export function buildIndividualProfile(
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

/**
 * Project a Kloel `ConnectCompanyInput` onto Stripe's company payload.
 */
export function buildCompanyProfile(
  company?: ConnectCompanyInput,
): Record<string, unknown> | undefined {
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

/**
 * Build an external_account payload for Stripe. Prefers tokens (the safe
 * path) and falls back to raw bank-account fields when a token is not
 * supplied. Country defaults to BR / currency defaults to brl to match
 * Kloel's primary marketplace.
 */
export function buildExternalAccount(
  externalAccount?: ConnectExternalBankAccountInput,
): string | Record<string, string> | undefined {
  if (!externalAccount) {
    return undefined;
  }

  const token = trimToUndefined(externalAccount.token);
  if (token) {
    return token;
  }

  const country = trimToUndefined(externalAccount.country) ?? 'BR';
  const currency = trimToUndefined(externalAccount.currency)?.toLowerCase() ?? 'brl';
  const account_holder_name = trimToUndefined(externalAccount.accountHolderName);
  const account_holder_type = trimToUndefined(externalAccount.accountHolderType);
  const routing_number = digitsOnly(externalAccount.routingNumber);
  const account_number = digitsOnly(externalAccount.accountNumber);

  const result: Record<string, string> = {};
  result.object = 'bank_account';
  if (country !== undefined) {
    result.country = country;
  }
  if (currency !== undefined) {
    result.currency = currency;
  }
  if (account_holder_name !== undefined) {
    result.account_holder_name = account_holder_name;
  }
  if (account_holder_type !== undefined) {
    result.account_holder_type = account_holder_type;
  }
  if (routing_number !== undefined) {
    result.routing_number = routing_number;
  }
  if (account_number !== undefined) {
    result.account_number = account_number;
  }

  return result;
}

/**
 * Project a Kloel `ConnectTosAcceptanceInput` onto Stripe's tos_acceptance
 * payload. Converts ISO acceptance timestamps to epoch seconds.
 */
export function buildTosAcceptance(
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

/**
 * Drop empty/whitespace-only metadata keys and values to keep Stripe
 * metadata clean. Returns `undefined` when nothing survives.
 */
export function buildMetadata(
  metadata?: Record<string, string>,
): Record<string, string> | undefined {
  if (!metadata) {
    return undefined;
  }

  const entries = Object.entries(metadata).filter(
    ([key, value]) => trimToUndefined(key) && trimToUndefined(value),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

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
export function shouldRetryWithoutManualPayoutSchedule(
  error: unknown,
  country: string,
): boolean {
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
  readonly requirements?:
    | {
        readonly currently_due?: readonly string[] | null;
        readonly past_due?: readonly string[] | null;
        readonly disabled_reason?: string | null;
      }
    | null;
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
