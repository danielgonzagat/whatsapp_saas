/**
 * Connect-account + treasury payout helpers extracted from
 * {@link AdminCarteiraController}.
 *
 * Pure: no DB access, no Nest decorators, no I/O. Re-exported through the
 * `admin-carteira.controller.helpers.ts` barrel so external import paths stay
 * stable.
 */

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
