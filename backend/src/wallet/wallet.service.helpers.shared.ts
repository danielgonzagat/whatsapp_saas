import type { Prisma, PrepaidWalletTransaction, PrepaidWalletTxType } from '@prisma/client';

import type { FraudReason } from '../payments/fraud/fraud.types';

import type { ChargeUsageResult } from './wallet.types';

/**
 * Shared pure helpers extracted from `wallet.service.ts` — provider-agnostic
 * constants, env resolution, assertions, generic builders, ledger tx-data
 * shapers, and audit envelopes. Anything tied to Stripe or Mercado Pago lives
 * in the sibling modules ({@link ./wallet.service.helpers.stripe},
 * {@link ./wallet.service.helpers.mp}).
 *
 * Hard rule: NO money arithmetic in this file. Helpers may inspect amounts,
 * normalize sign (`absAmountCents`), or format strings, but never combine two
 * money operands into a third value — that stays inside the Prisma
 * transaction in the service so the audit trail and atomicity are obvious.
 */

/** Webhook callback path that Mercado Pago will POST to. */
export const MP_WEBHOOK_PATH = '/webhooks/mercadopago';

/** How long a PIX top-up QR code remains valid. */
export const PIX_EXPIRATION_MINUTES = 30;

/** Canonical `referenceType` used to dedupe Mercado Pago wallet top-ups. */
export const WALLET_MERCADOPAGO_REFERENCE_TYPE = 'mercadopago_pix_topup';

/** Default backend origin used when no env vars are set. */
export const DEFAULT_BACKEND_ORIGIN = 'http://localhost:3001';

/**
 * Resolve the public origin of the backend (used to build webhook callback
 * URLs). Falls back through PUBLIC_BACKEND_URL → BACKEND_URL →
 * NEXT_PUBLIC_API_BASE_URL → localhost. Trailing slash is stripped so callers
 * can append paths safely.
 */
export function resolveBackendOrigin(): string {
  return (
    process.env.PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    DEFAULT_BACKEND_ORIGIN
  ).replace(/\/$/, '');
}

// ------- Top-up / usage assertions -------

/**
 * Assert that a top-up amount is strictly positive. Pure validation — no
 * arithmetic. Throws `RangeError` consistently with the rest of the service
 * so callers can attribute the failure precisely.
 */
export function assertPositiveTopupAmount(amountCents: bigint): void {
  if (amountCents <= 0n) {
    throw new RangeError(
      `createTopupIntent: amountCents must be > 0 (got ${amountCents.toString()})`,
    );
  }
}

/**
 * Assert that a quoted usage cost is strictly positive. Mirrors the
 * historical inline guard in `chargeForUsage`. Uses an assertion predicate
 * so the caller's variable is narrowed to `bigint` without a cast.
 */
export function assertValidQuotedCost(
  quotedCostCents: bigint | undefined,
): asserts quotedCostCents is bigint {
  if (!quotedCostCents || quotedCostCents <= 0n) {
    throw new RangeError(
      `chargeForUsage: quotedCostCents must be > 0 (got ${quotedCostCents?.toString() ?? 'undefined'})`,
    );
  }
}

/**
 * Assert that a catalog `units` argument is a positive finite number.
 * Narrows to `number` after the call so the caller can use it without a
 * cast.
 */
export function assertValidUsageUnits(units: number | undefined): asserts units is number {
  if (!units || units <= 0 || !Number.isFinite(units)) {
    throw new RangeError(`chargeForUsage: units must be > 0 (got ${units})`);
  }
}

/**
 * Assert that the caller supplied exactly one pricing basis for
 * `chargeForUsage`: either catalog units or a quoted cost. Sending both — or
 * neither — is a programmer error.
 */
export function assertExclusivePricingBasis(hasQuotedCost: boolean, hasUnits: boolean): void {
  if (hasQuotedCost === hasUnits) {
    throw new RangeError(
      'chargeForUsage: provide exactly one pricing basis (units or quotedCostCents)',
    );
  }
}

/**
 * Assert that a settlement `actualCostCents` is non-negative. Zero is allowed
 * because a provider may report a free request after the fact.
 */
