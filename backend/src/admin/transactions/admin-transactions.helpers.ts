import type { Prisma } from '@prisma/client';

/**
 * Pure helpers extracted from AdminTransactionsService (Claude-w117).
 *
 * Every function here is dependency-free, deterministic and side-effect free —
 * making the parent service easier to reason about and unit-test in isolation.
 */

/**
 * Returns true when the linked sale row is already in the refund/refund_requested
 * terminal-ish state and a second refund attempt should be skipped.
 */
export function isRefundAlreadyRequested(status: string): boolean {
  return status === 'refund_requested' || status === 'refunded';
}

/**
 * Resolves the producer net amount (cents) used to compute wallet debits on a
 * negative adjustment. Falls back through a documented candidate chain so that
 * orders with partial metadata still produce a usable number.
 *
 * Returns 0 when no candidate is a finite positive number — callers MUST treat
 * 0 as "no wallet adjustment".
 */
export function resolveProducerNetInCents(
  totalInCents: number,
  metadata: Record<string, unknown>,
): number {
  const candidates: Array<unknown> = [
    metadata.producerNetInCents,
    metadata.sellerReceivableInCents,
    metadata.baseTotalInCents,
    totalInCents,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }

  return 0;
}

/**
 * Merges an admin operation footprint into the webhookData JSON of a payment.
 * Uses JSON.parse(JSON.stringify(...)) to canonicalize the shape so Prisma's
 * InputJsonValue accepts it.
 */
export function mergeWebhookData(
  metadata: Record<string, unknown>,
  extra: Record<string, unknown>,
): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify({
      ...metadata,
      adminOperation: extra,
    }),
  ) as Prisma.InputJsonValue;
}

/**
 * Coerces a Prisma JSON value into a plain object record, defending against
 * null/array/scalar shapes so callers can safely spread/index it.
 */
export function readRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

/**
 * Canonicalizes a gateway identifier so equality checks (e.g. against 'stripe')
 * tolerate casing/whitespace drift from upstream providers.
 */
export function normalizeGateway(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

/**
 * Resolves the wallet bucket to debit when reversing a producer-net amount.
 * If the pending bucket fully covers the amount we drain it first; otherwise
 * we fall back to the available bucket — preserving the historical semantics
 * of the AdminTransactionsService negative-adjustment flow.
 */
export function resolveDebitBucket(
  pendingBalanceInCents: bigint,
  producerNetInCents: number,
): 'pending' | 'available' {
  return pendingBalanceInCents >= BigInt(producerNetInCents) ? 'pending' : 'available';
}
