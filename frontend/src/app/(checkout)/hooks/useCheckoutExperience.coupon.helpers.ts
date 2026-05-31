/**
 * Pure coupon-validation helpers extracted from useCheckoutExperience.
 * These helpers do not touch React state; the hook composes them.
 */

/**
 * Normalize a coupon code for submission: prefer the explicit override,
 * fall back to the current code, trim and upper-case the result.
 */
export function resolveCouponCodeForSubmission(
  explicitCode: string | undefined,
  currentCode: string,
): string {
  return String(explicitCode || currentCode || '')
    .trim()
    .toUpperCase();
}

/**
 * Validate the prerequisites for applying a coupon. Returns an error string
 * when the request cannot proceed, or `null` when the caller may continue.
 */
export function validateCouponPrerequisites(
  nextCode: string,
  workspaceId: string | undefined,
  planId: string | undefined,
): string | null {
  if (!nextCode) {
    return 'Digite um cupom.';
  }
  if (!workspaceId || !planId) {
    return 'Checkout sem contexto para validar cupom.';
  }
  return null;
}

/**
 * Decide whether the coupon flow is enabled. Mirrors the runtime guard in
 * the hook: when `enableCoupon` is explicitly `false`, the flow is disabled.
 */
export function isCouponFlowEnabled(enableCoupon: boolean | undefined): boolean {
  return enableCoupon !== false;
}

/**
 * Pick a human-readable error message from a thrown value during coupon
 * validation. Errors with messages are preserved; everything else maps to
 * the generic "invalid coupon" fallback.
 */
export function resolveCouponErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Cupom inválido ou expirado.';
}

/**
 * Normalize the discount returned by the backend into a non-negative
 * integer in cents. Guards against floats, negatives, and NaN.
 */
export function normalizeCouponDiscountInCents(rawDiscount: unknown): number {
  const parsed = Number(rawDiscount || 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.round(parsed));
}

/**
 * Resolve the canonical, upper-cased coupon code returned by the validator.
 * Falls back to the originally submitted code when the response omits one.
 */
export function resolveAppliedCouponCode(
  responseCode: string | undefined,
  submittedCode: string,
): string {
  return (responseCode || submittedCode).toUpperCase();
}
