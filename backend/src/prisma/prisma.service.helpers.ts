import type { Prisma } from '@prisma/client';

/**
 * Pure helpers extracted from {@link PrismaService}.
 *
 * These functions hold zero Prisma side-effects (no `$transaction`, no DB IO)
 * and exist so the orchestration code in `prisma.service.ts` reads as a thin
 * shell over deterministic primitives that are trivially unit-testable.
 */

/** Lookup-key fields that are sufficient to scope a CheckoutPayment update. */
const CHECKOUT_PAYMENT_LOOKUP_KEYS = ['id', 'orderId', 'externalId'] as const;

/** Token used whenever an unknown (non-Error) value is thrown. */
export const UNKNOWN_ERROR_MESSAGE = 'unknown error';

/** Alternate token used by shutdown logging. */
export const UNKNOWN_ERROR_TOKEN = 'unknown_error';

/** Fallback signal name when none is provided by Nest's shutdown hook. */
export const UNKNOWN_SHUTDOWN_SIGNAL = 'unknown';

/**
 * Extract a string message from an unknown thrown value.
 *
 * `catch (error: unknown)` blocks would otherwise have to inline the
 * `instanceof Error` ternary. Centralising it removes 8+ identical sites in
 * {@link PrismaService} and gives the redactor a single place to grow.
 */
export function extractErrorMessage(
  error: unknown,
  fallback: string = UNKNOWN_ERROR_MESSAGE,
): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Extract a stack trace from an unknown thrown value, when one exists.
 *
 * Used by the startup connection log to feed Nest's logger second arg.
 */
export function extractErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

/**
 * Build the standard hook-failure log message used across every checkout
 * side-effect hook (member access, social lead, CAPI, commission, wallet,
 * WhatsApp, etc.).
 */
export function formatHookFailureMessage(hookName: string, error: unknown): string {
  return `${hookName} hook failed: ${extractErrorMessage(error)}`;
}

/**
 * Build the shutdown log message used by `beforeApplicationShutdown`.
 */
export function formatShutdownStartMessage(signal?: string): string {
  return `Encerrando conexões Prisma antes do shutdown (${signal || UNKNOWN_SHUTDOWN_SIGNAL}).`;
}

/**
 * Build the shutdown failure message used when `$disconnect` rejects.
 */
export function formatShutdownFailureMessage(error: unknown): string {
  return `Falha ao encerrar Prisma no shutdown: ${extractErrorMessage(error, UNKNOWN_ERROR_TOKEN)}`;
}

/**
 * Predicate: is the CheckoutOrder update flipping status to `PAID`?
 *
 * Centralises the literal so that future enum/string changes have one site.
 */
export function isPaidCheckoutOrderUpdate(args: Prisma.CheckoutOrderUpdateManyArgs): boolean {
  return args.data.status === 'PAID';
}

/**
 * Predicate: is the CheckoutPayment update flipping status to `APPROVED`?
 */
export function isApprovedCheckoutPaymentUpdate(
  args: Prisma.CheckoutPaymentUpdateManyArgs,
): boolean {
  return args.data.status === 'APPROVED';
}

/**
 * Query-inspector: is the `where` clause for a CheckoutPayment update narrow
 * enough that we can safely fan out to its orders?
 *
 * A truly empty `where` would let the hook scan every payment in the DB.
 */
export function hasCheckoutPaymentLookupKey(
  where: Prisma.CheckoutPaymentWhereInput | undefined,
): boolean {
  if (!where) {
    return false;
  }
  return CHECKOUT_PAYMENT_LOOKUP_KEYS.some(
    (key) => (where as Record<string, unknown>)[key] !== undefined,
  );
}

/**
 * Query-inspector: pull a CheckoutOrder identifier pair (`id`, `workspaceId`)
 * from a `where` clause, returning `null` for either when not a string.
 *
 * Member-access grants require BOTH ids so we never grant cross-workspace.
 */
export function extractCheckoutOrderIdentity(
  where: Prisma.CheckoutOrderWhereInput | undefined,
): { orderId: string | null; workspaceId: string | null } {
  const raw = (where || {}) as Record<string, unknown>;
  return {
    orderId: typeof raw.id === 'string' ? raw.id : null,
    workspaceId: typeof raw.workspaceId === 'string' ? raw.workspaceId : null,
  };
}

/**
 * Build the deterministic per-workspace+member-area+email key used by the
 * advisory lock that serialises duplicate-enrollment attempts.
 *
 * Email is lower-cased so `Alice@x` and `alice@x` collide on the same lock.
 */
export function buildEnrollmentLockKey(input: {
  workspaceId: string;
  memberAreaId: string;
  customerEmail: string;
}): string {
  return `${input.workspaceId}:${input.memberAreaId}:${input.customerEmail.toLowerCase()}`;
}

/**
 * Compute the `avgCompletion` numeric value persisted to MemberArea after a
 * new enrollment lands. Coerces `null`/`undefined` to 0 so the column never
 * drifts to NaN.
 */
export function computeMemberAreaAvgCompletion(progress: number | null | undefined): number {
  return Number(progress || 0);
}

/**
 * Decide the student name persisted on MemberEnrollment. Prefers the explicit
 * customer name when present; otherwise falls back to the email so the row is
 * never anonymous.
 */
export function pickEnrollmentStudentName(input: {
  customerName?: string | null;
  customerEmail: string;
}): string {
  return input.customerName || input.customerEmail;
}
