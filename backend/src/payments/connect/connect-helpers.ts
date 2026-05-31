import type { ConnectAccountType, ConnectLedgerEntryType } from '@prisma/client';

import type { SubmitOnboardingProfileInput } from './connect.types';

export const CONNECT_LEDGER_ENTRY_TYPES: ConnectLedgerEntryType[] = [
  'CREDIT_PENDING',
  'MATURE',
  'DEBIT_PAYOUT',
  'DEBIT_CHARGEBACK',
  'DEBIT_REFUND',
  'ADJUSTMENT',
];

export function parseSkip(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : undefined;
}

export function parseTake(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(200, Math.max(1, Math.trunc(parsed))) : undefined;
}

/**
 * Default skip when listing — clamps negatives to zero.
 */
export function parsePaginationSkip(value?: string | number | null): number {
  return Math.max(0, Number(value ?? 0) || 0);
}

/**
 * Default take when listing — clamps to [1, 200], defaulting to 50.
 */
export function parsePaginationTake(value?: string | number | null): number {
  return Math.min(200, Math.max(1, Number(value ?? 50) || 50));
}

/**
 * Parse a Connect ledger entry type query param, returning undefined when invalid.
 */
export function parseConnectLedgerEntryType(value?: string): ConnectLedgerEntryType | undefined {
  if (!value) {
    return undefined;
  }
  return CONNECT_LEDGER_ENTRY_TYPES.includes(value as ConnectLedgerEntryType)
    ? (value as ConnectLedgerEntryType)
    : undefined;
}

/**
 * Pick the first IP from an X-Forwarded-For header, ignoring blank values.
 */
export function parseForwardedIp(forwardedFor?: string): string | undefined {
  if (typeof forwardedFor !== 'string') {
    return undefined;
  }
  const trimmed = forwardedFor.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.split(',')[0]?.trim() || undefined;
}

type SubmitOnboardingProfileBody = Omit<SubmitOnboardingProfileInput, 'stripeAccountId'>;

/**
 * True when the onboarding submission body contains at least one mutable field.
 */
export function hasOnboardingProfileUpdate(body: SubmitOnboardingProfileBody): boolean {
  return [
    typeof body.email === 'string' && body.email.trim(),
    typeof body.country === 'string' && body.country.trim(),
    typeof body.businessType === 'string' && body.businessType.trim(),
    body.businessProfile && Object.keys(body.businessProfile).length > 0,
    body.individual && Object.keys(body.individual).length > 0,
    body.company && Object.keys(body.company).length > 0,
    body.externalAccount && Object.keys(body.externalAccount).length > 0,
    body.tosAcceptance && Object.keys(body.tosAcceptance).length > 0,
    body.metadata && Object.keys(body.metadata).length > 0,
  ].some(Boolean);
}

type TosAcceptance = NonNullable<SubmitOnboardingProfileBody['tosAcceptance']>;

/**
 * Merge the submitted ToS acceptance with request-derived IP/User-Agent.
 * Returns undefined when no acceptance payload is present.
 */
export function resolveTosAcceptance(
  raw: TosAcceptance | undefined,
  forwardedIp: string | undefined,
  userAgent: string | undefined,
): TosAcceptance | undefined {
  if (!raw) {
    return undefined;
  }
  const ipAddress = raw.ipAddress || forwardedIp;
  const ua = raw.userAgent || userAgent;
  const result: TosAcceptance = {};
  if (ipAddress !== undefined) {
    result.ipAddress = ipAddress;
  }
  if (ua !== undefined) {
    result.userAgent = ua;
  }
  if (raw.acceptedAt !== undefined) {
    result.acceptedAt = raw.acceptedAt;
  }
  return result;
}

/**
 * Build the SubmitOnboardingProfileInput payload by copying only defined fields
 * from the controller body onto the stripeAccountId-bound base.
 */
export function buildOnboardingProfileInput(
  stripeAccountId: string,
  body: SubmitOnboardingProfileBody,
  tosAcceptance: TosAcceptance | undefined,
): SubmitOnboardingProfileInput {
  const result: SubmitOnboardingProfileInput = { stripeAccountId };
  if (body.email !== undefined) {
    result.email = body.email;
  }
  if (body.country !== undefined) {
    result.country = body.country;
  }
  if (body.businessType !== undefined) {
    result.businessType = body.businessType;
  }
  if (body.businessProfile !== undefined) {
    result.businessProfile = body.businessProfile;
  }
  if (body.individual !== undefined) {
    result.individual = body.individual;
  }
  if (body.company !== undefined) {
    result.company = body.company;
  }
  if (body.externalAccount !== undefined) {
    result.externalAccount = body.externalAccount;
  }
  if (tosAcceptance !== undefined) {
    result.tosAcceptance = tosAcceptance;
  }
  if (body.metadata !== undefined) {
    result.metadata = body.metadata;
  }
  return result;
}