export function assertNonNegativeActualCost(actualCostCents: bigint): void {
  if (actualCostCents < 0n) {
    throw new RangeError(
      `settleUsageCharge: actualCostCents must be >= 0 (got ${actualCostCents.toString()})`,
    );
  }
}

// ------- Fraud helpers -------

/**
 * Render a fraud decision's reason list as the comma-separated `signal`
 * string the service writes to its warn logs. Centralized so the log shape
 * stays stable across block/review/3DS branches.
 */
export function buildFraudReasonsLog(reasons: readonly FraudReason[]): string {
  return reasons.map((reason) => reason.signal).join(',');
}

/**
 * Classify a `FraudDecision` against a top-up `method` into the action the
 * service should take:
 *  - `block` — reject with a hard error.
 *  - `review` — reject and route to manual review (also covers `require_3ds`
 *    on non-card methods, where 3DS isn't applicable).
 *  - `allow` — proceed to charge creation.
 *
 * Pure decision logic: the helper takes no logger and no exception thrower,
 * the service composes those side effects.
 */
export function classifyTopupFraudDecision(
  decision: { action: 'allow' | 'block' | 'review' | 'require_3ds' },
  method: 'pix' | 'card',
): 'block' | 'review' | 'allow' {
  if (decision.action === 'block') {
    return 'block';
  }
  if (decision.action === 'review' || (decision.action === 'require_3ds' && method !== 'card')) {
    return 'review';
  }
  return 'allow';
}

/**
 * Build the warning log tag for a non-allow fraud gate decision.
 * Maps `block` → `'blocked by antifraud'`, `review` → `'routed to review'`.
 */
export function buildFraudGateWarningMessage(gate: 'block' | 'review'): string {
  return gate === 'block' ? 'blocked by antifraud' : 'routed to review';
}

/**
 * Build the PT-BR user-facing error message for a fraud gate decision.
 * `block` → hard rejection, `review` → manual review notification.
 */
export function buildFraudGateUserMessage(gate: 'block' | 'review'): string {
  return gate === 'block'
    ? 'Recarga bloqueada pela política antifraude.'
    : 'Recarga retida para revisão manual.';
}

// ------- Amount sign + idempotency helpers -------

/**
 * Absolute value for a signed-cents amount. USAGE rows store debits as a
 * negative `amountCents`, so several reconciliation paths need the positive
 * twin without recomputing it ad-hoc.
 *
 * Not arithmetic in the money sense — it normalizes the sign of a single
 * value, no new ledger entry is derived from the result.
 */
export function absAmountCents(amount: bigint): bigint {
  return amount < 0n ? -amount : amount;
}

/**
 * Build the idempotency lookup arguments for
 * `prepaidWalletTransaction.findFirst`. Each wallet write begins with this
 * exact `(referenceType, referenceId, type)` lookup so duplicate webhook /
 * retry deliveries return the previous row instead of creating a fresh
 * one. Centralizing the query shape keeps the idempotency contract obvious
 * and prevents columns from drifting between call sites.
 *
 * Pure: only assembles a Prisma `where`-clause literal. Prisma itself runs
 * the query.
 */
export function buildExistingTxQuery(
  referenceType: string,
  referenceId: string,
  type: PrepaidWalletTxType,
): Prisma.PrepaidWalletTransactionFindFirstArgs {
  return { where: { referenceType, referenceId, type } };
}

// ------- Reference-type + transaction-options -------

/**
 * Default `prisma.$transaction` options for every wallet ledger write.
 * Centralized so all ledger paths share the same isolation level — drift
 * here would silently change concurrency behavior across credit/debit/refund
 * flows.
 */
export const WALLET_TX_OPTIONS = Object.freeze({
  isolationLevel: 'ReadCommitted' as const,
});

/** Canonical `referenceType` prefix for a usage debit row. */
export function buildUsageReferenceType(operation: string): string {
  return `usage:${operation}`;
}

/** Canonical `referenceType` prefix for a settlement adjustment row. */
export function buildSettlementReferenceType(operation: string): string {
  return `adjust:usage:${operation}`;
}

