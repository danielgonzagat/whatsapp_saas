import type { ConnectAccountBalance } from '@prisma/client';

import type { BalanceSnapshot } from './ledger.types';

/**
 * Pure mapping + classification helpers shared by the ledger service surface.
 *
 * These functions are pure: no Prisma client calls, no logging, no I/O. They
 * exist so the service files keep their orchestration shape (transaction +
 * audit + state mutation) while reusable shapes live in one place and earn
 * direct unit coverage.
 */

/** Shape of the `ConnectAccountBalance` row that {@link mapBalanceToSnapshot} requires. */
export type LedgerBalanceRow = Pick<
  ConnectAccountBalance,
  | 'id'
  | 'stripeAccountId'
  | 'accountType'
  | 'pendingBalanceCents'
  | 'availableBalanceCents'
  | 'lifetimeReceivedCents'
  | 'lifetimePaidOutCents'
  | 'lifetimeChargebacksCents'
>;

/**
 * Pure mapper: persisted `ConnectAccountBalance` row → public `BalanceSnapshot`.
 *
 * Mirrors the rename `pendingBalanceCents` → `pendingCents` (and friends) so
 * external callers do not depend on Prisma column names. Kept here so the
 * service stays focused on the lookup and so the mapping is covered without
 * stubbing the entire Prisma client.
 */
export function mapBalanceToSnapshot(row: LedgerBalanceRow): BalanceSnapshot {
  return {
    accountBalanceId: row.id,
    stripeAccountId: row.stripeAccountId,
    accountType: row.accountType,
    pendingCents: row.pendingBalanceCents,
    availableCents: row.availableBalanceCents,
    lifetimeReceivedCents: row.lifetimeReceivedCents,
    lifetimePaidOutCents: row.lifetimePaidOutCents,
    lifetimeChargebacksCents: row.lifetimeChargebacksCents,
  };
}

/**
 * Prisma error codes that ledger callers must treat as already-applied for the
 * idempotent maturation path:
 *
 * - `P2002` — unique constraint hit because a concurrent worker beat us to the
 *   matured insert.
 * - `P2025` — the source row was already promoted (stale `findUnique`).
 *
 * Both cases mean "the requested transition is already durable" and the
 * caller should silently skip instead of bubbling the error. Pure predicate
 * so the matching list lives in one auditable spot.
 */
export const LEDGER_IDEMPOTENCY_RECOVERY_CODES = ['P2002', 'P2025'] as const;

/** Code value type accepted by {@link isLedgerIdempotencyRecoveryCode}. */
export type LedgerIdempotencyRecoveryCode = (typeof LEDGER_IDEMPOTENCY_RECOVERY_CODES)[number];

/** Pure check: is `code` one of the maturation idempotency-recovery codes? */
export function isLedgerIdempotencyRecoveryCode(
  code: string | undefined,
): code is LedgerIdempotencyRecoveryCode {
  if (!code) {
    return false;
  }
  return (LEDGER_IDEMPOTENCY_RECOVERY_CODES as readonly string[]).includes(code);
}
