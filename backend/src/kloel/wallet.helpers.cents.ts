// @@index: money math + monetary validation extracted from wallet.helpers.ts
// (Wave 64 / Gate-fix2-C). All math is integer-cent. No Prisma, no async, no
// I/O. Side-effect-free.
//
// Why this file exists: keep the SplitEngine math + boundary validation
// reviewable in isolation from the transactional plumbing in wallet.service.
// The KLOEL Stripe baseline mandates that money math (a) lives in centavos
// `bigint`/safe-integer cents and (b) has its own coverage. Co-locating the
// pure pieces here lets the spec exercise the math without spinning a
// PrismaService.

/**
 * Convert a Real-valued monetary `amount` (in BRL) to safe integer cents.
 *
 * Caller chooses whether `0` is acceptable via `allowZero`:
 *  - `processSale` accepts gross=0 (free sample) → `allowZero: true`.
 *  - `requestWithdrawal` / `requestAnticipation` reject 0 → `allowZero: false`.
 *
 * Throws an `Error` (NOT a NestJS exception) when the rounded value is not
 * a safe integer or violates the zero policy. NestJS layer translates as
 * needed.
 */
export function toSafeCents(
  amount: number,
  opts: { allowZero?: boolean; label?: string } = {},
): number {
  const { allowZero = false, label = 'amount' } = opts;
  const cents = Math.round(amount * 100);
  const minValid = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(cents) || cents < minValid) {
    throw new Error(`Invalid ${label}: ${amount}`);
  }
  return cents;
}

/** Result of `calculateSaleSplit` — exposed for ledger metadata + API echo. */
export interface SaleSplit {
  grossAmount: number;
  grossAmountInCents: number;
  gatewayFee: number;
  gatewayFeeInCents: number;
  kloelFee: number;
  kloelFeeInCents: number;
  netAmount: number;
  netAmountInCents: number;
}

/**
 * Pure split math for `processSale`.
 *
 * Money math invariant: integer cents are the source of truth; Real-valued
 * fields are derived projections (divide by 100), never independent
 * floating-point arithmetic. This matches the Wave 2 P6-2 / I11 dual-write
 * contract: the legacy Float columns and the new `*InCents` BigInt columns
 * MUST converge.
 *
 * `gatewayFeePercent` / `kloelFeePercent` are small-magnitude floats from
 * caller config (e.g. `2.99`). We multiply first, round once, then derive.
 */
export function calculateSaleSplit(input: {
  saleAmount: number;
  kloelFeePercent: number;
  gatewayFeePercent: number;
}): SaleSplit {
  const grossAmountInCents = toSafeCents(input.saleAmount, {
    allowZero: true,
    label: 'saleAmount',
  });
  const gatewayFeeInCents = Math.round((grossAmountInCents * input.gatewayFeePercent) / 100);
  const kloelFeeInCents = Math.round((grossAmountInCents * input.kloelFeePercent) / 100);
  const netAmountInCents = grossAmountInCents - gatewayFeeInCents - kloelFeeInCents;

  return {
    grossAmount: input.saleAmount,
    grossAmountInCents,
    gatewayFee: gatewayFeeInCents / 100,
    gatewayFeeInCents,
    kloelFee: kloelFeeInCents / 100,
    kloelFeeInCents,
    netAmount: netAmountInCents / 100,
    netAmountInCents,
  };
}

/** Result of `calculateAnticipationSplit`. */
export interface AnticipationSplit {
  amount: number;
  amountInCents: number;
  feeAmount: number;
  feeAmountInCents: number;
  netAmount: number;
  netAmountInCents: bigint;
}

/**
 * Pure anticipation math for `requestAnticipation`.
 *
 * Moves `amount` from pending → available net of `feePercent`. Same
 * integer-cent-first contract as `calculateSaleSplit`. Returns `bigint`
 * for `netAmountInCents` because the wallet column is `BigInt` and the
 * caller passes it straight into a Prisma `decrement`/`increment`.
 *
 * Rejects amount=0 (anticipating zero is meaningless and would surface as
 * a no-op transaction).
 */
export function calculateAnticipationSplit(input: {
  amount: number;
  feePercent: number;
}): AnticipationSplit {
  const amountInCents = toSafeCents(input.amount, {
    allowZero: false,
    label: 'anticipation amount',
  });
  const feeAmount = Math.round(((input.amount * input.feePercent) / 100) * 100) / 100;
  const feeAmountInCents = Math.round((amountInCents * input.feePercent) / 100);
  const netAmount = input.amount - feeAmount;
  const netAmountInCents = BigInt(amountInCents) - BigInt(feeAmountInCents);

  return {
    amount: input.amount,
    amountInCents,
    feeAmount,
    feeAmountInCents,
    netAmount,
    netAmountInCents,
  };
}

/**
 * Pure guard for caller-supplied monetary amounts before any Prisma I/O.
 *
 * Returns `true` only when `amount` is a positive, finite number. Used by
 * `requestWithdrawal` and `requestAnticipation` to reject obvious garbage
 * (`undefined`, `0`, negatives, `NaN`, `Infinity`) BEFORE opening a
 * transaction. Side-effect-free; intentionally narrow so callers can wire
 * their own PT-BR error envelopes.
 */
export function isValidMonetaryAmount(amount: number | null | undefined): amount is number {
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
}
