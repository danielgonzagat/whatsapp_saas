/**
 * Audit-envelope builders for `wallet.service.ts`. Captures the JSON-safe
 * metadata blobs persisted on usage / settlement / refund ledger rows plus
 * the Sentry insufficient-balance envelope. Costs are stringified because
 * they're bigint and Prisma's JSON column can't carry bigint natively.
 *
 * Re-exported from {@link ./wallet.service.helpers.ts}.
 */

/**
 * Audit envelope for `chargeForUsage`. Pure derivation: receives the
 * already-computed cost and renders the JSON-safe `metadata` body persisted
 * on the wallet transaction. Costs are stringified because they're bigint
 * and Prisma's JSON column can't carry bigint natively.
 */
export function buildUsageMetadata(input: {
  operation: string;
  billingMode: 'provider_quote' | 'catalog';
  costCents: bigint;
  units?: number;
  pricePerUnitCents?: bigint;
  callerMetadata?: Record<string, unknown> | undefined;
}): Record<string, unknown> {
  if (input.billingMode === 'provider_quote') {
    return {
      operation: input.operation,
      billingMode: 'provider_quote',
      quotedCostCents: input.costCents.toString(),
      ...(input.callerMetadata ?? {}),
    };
  }
  return {
    operation: input.operation,
    billingMode: 'catalog',
    units: input.units,
    pricePerUnitCents: input.pricePerUnitCents?.toString(),
    ...(input.callerMetadata ?? {}),
  };
}

/**
 * Audit envelope for `settleUsageCharge`. Captures the original charged
 * amount, the provider-reported actual, and the delta — so an auditor can
 * reconstruct the reconciliation without consulting the original usage row.
 */
export function buildSettlementMetadata(input: {
  operation: string;
  reason: string;
  actualCostCents: bigint;
  chargedCostCents: bigint;
  deltaCents: bigint;
  originalUsageTransactionId: string;
  callerMetadata?: Record<string, unknown> | undefined;
}): Record<string, unknown> {
  return {
    operation: input.operation,
    reason: input.reason,
    actualCostCents: input.actualCostCents.toString(),
    chargedCostCents: input.chargedCostCents.toString(),
    deltaCents: input.deltaCents.toString(),
    originalUsageTransactionId: input.originalUsageTransactionId,
    ...(input.callerMetadata ?? {}),
  };
}

/**
 * Audit envelope for `refundUsageCharge`.
 */
export function buildRefundMetadata(input: {
  operation: string;
  reason: string;
  originalUsageTransactionId: string;
  callerMetadata?: Record<string, unknown> | undefined;
}): Record<string, unknown> {
  return {
    operation: input.operation,
    reason: input.reason,
    originalUsageTransactionId: input.originalUsageTransactionId,
    ...(input.callerMetadata ?? {}),
  };
}

/**
 * Build the Sentry envelope reported when a usage debit lands on a wallet
 * with insufficient balance. Captures the requested cost vs. the
 * available balance as strings so bigint values survive Sentry's JSON
 * serialization.
 */
export function buildInsufficientBalanceReport(input: {
  walletId: string;
  workspaceId: string;
  operation: string;
  costCents: bigint;
  balanceCents: bigint;
}): {
  error: Error;
  extra: {
    walletId: string;
    workspaceId: string;
    operation: string;
    costCents: string;
    balanceCents: string;
  };
} {
  return {
    error: new Error(
      `prepaid_wallet_insufficient: id=${input.walletId} need=${input.costCents.toString()} have=${input.balanceCents.toString()}`,
    ),
    extra: {
      walletId: input.walletId,
      workspaceId: input.workspaceId,
      operation: input.operation,
      costCents: input.costCents.toString(),
      balanceCents: input.balanceCents.toString(),
    },
  };
}
