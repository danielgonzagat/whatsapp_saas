import { FraudBlacklistType } from '@prisma/client';

/**
 * Fraud-blacklist mapping helpers extracted from
 * {@link AdminCarteiraController}.
 *
 * Pure: no DB access, no Nest decorators, no I/O. Re-exported through the
 * `admin-carteira.controller.helpers.ts` barrel so external import paths stay
 * stable.
 */

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
