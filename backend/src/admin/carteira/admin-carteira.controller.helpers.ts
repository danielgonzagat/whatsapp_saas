import { BadRequestException } from '@nestjs/common';
import { FraudBlacklistType } from '@prisma/client';

/**
 * Pure helpers extracted from {@link AdminCarteiraController} (Claude-w122).
 *
 * Every function in this file is dependency-free, deterministic and side-effect
 * free. The intent is to keep the controller class focused on routing,
 * permission/audit composition and orchestration while parsing, validation and
 * payload shaping live here under direct unit-test coverage.
 *
 * No Nest decorators, no Prisma client, no I/O.
 */

/**
 * Parse a `skip` query string into a non-negative integer.
 *
 * Returns `undefined` when the input is missing/empty or not a finite number so
 * callers can decide whether to spread the value into a Prisma `findMany` arg.
 */
export function parseSkip(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : undefined;
}

/**
 * Parse a `take` query string into an integer clamped to `[1, 200]`.
 *
 * Mirrors {@link parseSkip} so paginated admin endpoints share a single
 * defensive contract for cursor/limit query parameters.
 */
export function parseTake(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(200, Math.max(1, Math.trunc(parsed))) : undefined;
}

/**
 * Trim and upper-case a currency code, falling back to `'BRL'` when the input
 * is missing or empty.
 *
 * Used by every admin treasury endpoint that accepts a currency override so the
 * code path is deterministic and ready for the Prisma layer.
 */
export function normalizeCurrency(raw: string | undefined): string {
  return (
    String(raw ?? 'BRL')
      .trim()
      .toUpperCase() || 'BRL'
  );
}

/**
 * Coerce an arbitrary value into a known {@link FraudBlacklistType}, throwing a
 * `BadRequestException` when the value is not one of the enum members.
 *
 * Pure: the helper does not touch the database; it only converts a query/body
 * field into a typed value or surfaces a 400.
 */
export function parseFraudBlacklistType(value: unknown): FraudBlacklistType {
  const normalized = (typeof value === 'string' ? value : '').trim().toUpperCase();
  if (Object.values(FraudBlacklistType).includes(normalized as FraudBlacklistType)) {
    return normalized as FraudBlacklistType;
  }
  throw new BadRequestException('type must be a valid FraudBlacklistType');
}

/**
 * Trim a free-form string, returning `undefined` when the result is empty so
 * callers can use the optional-property spread pattern.
 */
export function trimOptional(value: string | undefined | null): string | undefined {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Result shape returned by {@link validatePayoutAmount}.
 *
 * Callers receive both the raw safe integer (for audit logs and BadRequest
 * messages) and the `BigInt` form expected by the treasury service so they do
 * not need to repeat the conversion at the call site.
 */
export interface ValidatedPayoutAmount {
  /** Raw integer (cents) — useful for audit detail bodies and error context. */
  readonly amountCents: number;
  /** `BigInt` representation expected by treasury payout services. */
  readonly amountCentsBig: bigint;
}

/**
 * Validate a raw `amountCents` body field for the manual payout endpoints.
 *
 * Throws a `BadRequestException` when the value is missing, non-finite, not a
 * safe integer or non-positive. Otherwise returns the integer form plus its
 * `BigInt` counterpart so the controller can pass the correctly typed value to
 * the treasury payout service without re-parsing.
 */
export function validatePayoutAmount(raw: number | undefined | null): ValidatedPayoutAmount {
  const amountCents = Math.trunc(Number(raw ?? 0));
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new BadRequestException('amountCents must be a positive integer');
  }
  return { amountCents, amountCentsBig: BigInt(amountCents) };
}

/**
 * Resolve the request id for a manual treasury payout.
 *
 * When the operator passes an explicit `requestId` we trust it (after
 * trimming); otherwise we fall back to the supplied UUID generator. Keeping the
 * generator as a parameter makes the helper deterministic in tests.
 */
export function resolveTreasuryPayoutRequestId(
  raw: string | undefined,
  generator: () => string,
): string {
  const trimmed = String(raw ?? '').trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return `marketplace_treasury_po_${generator()}`;
}

/**
 * Require a non-empty trimmed string from a body/path parameter or surface a
 * `BadRequestException` with the provided message.
 *
 * Used by the connect payout request endpoints to validate the path parameter
 * before delegating to the approval service.
 */
export function requireNonEmpty(value: string | undefined, message: string): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    throw new BadRequestException(message);
  }
  return trimmed;
}

/**
 * Subset of the prisma `FraudBlacklist` row needed to build the public response
 * body — kept structural so the helper does not need to import the generated
 * Prisma model type.
 */
