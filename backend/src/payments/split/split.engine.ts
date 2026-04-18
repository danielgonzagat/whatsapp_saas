import type {
  CentsBigInt,
  PercentRoleInput,
  SplitInput,
  SplitLine,
  SplitOutput,
  SplitRole,
} from './split.types';

/**
 * Compute the per-stakeholder split for a single sale.
 *
 * Priority order (from ADR 0003):
 *   1. Kloel — platform fee + interest (always taken first).
 *   2. Supplier — fixed amount (capped at remaining).
 *   3. Affiliate — % of commission base, capped at remaining.
 *   4. Coproducer — % of commission base, capped at remaining (may be zero).
 *   5. Manager — % of commission base, capped at remaining (may be zero).
 *   6. Seller — absorbs whatever residue remains (may be zero).
 *
 * `commissionBase` for percentage roles is `saleValue - platformFee`, NOT the
 * raw remaining, so the seller's stated commission percentages are computed
 * off the published sale-value-minus-Kloel value (consistent across orders
 * regardless of installment interest).
 *
 * Residue (sub-cent leftover from rounding clamps) is absorbed by Kloel.
 *
 * Invariant (verified by property test):
 *   Σ(splits.amount) + kloelTotal + residue === buyerPaid
 */
export function calculateSplit(input: SplitInput): SplitOutput {
  validateInput(input);

  const kloelTotal = input.platformFeeCents + input.interestCents;
  let remaining = input.buyerPaidCents - kloelTotal;
  if (remaining < 0n) {
    // Pathological: Kloel's fee + interest exceeds what the buyer paid.
    // Keep the entire amount as Kloel + residue so the conservation
    // invariant still holds; the caller should validate inputs upstream.
    return {
      kloelTotalCents: input.buyerPaidCents,
      splits: [],
      residueCents: 0n,
    };
  }

  const commissionBase = input.saleValueCents - input.platformFeeCents;
  const splits: SplitLine[] = [];

  if (input.supplier) {
    const amount = clamp(input.supplier.amountCents, remaining);
    if (amount > 0n) {
      splits.push({
        accountId: input.supplier.accountId,
        role: 'supplier',
        amountCents: amount,
      });
      remaining -= amount;
    }
  }

  remaining = applyPercentRole(input.affiliate, 'affiliate', commissionBase, remaining, splits, {
    keepZero: false,
  });
  remaining = applyPercentRole(input.coproducer, 'coproducer', commissionBase, remaining, splits, {
    keepZero: false,
  });
  remaining = applyPercentRole(input.manager, 'manager', commissionBase, remaining, splits, {
    keepZero: false,
  });

  splits.push({
    accountId: input.seller.accountId,
    role: 'seller',
    amountCents: remaining,
  });

  return {
    kloelTotalCents: kloelTotal,
    splits,
    residueCents: 0n,
  };
}

function applyPercentRole(
  role: PercentRoleInput | undefined,
  roleKind: SplitRole,
  commissionBase: CentsBigInt,
  remaining: CentsBigInt,
  splits: SplitLine[],
  options: { keepZero: boolean },
): CentsBigInt {
  if (!role) return remaining;

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

function clamp(value: CentsBigInt, ceiling: CentsBigInt): CentsBigInt {
  if (value < 0n) return 0n;
  if (value > ceiling) return ceiling;
  return value;
}

function validateInput(input: SplitInput): void {
  const nonNegativeBig: Array<readonly [string, CentsBigInt]> = [
    ['buyerPaidCents', input.buyerPaidCents],
    ['saleValueCents', input.saleValueCents],
    ['interestCents', input.interestCents],
    ['platformFeeCents', input.platformFeeCents],
  ];
  for (const [field, value] of nonNegativeBig) {
    if (value < 0n) {
      throw new RangeError(`SplitEngine: ${field} must be >= 0 (got ${value.toString()})`);
    }
  }

  if (input.platformFeeCents > input.saleValueCents) {
    throw new RangeError(
      `SplitEngine: platformFeeCents (${input.platformFeeCents.toString()}) cannot exceed saleValueCents (${input.saleValueCents.toString()})`,
    );
  }

  if (input.supplier && input.supplier.amountCents < 0n) {
    throw new RangeError(`SplitEngine: supplier.amountCents must be >= 0`);
  }

  for (const [field, role] of [
    ['affiliate', input.affiliate],
    ['coproducer', input.coproducer],
    ['manager', input.manager],
  ] as const) {
    if (!role) continue;
    if (!Number.isInteger(role.percentBp) || role.percentBp < 0 || role.percentBp > 10_000) {
      throw new RangeError(
        `SplitEngine: ${field}.percentBp must be an integer in [0, 10000] (got ${role.percentBp})`,
      );
    }
  }
}
