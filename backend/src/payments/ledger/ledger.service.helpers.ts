import type { ConnectLedgerEntryType } from '@prisma/client';

/**
 * Pure orchestration helpers extracted from {@link LedgerService} (Wave 107
 * decomposition). These functions own the deterministic, side-effect-free
 * fragments of each mutation: the idempotency-lookup where-clause shape, the
 * post-mutation balance arithmetic, the structured audit-log payload shape,
 * and the small metadata builders.
 *
 * MONEY-PATH DISCIPLINE (preserve exactly):
 * - All balance math operates on `bigint` cents — no float, no Number.
 * - The audit-detail builders emit `.toString()` over bigint values so the
 *   structured logger receives stable JSON strings. The exact field names
 *   below are load-bearing — Datadog dashboards and audit replays grep them
 *   by literal key.
 * - Append-only contract: helpers never mutate inputs. Every output is a
 *   fresh object/struct. There is no Prisma client, no logger, no clock
 *   inside this module.
 * - Idempotency lookup where-clauses MUST stay shape-stable: the database
 *   relies on `(referenceType, referenceId, type)` to recognise duplicate
 *   webhook deliveries. Adding or reordering keys would silently break
 *   replay safety (ADR 0003, FRA-007 fraud window).
 */

/** Reference tuple used by every monetary mutation for idempotency lookups. */
export interface LedgerReferenceLookup {
  /** External reference type (e.g. 'sale', 'payout', 'chargeback'). */
  type: string;
  /** External reference id (PaymentIntent, payout id, dispute id, etc.). */
  id: string;
}

/**
 * Build the `findFirst({ where })` clause that detects an already-applied
 * monetary mutation. The exact shape — `referenceType` / `referenceId` /
 * `type` — must match the database unique constraint used as the durable
 * idempotency guard (ADR 0003). Keep keys in this order; some Prisma query
 * planners materialise the index lookup based on declaration order.
 */
export function buildLedgerReferenceIdempotencyWhere(
  reference: LedgerReferenceLookup,
  entryType: ConnectLedgerEntryType,
): {
  referenceType: string;
  referenceId: string;
  type: ConnectLedgerEntryType;
} {
  return {
    referenceType: reference.type,
    referenceId: reference.id,
    type: entryType,
  };
}

/**
 * Pure delta math for `creditPending`: the new PENDING balance and the new
 * LIFETIME_RECEIVED counter after applying a positive credit. AVAILABLE is
 * untouched — credits land in PENDING and mature on a schedule.
 */
export function computeCreditPendingBalanceDelta(
  pendingBalanceCents: bigint,
  lifetimeReceivedCents: bigint,
  amountCents: bigint,
): { newPending: bigint; newLifetimeReceived: bigint } {
  return {
    newPending: pendingBalanceCents + amountCents,
    newLifetimeReceived: lifetimeReceivedCents + amountCents,
  };
}

/**
 * Pure delta math for `moveFromPendingToAvailable`: PENDING shrinks by the
 * matured amount, AVAILABLE grows by the same amount. Lifetime counters are
 * untouched — the credit was already booked as received when it landed.
 */
export function computeMatureBalanceDelta(
  pendingBalanceCents: bigint,
  availableBalanceCents: bigint,
  amountCents: bigint,
): { newPending: bigint; newAvailable: bigint } {
  return {
    newPending: pendingBalanceCents - amountCents,
    newAvailable: availableBalanceCents + amountCents,
  };
}

/**
 * Pure delta math for `debitAvailableForPayout`: AVAILABLE shrinks, the
 * LIFETIME_PAID_OUT counter grows. PENDING is untouched.
 *
 * Callers must guard against `availableBalanceCents < amountCents` BEFORE
 * calling this helper (the service throws `InsufficientAvailableBalanceError`
 * outside the pure layer to preserve the existing error contract).
 */
export function computeDebitPayoutBalanceDelta(
  availableBalanceCents: bigint,
  lifetimePaidOutCents: bigint,
  amountCents: bigint,
): { newAvailable: bigint; newLifetimePaidOut: bigint } {
  return {
    newAvailable: availableBalanceCents - amountCents,
    newLifetimePaidOut: lifetimePaidOutCents + amountCents,
  };
}