export interface FraudBlacklistRowLike {
  readonly id: string;
  readonly type: FraudBlacklistType;
  readonly value: string;
  readonly reason: string;
  readonly addedBy: string | null;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
}

/**
 * Shape of the JSON object returned to the admin client for each blacklist
 * row. Centralised here so the list, add and remove response bodies agree.
 */
export interface FraudBlacklistRowResponse {
  readonly id: string;
  readonly type: FraudBlacklistType;
  readonly value: string;
  readonly reason: string;
  readonly addedBy: string | null;
  readonly expiresAt: string | null;
  readonly createdAt: string;
}

/**
 * Convert a `FraudBlacklist` Prisma row into the controller's JSON response
 * shape.
 *
 * `expiresAt` becomes either an ISO string or `null` and `createdAt` is always
 * serialised so the admin frontend never has to special-case raw `Date`
 * objects.
 */
export function mapFraudBlacklistRow(row: FraudBlacklistRowLike): FraudBlacklistRowResponse {
  return {
    id: row.id,
    type: row.type,
    value: row.value,
    reason: row.reason,
    addedBy: row.addedBy,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Build the canonical entity id used in admin audit rows for a fraud blacklist
 * entry. Kept here so list/add/remove endpoints stay aligned on the same key.
 */
export function buildFraudBlacklistEntityId(type: FraudBlacklistType, value: string): string {
  return `${type}:${value}`;
}

/**
 * Build the audit `details` body for a `fraud_blacklist_added` admin action.
 *
 * The blacklist row is the source of truth — using {@link mapFraudBlacklistRow}
 * style serialisation here ensures the audit log mirrors exactly what the API
 * returns.
 */
export function buildFraudBlacklistAddedDetails(row: FraudBlacklistRowLike): {
  readonly fraudBlacklistId: string;
  readonly type: FraudBlacklistType;
  readonly value: string;
  readonly reason: string;
  readonly expiresAt: string | null;
} {
  return {
    fraudBlacklistId: row.id,
    type: row.type,
    value: row.value,
    reason: row.reason,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

/**
 * Build the audit `details` body for a `fraud_blacklist_removed` admin action.
 */
export function buildFraudBlacklistRemovedDetails(args: {
  readonly type: FraudBlacklistType;
  readonly value: string;
  readonly removedCount: number;
}): {
  readonly type: FraudBlacklistType;
  readonly value: string;
  readonly removedCount: number;
} {
  return {
    type: args.type,
    value: args.value,
    removedCount: args.removedCount,
  };
}

/**
 * Extract a typed string field from a JSON `details` blob, returning `null`
 * when the value is missing or not a string. Used by {@link mapPayoutAuditItem}
 * so each detail field reads as a flat lookup.
 */
function readDetailString(details: Record<string, unknown>, key: string): string | null {
  const candidate = details[key];
  return typeof candidate === 'string' ? candidate : null;
}

/**
 * Subset of the audit item returned by `AdminAuditService.list` needed to shape
 * a payout row in the public response. Kept structural.
 */
export interface PayoutAuditItemLike {
  readonly id: string;
  readonly action: string;
  readonly createdAt: Date;
  readonly details: unknown;
  readonly adminUser?: unknown;
}

/**
 * Shape of the JSON object returned to the admin client for each payout row.
 */
export interface PayoutAuditItemResponse {
  readonly id: string;
  readonly action: string;
  readonly createdAt: string;
  readonly requestId: string | null;
  readonly payoutId: string | null;
  readonly status: string | null;
  readonly amountCents: string | null;
  readonly currency: string | null;
  readonly error: string | null;
  readonly adminUser: unknown;
}

/**
 * Convert an `AdminAudit` row representing a treasury payout into the
 * controller's JSON response shape.
 *
 * Defensive against missing/garbled `details` blobs because audit detail
 * payloads are stored as free-form JSON.
 */
export function mapPayoutAuditItem(item: PayoutAuditItemLike): PayoutAuditItemResponse {
  const details =
    item.details && typeof item.details === 'object' && !Array.isArray(item.details)
      ? (item.details as Record<string, unknown>)
      : {};
  const adminUser =
    'adminUser' in item && item.adminUser && typeof item.adminUser === 'object'
      ? item.adminUser
      : null;

  return {
    id: item.id,
    action: item.action,
    createdAt: item.createdAt.toISOString(),
    requestId: readDetailString(details, 'requestId'),
    payoutId: readDetailString(details, 'payoutId'),
    status: readDetailString(details, 'status'),
    amountCents: readDetailString(details, 'amountCents'),
    currency: readDetailString(details, 'currency'),
    error: readDetailString(details, 'error'),
    adminUser,
  };
}

/**
 * Subset of the connect account balance row needed to build the public
 * response. Structural so the helper can avoid importing Prisma generated
 * types.
 */
export interface ConnectAccountBalanceLike {
  readonly id: string;
  readonly workspaceId: string;
  readonly stripeAccountId: string;
  readonly accountType: string;
}

/**
 * Subset of the {@link BalanceSnapshot} shape needed to render a row.
 */
export interface ConnectBalanceSnapshotLike {
  readonly pendingCents: bigint;
  readonly availableCents: bigint;
  readonly lifetimeReceivedCents: bigint;
  readonly lifetimePaidOutCents: bigint;
  readonly lifetimeChargebacksCents: bigint;
}

/**
 * Shape of the connect account row exposed by the admin endpoint.
 */
export interface ConnectAccountResponse {
  readonly accountBalanceId: string;
  readonly workspaceId: string;
  readonly stripeAccountId: string;
  readonly accountType: string;
  readonly pendingCents: string;
  readonly availableCents: string;
  readonly lifetimeReceivedCents: string;
  readonly lifetimePaidOutCents: string;
  readonly lifetimeChargebacksCents: string;
  readonly onboarding: unknown;
}

/**
 * Combine a Prisma `ConnectAccountBalance` row with the live balance snapshot
 * and the Stripe onboarding status into a single response row.
 *
 * The helper stringifies every `bigint` so the JSON payload is safe over the
 * wire without lossy `Number` casts.
 */
export function mapConnectAccount(
  balance: ConnectAccountBalanceLike,
  snapshot: ConnectBalanceSnapshotLike,
  onboarding: unknown,
): ConnectAccountResponse {
  return {
    accountBalanceId: balance.id,
    workspaceId: balance.workspaceId,
    stripeAccountId: balance.stripeAccountId,
    accountType: balance.accountType,
    pendingCents: snapshot.pendingCents.toString(),
    availableCents: snapshot.availableCents.toString(),
    lifetimeReceivedCents: snapshot.lifetimeReceivedCents.toString(),
    lifetimePaidOutCents: snapshot.lifetimePaidOutCents.toString(),
    lifetimeChargebacksCents: snapshot.lifetimeChargebacksCents.toString(),
    onboarding,
  };
}

/**
 * Result shape returned by the manual treasury payout endpoint after success.
 */
export interface TreasuryPayoutResponse {
  readonly success: true;
  readonly payoutId: string;
  readonly status: string;
  readonly amountCents: string;
  readonly currency: string;
}

/**
 * Input the payout service yields back on success. Structural — keeps the
 * helper isolated from the concrete `MarketplaceTreasuryPayoutService` types.
 */
export interface TreasuryPayoutLike {
  readonly payoutId: string;
  readonly status: string;
  readonly amountCents: bigint;
  readonly currency: string;
}

/**
 * Build the public response body for a successful manual payout request.
 */
export function buildTreasuryPayoutResponse(result: TreasuryPayoutLike): TreasuryPayoutResponse {
  return {
    success: true,
    payoutId: result.payoutId,
    status: result.status,
    amountCents: result.amountCents.toString(),
    currency: result.currency,
  };
}

/**
 * Build the `details` body persisted on the audit log for a successful manual
 * treasury payout request.
 */
export function buildTreasuryPayoutRequestedDetails(args: {
  readonly requestId: string;
  readonly result: TreasuryPayoutLike;
}): {
  readonly requestId: string;
  readonly payoutId: string;
  readonly status: string;
  readonly amountCents: string;
} {
  return {
    requestId: args.requestId,
    payoutId: args.result.payoutId,
    status: args.result.status,
    amountCents: args.result.amountCents.toString(),
  };
}

/**
 * Build the `details` body persisted on the audit log when a treasury payout
 * request fails before reaching the gateway. Captures the inbound `requestId`,
 * the integer amount as a string (preserving sign and avoiding `Number`
 * truncation in the audit row) and the error message extracted via the same
 * helper used elsewhere in the codebase.
 */
export function buildTreasuryPayoutFailedDetails(args: {
  readonly requestId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly error: unknown;
}): {
  readonly requestId: string;
  readonly amountCents: string;
  readonly currency: string;
  readonly error: string;
} {
  return {
    requestId: args.requestId,
    amountCents: String(args.amountCents),
    currency: args.currency,
    error: args.error instanceof Error ? args.error.message : String(args.error),
  };
}
