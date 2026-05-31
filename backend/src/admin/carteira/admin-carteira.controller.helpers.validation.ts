import { BadRequestException } from '@nestjs/common';
import { FraudBlacklistType } from '@prisma/client';

/**
 * Validation/parsing helpers extracted from {@link AdminCarteiraController}.
 *
 * Every function in this file is dependency-free, deterministic and side-effect
 * free. No Nest decorators, no Prisma client, no I/O.
 *
 * Re-exported through `admin-carteira.controller.helpers.ts` (barrel) so
 * external consumers keep a single import path.
 */

/**
 * Parse a `skip` query string into a non-negative integer.
 *
 * Returns `undefined` when the input is missing/empty or not a finite number so
 * callers can decide whether to spread the value into a Prisma `findMany` arg.
 */
export function parseSkip(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : undefined;
}

/**
 * Parse a `take` query string into an integer clamped to `[1, 200]`.
 *
 * Mirrors {@link parseSkip} so paginated admin endpoints share a single
 * defensive contract for cursor/limit query parameters.
 */
export function parseTake(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(200, Math.max(1, Math.trunc(parsed))) : undefined;
}

/**
 * Trim and upper-case a currency code, falling back to `'BRL'` when the input
 * is missing or empty.
 *
 * Used by every admin treasury endpoint that accepts a currency override so the
 * code path is deterministic and ready for the Prisma layer.
 */
export function normalizeCurrency(raw: string | undefined): string {
  return (
    String(raw ?? 'BRL')
      .trim()
      .toUpperCase() || 'BRL'
  );
}

/**
 * Coerce an arbitrary value into a known {@link FraudBlacklistType}, throwing a
 * `BadRequestException` when the value is not one of the enum members.
 *
 * Pure: the helper does not touch the database; it only converts a query/body
 * field into a typed value or surfaces a 400.
 */
export function parseFraudBlacklistType(value: unknown): FraudBlacklistType {
  const normalized = (typeof value === 'string' ? value : '').trim().toUpperCase();
  if (Object.values(FraudBlacklistType).includes(normalized as FraudBlacklistType)) {
    return normalized as FraudBlacklistType;
  }
  throw new BadRequestException('type must be a valid FraudBlacklistType');
}

/**
 * Trim a free-form string, returning `undefined` when the result is empty so
 * callers can use the optional-property spread pattern.
 */
export function trimOptional(value: string | undefined | null): string | undefined {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Result shape returned by {@link validatePayoutAmount}.
 *
 * Callers receive both the raw safe integer (for audit logs and BadRequest
 * messages) and the `BigInt` form expected by the treasury service so they do
 * not need to repeat the conversion at the call site.
 */
export interface ValidatedPayoutAmount {
  /** Raw integer (cents) — useful for audit detail bodies and error context. */
  readonly amountCents: number;
  /** `BigInt` representation expected by treasury payout services. */
  readonly amountCentsBig: bigint;
}

/**
 * Validate a raw `amountCents` body field for the manual payout endpoints.
 *
 * Throws a `BadRequestException` when the value is missing, non-finite, not a
 * safe integer or non-positive. Otherwise returns the integer form plus its
 * `BigInt` counterpart so the controller can pass the correctly typed value to
 * the treasury payout service without re-parsing.
 */
export function validatePayoutAmount(raw: number | undefined | null): ValidatedPayoutAmount {
  const amountCents = Math.trunc(Number(raw ?? 0));
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new BadRequestException('amountCents must be a positive integer');
  }
  return { amountCents, amountCentsBig: BigInt(amountCents) };
}

/**
 * Resolve the request id for a manual treasury payout.
 *
 * When the operator passes an explicit `requestId` we trust it (after
 * trimming); otherwise we fall back to the supplied UUID generator. Keeping the
 * generator as a parameter makes the helper deterministic in tests.
 */
export function resolveTreasuryPayoutRequestId(
  raw: string | undefined,
  generator: () => string,
): string {
  const trimmed = String(raw ?? '').trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return `marketplace_treasury_po_${generator()}`;
}

/**
 * Require a non-empty trimmed string from a body/path parameter or surface a
 * `BadRequestException` with the provided message.
 *
 * Used by the connect payout request endpoints to validate the path parameter
 * before delegating to the approval service.
 */
export function requireNonEmpty(value: string | undefined, message: string): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    throw new BadRequestException(message);
  }
  return trimmed;
}