/** Canonical `referenceType` prefix for a refund/compensation row. */
export function buildRefundReferenceType(operation: string): string {
  return `refund:usage:${operation}`;
}

// ------- Ledger tx-data builders (provider-agnostic) -------

/**
 * Shape the `prepaidWalletTransaction.create` data for a USAGE debit. The
 * service has already proven balance sufficiency and computed
 * `newBalanceCents`; this helper just stamps the row with the negated cost
 * (debit) and the caller-supplied usage metadata blob.
 *
 * `usageMetadata` is accepted as `Record<string, unknown>` so the catalog vs.
 * provider_quote shape (built by `buildUsageMetadata`) flows through without
 * forcing the service to cast at the call site.
 */
export function buildUsageDebitTxData(input: {
  walletId: string;
  costCents: bigint;
  newBalanceCents: bigint;
  referenceType: string;
  requestId: string;
  usageMetadata: Record<string, unknown>;
}): Prisma.PrepaidWalletTransactionUncheckedCreateInput {
  return {
    walletId: input.walletId,
    type: 'USAGE',
    amountCents: -input.costCents,
    balanceAfterCents: input.newBalanceCents,
    referenceType: input.referenceType,
    referenceId: input.requestId,
    metadata: input.usageMetadata as Prisma.InputJsonValue,
  };
}

/**
 * Shape the `prepaidWalletTransaction.create` data for a settlement
 * ADJUSTMENT row. The service computes `deltaCents` (signed: positive when
 * the provider charged more than the original debit, negative for a partial
 * refund) and `newBalanceCents`; this helper just renders the row.
 *
 * Sign convention follows the rest of the ledger: a debit-style adjustment
 * is stored as `-deltaCents` so summing `amountCents` reproduces the
 * balance.
 */
export function buildSettlementAdjustmentTxData(input: {
  walletId: string;
  deltaCents: bigint;
  newBalanceCents: bigint;
  settlementReferenceType: string;
  requestId: string;
  settlementMetadata: Record<string, unknown>;
}): Prisma.PrepaidWalletTransactionUncheckedCreateInput {
  return {
    walletId: input.walletId,
    type: 'ADJUSTMENT',
    amountCents: -input.deltaCents,
    balanceAfterCents: input.newBalanceCents,
    referenceType: input.settlementReferenceType,
    referenceId: input.requestId,
    metadata: input.settlementMetadata as Prisma.InputJsonValue,
  };
}

/**
 * Shape the `prepaidWalletTransaction.create` data for a REFUND row that
 * compensates a previously-debited USAGE entry. `refundedCents` is the
 * positive amount being returned to the wallet, and `newBalanceCents` is
 * the post-credit balance the service computed inside the `$transaction`.
 */
export function buildRefundCompensationTxData(input: {
  walletId: string;
  refundedCents: bigint;
  newBalanceCents: bigint;
  refundReferenceType: string;
  requestId: string;
  refundMetadata: Record<string, unknown>;
}): Prisma.PrepaidWalletTransactionUncheckedCreateInput {
  return {
    walletId: input.walletId,
    type: 'REFUND',
    amountCents: input.refundedCents,
    balanceAfterCents: input.newBalanceCents,
    referenceType: input.refundReferenceType,
    referenceId: input.requestId,
    metadata: input.refundMetadata as Prisma.InputJsonValue,
  };
}

/**
 * Shape the early-return `ChargeUsageResult` when an idempotent
 * `chargeForUsage` retry finds an existing USAGE row. The wallet balance is
 * read fresh inside the `$transaction`; this helper just packages it
 * alongside the previously-recorded transaction so the caller doesn't see a
 * fake/zero balance.
 *
 * Note on sign: stored `amountCents` is negative for USAGE rows, so the
 * caller-facing `costCents` projection flips the sign with `-` to keep the
 * external contract (positive `costCents` = positive debit) stable.
 */
export function buildIdempotentChargeUsageResult(input: {
  existing: PrepaidWalletTransaction;
  walletBalanceCents: bigint | null | undefined;
}): ChargeUsageResult {
  return {
    newBalanceCents: input.walletBalanceCents ?? 0n,
    costCents: -input.existing.amountCents,
    transaction: input.existing,
  };
}