type ConnectBalanceShape = {
  readonly id: string;
  readonly accountType: ConnectAccountType;
  readonly stripeAccountId: string;
};

export type ConnectBalanceSummary = {
  accountType: ConnectAccountType;
  stripeAccountId: string;
};

/**
 * Build a quick id→summary lookup for connect account balances.
 */
export function buildBalanceById(
  balances: readonly ConnectBalanceShape[],
): Map<string, ConnectBalanceSummary> {
  return new Map(
    balances.map((balance) => [
      balance.id,
      {
        accountType: balance.accountType,
        stripeAccountId: balance.stripeAccountId,
      },
    ]),
  );
}

type ConnectPayoutDetails = Record<string, unknown>;

type AdminAuditLogShape = {
  readonly id: string;
  readonly action: string;
  readonly createdAt: Date;
  readonly entityId: string | null;
  readonly details: unknown;
};

export type MappedPayoutAuditItem = {
  id: string;
  action: string;
  createdAt: string;
  accountBalanceId: string | null;
  accountType: ConnectAccountType | null;
  stripeAccountId: string | null;
  requestId: string | null;
  payoutId: string | null;
  status: string | null;
  amountCents: string | null;
  error: string | null;
};

/**
 * Project an AdminAuditLog row into the public payout view-model.
 */
export function mapPayoutAuditItem(
  item: AdminAuditLogShape,
  balanceById: ReadonlyMap<string, ConnectBalanceSummary>,
): MappedPayoutAuditItem {
  const details =
    item.details && typeof item.details === 'object' && !Array.isArray(item.details)
      ? (item.details as ConnectPayoutDetails)
      : {};
  const balance =
    item.entityId && typeof item.entityId === 'string' ? balanceById.get(item.entityId) : null;

  return {
    id: item.id,
    action: item.action,
    createdAt: item.createdAt.toISOString(),
    accountBalanceId: item.entityId,
    accountType: balance?.accountType ?? null,
    stripeAccountId: balance?.stripeAccountId ?? null,
    requestId: typeof details.requestId === 'string' ? details.requestId : null,
    payoutId: typeof details.payoutId === 'string' ? details.payoutId : null,
    status: typeof details.status === 'string' ? details.status : null,
    amountCents: typeof details.amountCents === 'string' ? details.amountCents : null,
    error: typeof details.error === 'string' ? details.error : null,
  };
}

type ConnectLedgerEntryShape = {
  readonly id: string;
  readonly accountBalanceId: string;
  readonly type: ConnectLedgerEntryType;
  readonly amountCents: bigint;
  readonly balanceAfterPendingCents: bigint;
  readonly balanceAfterAvailableCents: bigint;
  readonly referenceType: string | null;
  readonly referenceId: string | null;
  readonly scheduledFor: Date | null;
  readonly matured: boolean;
  readonly createdAt: Date;
};

export type MappedLedgerEntry = {
  id: string;
  accountBalanceId: string;
  accountType: ConnectAccountType | null;
  stripeAccountId: string | null;
  type: ConnectLedgerEntryType;
  amountCents: string;
  balanceAfterPendingCents: string;
  balanceAfterAvailableCents: string;
  referenceType: string | null;
  referenceId: string | null;
  scheduledFor: string | null;
  matured: boolean;
  createdAt: string;
};

/**
 * Project a ConnectLedgerEntry row into the public ledger view-model.
 */
export function mapConnectLedgerEntry(
  item: ConnectLedgerEntryShape,
  balanceById: ReadonlyMap<string, ConnectBalanceSummary>,
): MappedLedgerEntry {
  const balance = balanceById.get(item.accountBalanceId) ?? null;
  return {
    id: item.id,
    accountBalanceId: item.accountBalanceId,
    accountType: balance?.accountType ?? null,
    stripeAccountId: balance?.stripeAccountId ?? null,
    type: item.type,
    amountCents: item.amountCents.toString(),
    balanceAfterPendingCents: item.balanceAfterPendingCents.toString(),
    balanceAfterAvailableCents: item.balanceAfterAvailableCents.toString(),
    referenceType: item.referenceType,
    referenceId: item.referenceId,
    scheduledFor: item.scheduledFor?.toISOString() ?? null,
    matured: item.matured,
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * Parse and validate a positive integer amount-in-cents payload, returning
 * the parsed value or `null` when the payload is invalid.
 */
export function parsePositiveIntegerCents(value: number | undefined | null): number | null {
  const requested = Math.trunc(Number(value || 0));
  if (!Number.isSafeInteger(requested) || requested <= 0) {
    return null;
  }
  return requested;
}