/**
 * Pure metadata builder used when the maturation flow inserts a synthetic
 * MATURE row. The `promotedFromEntryId` field is the audit breadcrumb back to
 * the original CREDIT_PENDING entry.
 */
export function buildMatureEntryMetadata(originalEntryId: string): {
  promotedFromEntryId: string;
} {
  return { promotedFromEntryId: originalEntryId };
}

/**
 * Structured-log payload type for `connect_ledger_write` audit rows. The
 * service's `logLedgerWrite` helper accepts `Record<string, string>` so the
 * audit-detail builders below return the same shape. Field names are
 * load-bearing — Datadog grep, replay scripts, and Sentry breadcrumb parsers
 * key off the exact keys produced here.
 */
export type LedgerAuditDetails = Record<string, string>;

/**
 * Structured-log payload for the `creditPending` audit row. Field names are
 * load-bearing (Datadog grep, replay scripts).
 */
export function buildCreditPendingAuditDetails(
  reference: LedgerReferenceLookup,
  newPendingBalanceCents: bigint,
  newAvailableBalanceCents: bigint,
): LedgerAuditDetails {
  return {
    referenceType: reference.type,
    referenceId: reference.id,
    newPendingBalanceCents: newPendingBalanceCents.toString(),
    newAvailableBalanceCents: newAvailableBalanceCents.toString(),
  };
}

/**
 * Structured-log payload for the `mature` audit row. Carries the originating
 * pending-entry id (so replay tools can stitch the lifecycle) plus the new
 * post-mature balances.
 */
export function buildMatureAuditDetails(
  promotedFromEntryId: string,
  newPendingBalanceCents: bigint,
  newAvailableBalanceCents: bigint,
): LedgerAuditDetails {
  return {
    promotedFromEntryId,
    newPendingBalanceCents: newPendingBalanceCents.toString(),
    newAvailableBalanceCents: newAvailableBalanceCents.toString(),
  };
}

/**
 * Structured-log payload for the `debitPayout` audit row. Tracks the new
 * AVAILABLE balance + the cumulative LIFETIME_PAID_OUT counter — both are
 * stringified bigints for stable JSON serialization.
 */
export function buildDebitPayoutAuditDetails(
  reference: LedgerReferenceLookup,
  newAvailableBalanceCents: bigint,
  newLifetimePaidOutCents: bigint,
): LedgerAuditDetails {
  return {
    referenceType: reference.type,
    referenceId: reference.id,
    newAvailableBalanceCents: newAvailableBalanceCents.toString(),
    newLifetimePaidOutCents: newLifetimePaidOutCents.toString(),
  };
}

/**
 * Structured-log payload for both `debitChargeback` and `debitRefund` audit
 * rows. The two flows share the PENDING-first absorption shape from
 * {@link ./ledger-math.helper#applyAbsorptionDebit}.
 *
 * When `newLifetimeChargebacksCents` is supplied, the field is added to the
 * payload — only the chargeback operation tracks that counter; refunds omit
 * it (matches prior behavior exactly).
 */
export function buildAbsorptionDebitAuditDetails(
  reference: LedgerReferenceLookup,
  fromPendingCents: bigint,
  fromAvailableCents: bigint,
  newPendingBalanceCents: bigint,
  newAvailableBalanceCents: bigint,
  newLifetimeChargebacksCents?: bigint,
): LedgerAuditDetails {
  const base: LedgerAuditDetails = {
    referenceType: reference.type,
    referenceId: reference.id,
    absorbedFromPendingCents: fromPendingCents.toString(),
    absorbedFromAvailableCents: fromAvailableCents.toString(),
    newPendingBalanceCents: newPendingBalanceCents.toString(),
    newAvailableBalanceCents: newAvailableBalanceCents.toString(),
  };
  if (newLifetimeChargebacksCents !== undefined) {
    base.newLifetimeChargebacksCents = newLifetimeChargebacksCents.toString();
  }
  return base;
}

/**
 * Map a Prisma idempotency-recovery error code to the human reason string
 * embedded in the matured-skip info log.
 *
 * Matches the literal text the inlined service code used before extraction —
 * load-bearing because grep over Datadog logs uses these substrings.
 */
export function mapIdempotencyRecoveryReason(
  code: 'P2002' | 'P2025',
): 'P2002 concurrent' | 'P2025 stale row' {
  return code === 'P2002' ? 'P2002 concurrent' : 'P2025 stale row';
}
