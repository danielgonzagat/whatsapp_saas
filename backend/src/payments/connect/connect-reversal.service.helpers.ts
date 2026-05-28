import type { SplitRole } from '../split/split.types';

import { asRecord, asString } from '../../common/types';

/**
 * Stripe Connect post-sale snapshot describing a single transfer line that
 * was persisted at sale time. Sits in the helpers module so the service and
 * its spec share the same shape without dragging Nest providers in.
 */
export interface PersistedManualTransfer {
  /** Stakeholder role tag. */
  role: SplitRole;
  /** Destination Stripe account id. */
  accountId: string;
  /** Original transfer amount, in cents, stringified bigint. */
  amountCents: string;
  /** Stripe transfer id used as idempotency anchor. */
  stripeTransferId: string;
}

/**
 * Aggregate of seller + manual transfers captured at sale time. Inputs to
 * proportional reversal planning live here in pure form so the planner is
 * fully deterministic and testable without Stripe / Prisma.
 */
export interface ReversalSnapshot {
  /** Buyer paid total in cents (bigint). */
  buyerPaidCents: bigint;
  /** Stripe transfer_group string (or null when unavailable). */
  transferGroup: string | null;
  /** Seller destination Stripe account id. */
  sellerStripeAccountId: string | null;
  /** Seller destination amount in cents (bigint). */
  sellerDestinationAmountCents: bigint;
  /** Manual stakeholder transfer rows persisted at sale time. */
  manualTransfers: PersistedManualTransfer[];
}

/**
 * Single planned reversal — output of {@link planProportionalReversals}.
 * Apply directly via Stripe.transfers.createReversal + ledger debit.
 */
export interface PlannedReversal {
  /** Stakeholder role tag. */
  role: SplitRole;
  /** Destination Stripe account id (the original transfer destination). */
  accountId: string;
  /** Amount to reverse, in cents (bigint). */
  amountCents: bigint;
  /** Original Stripe transfer id to reverse against. */
  stripeTransferId: string;
}

/**
 * Tie-break ordering when two transfers share the same fractional remainder
 * during proportional cent distribution. Lower number wins (i.e. supplier
 * gets the leftover cent before seller). Frozen to avoid silent mutation
 * by downstream callers (helpers must be referentially pure).
 */
export const ROLE_PRIORITY: Readonly<Record<SplitRole, number>> = Object.freeze({
  supplier: 1,
  affiliate: 2,
  coproducer: 3,
  manager: 4,
  seller: 5,
});

/**
 * Parse an `unknown` into a non-negative or signed bigint when the source is a
 * digit-only string or a safe integer. Returns `0n` for anything else (null,
 * float, NaN, hex, garbage) so the planner never crashes on malformed snapshot
 * payloads — the audit trail catches the zero downstream.
 */
export function parseBigIntString(value: unknown): bigint {
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return BigInt(value);
  }
  return 0n;
}

/**
 * Parse a webhook-data `transfers` field into a strongly-typed array,
 * silently dropping rows that don't match the {@link PersistedManualTransfer}
 * shape. Non-array input yields `[]` so the planner can run on partial data.
 */
export function parseManualTransfers(value: unknown): PersistedManualTransfer[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is PersistedManualTransfer => {
    const row = asRecord(item);
    return (
      row !== null &&
      typeof row.role === 'string' &&
      typeof row.accountId === 'string' &&
      typeof row.amountCents === 'string' &&
      typeof row.stripeTransferId === 'string'
    );
  });
}

/**
 * Build a {@link ReversalSnapshot} from a raw webhook-data blob. Returns
 * `null` when either `splitInput` or `connectPostSale` sub-record is missing
 * — callers should treat that as "no snapshot persisted" and skip Stripe
 * reversal planning.
 */
export function buildSnapshot(webhookData: unknown): ReversalSnapshot | null {
  const root = asRecord(webhookData);
  if (!root) {
    return null;
  }

  const splitInput = asRecord(root.splitInput);
  const connectPostSale = asRecord(root.connectPostSale);
  if (!splitInput || !connectPostSale) {
    return null;
  }

  return {
    buyerPaidCents: parseBigIntString(splitInput.buyerPaidCents),
    transferGroup: asString(connectPostSale.transferGroup),
    sellerStripeAccountId: asString(connectPostSale.sellerStripeAccountId),
    sellerDestinationAmountCents: parseBigIntString(connectPostSale.sellerDestinationAmountCents),
    manualTransfers: parseManualTransfers(connectPostSale.transfers),
  };
}

/**
 * Compute proportional reversals across the supplied transfer lines such
 * that the sum equals `(totalEligible * requestedAmountCents) / buyerPaidCents`,
 * with fractional cents distributed to the highest-remainder lines first
 * (tie-broken by {@link ROLE_PRIORITY} then by Stripe transfer id).
 *
 * Returns `[]` for any non-positive input — never throws. Each output row's
 * `amountCents` is guaranteed `> 0n`. The algorithm preserves the original
 * line ordering in the result.
 *
 * Money invariant: never produces a reversal exceeding the original line
 * amount; the bonus cent loop skips rows whose floor already equals their
 * line.amountCents.
 */
export function planProportionalReversals(
  lines: ReadonlyArray<{
    role: SplitRole;
    accountId: string;
    amountCents: bigint;
    stripeTransferId: string;
  }>,
  requestedAmountCents: bigint,
  buyerPaidCents: bigint,
): PlannedReversal[] {
  if (requestedAmountCents <= 0n || buyerPaidCents <= 0n || lines.length === 0) {
    return [];
  }

  const totalEligible = lines.reduce((sum, line) => sum + line.amountCents, 0n);
  const totalTarget = (totalEligible * requestedAmountCents) / buyerPaidCents;
  const withFractions = lines.map((line) => {
    const numerator = line.amountCents * requestedAmountCents;
    return {
      ...line,
      floorAmount: numerator / buyerPaidCents,
      remainder: numerator % buyerPaidCents,
    };
  });
  const sumFloors = withFractions.reduce((sum, line) => sum + line.floorAmount, 0n);
  let remainderToDistribute = totalTarget - sumFloors;

  const sorted = [...withFractions].sort((a, b) => {
    if (a.remainder === b.remainder) {
      if (ROLE_PRIORITY[a.role] === ROLE_PRIORITY[b.role]) {
        return a.stripeTransferId.localeCompare(b.stripeTransferId);
      }
      return ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role];
    }
    return a.remainder > b.remainder ? -1 : 1;
  });

  const bonus = new Map<string, bigint>();
  for (const line of sorted) {
    if (remainderToDistribute <= 0n) {
      break;
    }
    if (line.floorAmount >= line.amountCents) {
      continue;
    }
    bonus.set(line.stripeTransferId, (bonus.get(line.stripeTransferId) ?? 0n) + 1n);
    remainderToDistribute -= 1n;
  }

  return withFractions
    .map((line) => ({
      role: line.role,
      accountId: line.accountId,
      stripeTransferId: line.stripeTransferId,
      amountCents: line.floorAmount + (bonus.get(line.stripeTransferId) ?? 0n),
    }))
    .filter((line) => line.amountCents > 0n);
}
