import { readTrimmedString as trimToUndefined } from '../../common/parse';
import { digitsOrUndefined as digitsOnly } from '../../common/phone';

import type {
  ConnectAddressInput,
  ConnectBusinessProfileInput,
  ConnectCompanyInput,
  ConnectExternalBankAccountInput,
  ConnectIndividualInput,
  ConnectTosAcceptanceInput,
} from './connect.types';

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
