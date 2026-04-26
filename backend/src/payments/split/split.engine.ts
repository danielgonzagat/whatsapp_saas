import { Logger } from '@nestjs/common';

import type {
  CentsBigInt,
  PercentRoleInput,
  SplitInput,
  SplitLine,
  SplitOutput,
  SplitRole,
} from './split.types';

const logger = new Logger('SplitEngine');

/**
 * Compute the per-stakeholder split for a single sale.
 *
 * Priority order (from ADR 0003):
 *   1. Kloel — marketplace fee + interest (always taken first).
 *   2. Supplier — fixed amount (capped at remaining).
 *   3. Affiliate — % of commission base, capped at remaining.
 *   4. Coproducer — % of commission base, capped at remaining (may be zero).
 *   5. Manager — % of commission base, capped at remaining (may be zero).
 *   6. Seller — absorbs whatever residue remains (may be zero).
 *
 * `commissionBase` for percentage roles is `saleValue - marketplaceFee`, NOT the
 * raw remaining, so the seller's stated commission percentages are computed
 * off the published sale-value-minus-Kloel value (consistent across orders
 * regardless of installment interest).
 *
 * Residue (sub-cent leftover from rounding clamps) is absorbed by Kloel.
 *
 * Invariant (verified by property test):
 *   Σ(splits.amount) + kloelTotal + residue === buyerPaid
 */
function clamp(value: CentsBigInt, ceiling: CentsBigInt): CentsBigInt {
  if (value < 0n) {
    return 0n;
  }
  if (value > ceiling) {
    return ceiling;
  }
  return value;
}

function validateInput(input: SplitInput): void {
  const nonNegativeBig: Array<readonly [string, CentsBigInt]> = [
    ['buyerPaidCents', input.buyerPaidCents],
    ['saleValueCents', input.saleValueCents],
    ['interestCents', input.interestCents],
    ['marketplaceFeeCents', input.marketplaceFeeCents],
  ];
  for (const [field, value] of nonNegativeBig) {
    if (value < 0n) {
      logger.error(`split validation: ${field} must be >= 0`, undefined, {
        field,
        value: value.toString(),
      });
      throw new RangeError(`SplitEngine: ${field} must be >= 0 (got ${value.toString()})`);
    }
  }

  if (input.marketplaceFeeCents > input.saleValueCents) {
    logger.error('split validation: marketplaceFeeCents exceeds saleValueCents', undefined, {
      marketplaceFeeCents: input.marketplaceFeeCents.toString(),
      saleValueCents: input.saleValueCents.toString(),
    });
    throw new RangeError(
      `SplitEngine: marketplaceFeeCents (${input.marketplaceFeeCents.toString()}) cannot exceed saleValueCents (${input.saleValueCents.toString()})`,
    );
  }

  if (input.supplier && input.supplier.amountCents < 0n) {
    logger.error('split validation: supplier amount negative', undefined, {
      supplierAmountCents: input.supplier.amountCents.toString(),
      supplierAccountId: input.supplier.accountId,
    });
    throw new RangeError(`SplitEngine: supplier.amountCents must be >= 0`);
  }

  for (const [field, role] of [
    ['affiliate', input.affiliate],
    ['coproducer', input.coproducer],
    ['manager', input.manager],
  ] as const) {
    if (!role) {
      continue;
    }
    if (!Number.isInteger(role.percentBp) || role.percentBp < 0 || role.percentBp > 10_000) {
      logger.error(`split validation: ${field}.percentBp out of range`, undefined, {
        field,
        percentBp: role.percentBp,
        accountId: role.accountId,
      });
      throw new RangeError(
        `SplitEngine: ${field}.percentBp must be an integer in [0, 10000] (got ${role.percentBp})`,
      );
    }
  }
}

function applyPercentRole(
  role: PercentRoleInput | undefined,
  roleKind: SplitRole,
  commissionBase: CentsBigInt,
  remaining: CentsBigInt,
  splits: SplitLine[],
  options: { keepZero: boolean },
): CentsBigInt {
  if (!role) {
    return remaining;
  }

  const calculated = (commissionBase * BigInt(role.percentBp)) / 10_000n;
  const amount = clamp(calculated, remaining);

  if (amount > 0n || options.keepZero) {
    splits.push({
      accountId: role.accountId,
      role: roleKind,
      amountCents: amount,
    });
  }

  return remaining - amount;
}

function applySupplier(
  supplier: SplitInput['supplier'],
  remaining: CentsBigInt,
  splits: SplitLine[],
): CentsBigInt {
  if (!supplier) {
    return remaining;
  }
  const amount = clamp(supplier.amountCents, remaining);
  if (amount <= 0n) {
    return remaining;
  }
  splits.push({
    accountId: supplier.accountId,
    role: 'supplier',
    amountCents: amount,
  });
  return remaining - amount;
}

function applyPercentRoles(
  input: SplitInput,
  commissionBase: CentsBigInt,
  remaining: CentsBigInt,
  splits: SplitLine[],
): CentsBigInt {
  let current = remaining;
  current = applyPercentRole(input.affiliate, 'affiliate', commissionBase, current, splits, {
    keepZero: false,
  });
  current = applyPercentRole(input.coproducer, 'coproducer', commissionBase, current, splits, {
    keepZero: false,
  });
  current = applyPercentRole(input.manager, 'manager', commissionBase, current, splits, {
    keepZero: false,
  });
  return current;
}

/** Calculate split. */
export function calculateSplit(input: SplitInput, workspaceId?: string): SplitOutput {
  validateInput(input);

  const kloelTotal = input.marketplaceFeeCents + input.interestCents;
  let remaining = input.buyerPaidCents - kloelTotal;
  if (remaining < 0n) {
    logger.error('split: kloel total exceeds buyer paid', undefined, {
      buyerPaidCents: input.buyerPaidCents.toString(),
      marketplaceFeeCents: input.marketplaceFeeCents.toString(),
      interestCents: input.interestCents.toString(),
      kloelTotalCents: kloelTotal.toString(),
      ...(workspaceId ? { workspaceId } : {}),
    });
    return {
      kloelTotalCents: input.buyerPaidCents,
      splits: [],
      residueCents: 0n,
    };
  }

  const commissionBase = input.saleValueCents - input.marketplaceFeeCents;
  const splits: SplitLine[] = [];

  remaining = applySupplier(input.supplier, remaining, splits);
  remaining = applyPercentRoles(input, commissionBase, remaining, splits);

  splits.push({
    accountId: input.seller.accountId,
    role: 'seller',
    amountCents: remaining,
  });

  const totalDistributed = splits.reduce((sum, line) => sum + line.amountCents, 0n);

  logger.log({
    operation: 'splitCalculated',
    workspaceId,
    saleValueCents: input.saleValueCents.toString(),
    numLines: splits.length,
    totalDistributed: totalDistributed.toString(),
    residue: '0',
  });

  return {
    kloelTotalCents: kloelTotal,
    splits,
    residueCents: 0n,
  };
}
