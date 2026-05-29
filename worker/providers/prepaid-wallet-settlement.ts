/**
 * @capability PrepaidWalletSettlement
 * @domain payment
 */
/**
 * ARCHITECTURAL COHESION: Prepaid Wallet Settlement Engine — a closed financial transaction
 * loop handling usage quoting, charge settlement with idempotency, cost calculation from token
 * descriptors, and ledger audit entries. Every settlement step depends on the prior step's
 * computed values (quote → cost → charge → ledger). Keeping this atomic in one file prevents
 * partial-settlement bugs and makes the transactional invariant auditable in a single read.
 *
 * Pure helpers (BigInt arithmetic, validation, metadata builders, Prisma delegate types)
 * were moved to the sibling `prepaid-wallet-settlement.helpers.ts` so they can be unit-tested
 * in isolation. The settlement transaction itself remains here, atomic.
 */

import type { PrepaidWalletTransaction } from '@prisma/client';
import { prisma } from '../db';
import { WorkerWalletNotFoundError } from './prepaid-wallet-errors';
import {
  ZERO_BIG,
  absCents,
  buildAdjustmentMetadata,
  computeNewBalance,
  type ISettleInput,
  type IWorkerWalletPrismaLike,
  type IWorkerWalletTxLike,
} from './prepaid-wallet-settlement.helpers';

export {
  WorkerInsufficientWalletBalanceError,
  WorkerWalletNotFoundError,
} from './prepaid-wallet-errors';

export { quoteSerializedInputTokenCostCents } from './prepaid-wallet-settlement.helpers';

export type {
  BigNumberish,
  ISerializedInputTokenBillingDescriptor,
  SerializedInputTokenBillingDescriptor,
} from './prepaid-wallet-settlement.helpers';

/**
 * Look up an existing settlement adjustment for the given idempotency key.
 *
 * @param tx - Active transaction client.
 * @param settlementReferenceType - Reference type tag for the adjustment.
 * @param requestId - Idempotency key.
 * @returns Existing adjustment row or `null`.
 */
const findExistingAdjustment = (
  tx: IWorkerWalletTxLike,
  settlementReferenceType: string,
  requestId: string,
): Promise<PrepaidWalletTransaction | null> =>
  tx.prepaidWalletTransaction.findFirst({
    where: {
      referenceType: settlementReferenceType,
      referenceId: requestId,
      type: 'ADJUSTMENT',
    },
  });

/**
 * Look up the original USAGE transaction the settlement adjusts.
 *
 * @param tx - Active transaction client.
 * @param usageReferenceType - Reference type tag for the original USAGE row.
 * @param requestId - Idempotency key shared with the original transaction.
 * @returns Original USAGE row or `null` if not found.
 */
const findOriginalUsage = (
  tx: IWorkerWalletTxLike,
  usageReferenceType: string,
  requestId: string,
): Promise<PrepaidWalletTransaction | null> =>
  tx.prepaidWalletTransaction.findFirst({
    where: {
      referenceType: usageReferenceType,
      referenceId: requestId,
      type: 'USAGE',
    },
  });

/**
 * Run the settlement body inside an active transaction.
 *
 * Idempotency: the caller's `requestId` is used both for adjustment lookup and
 * persistence. A repeat invocation with the same `requestId` returns the
 * existing adjustment and never applies a second balance change.
 *
 * @param tx - Active transaction client.
 * @param input - Settlement input descriptor.
 * @returns Persisted adjustment, the previously-persisted adjustment on
 *   replay, or `null` when no adjustment is necessary.
 */
const runSettlement = async (
  tx: IWorkerWalletTxLike,
  input: ISettleInput,
): Promise<PrepaidWalletTransaction | null> => {
  const usageReferenceType = `usage:${input.operation}`;
  const settlementReferenceType = `adjust:${usageReferenceType}`;

  const existing = await findExistingAdjustment(tx, settlementReferenceType, input.requestId);
  if (existing) {
    return existing;
  }

  const originalUsage = await findOriginalUsage(tx, usageReferenceType, input.requestId);
  if (!originalUsage) {
    return null;
  }

  const wallet = await tx.prepaidWallet.findFirst({
    where: { id: originalUsage.walletId, workspaceId: input.workspaceId },
  });
  if (!wallet) {
    throw new WorkerWalletNotFoundError(input.workspaceId);
  }

  const chargedCents = absCents(originalUsage.amountCents);
  const deltaCents = input.actualCostCents - chargedCents;
  if (deltaCents === ZERO_BIG) {
    return null;
  }

  const newBalance = computeNewBalance(wallet, deltaCents);

  await tx.prepaidWallet.updateMany({
    where: { id: wallet.id, workspaceId: input.workspaceId },
    data: { balanceCents: newBalance },
  });

  return tx.prepaidWalletTransaction.create({
    data: {
      walletId: wallet.id,
      type: 'ADJUSTMENT',
      amountCents: -deltaCents,
      balanceAfterCents: newBalance,
      referenceType: settlementReferenceType,
      referenceId: input.requestId,
      metadata: buildAdjustmentMetadata(input, chargedCents, deltaCents, originalUsage.id),
    },
  });
};

/**
 * Settle a previously-quoted usage charge against a prepaid wallet.
 *
 * The function is idempotent on `(operation, requestId)`: the caller may
 * safely retry on transient failure (BullMQ retries, network errors) without
 * double-charging the wallet.
 *
 * @param input - Settlement input descriptor.
 * @param db - Optional Prisma-like client (defaults to the worker singleton).
 * @returns Persisted adjustment on first apply, the existing adjustment on
 *   replay, or `null` when no adjustment is necessary.
 */
export const settleQuotedUsageCharge = async (
  input: ISettleInput,
  db: IWorkerWalletPrismaLike = prisma as object as IWorkerWalletPrismaLike,
): Promise<PrepaidWalletTransaction | null> => {
  if (input.actualCostCents < ZERO_BIG) {
    throw new RangeError(
      `settleQuotedUsageCharge: actualCostCents must be >= 0 (got ${input.actualCostCents.toString()})`,
    );
  }

  return db.$transaction((tx) => runSettlement(tx, input));
};
