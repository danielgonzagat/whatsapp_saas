/**
 * Pure helpers extracted from useCheckoutExperienceSocial.
 *
 * These functions do not touch React state, the DOM, network, or any
 * browser API beyond the WHATWG `URL` constructor. They are unit-testable
 * in isolation and exist so the orchestrating hook stays focused on
 * sequencing state transitions rather than computing payloads/strings.
 */

import type { CheckoutExperienceForm, Formatters } from './checkout-experience-social-helpers';

const D_RE = /\D/g;

const DEFAULT_FINALIZE_ERROR_MESSAGE = 'Erro ao processar o checkout. Tente novamente.';
const DEFAULT_COUPON_ERROR_MESSAGE = 'Cupom inválido ou expirado.';
const DEFAULT_STRIPE_ERROR_MESSAGE = 'Erro ao confirmar o pagamento no Stripe.';

/**
 * Pick a human-readable error message from a thrown value, falling back
 * to the supplied default when the error isn't a real Error instance or
 * carries no message. Mirrors the inline `error instanceof Error ? ...`
 * pattern used across the social checkout hook.
 */
export function extractSubmitErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

/**
 * Convenience wrapper around `extractSubmitErrorMessage` with the
 * canonical fallback string used by `finalizeOrder`.
 */
export function resolveFinalizeOrderErrorMessage(error: unknown): string {
  return extractSubmitErrorMessage(error, DEFAULT_FINALIZE_ERROR_MESSAGE);
}

/**
 * Convenience wrapper around `extractSubmitErrorMessage` with the
 * canonical fallback string used by `applyCoupon`.
 */
export function resolveApplyCouponErrorMessage(error: unknown): string {
  return extractSubmitErrorMessage(error, DEFAULT_COUPON_ERROR_MESSAGE);
}

/**
 * Resolve the Stripe payment confirmation error message. Empty/whitespace
 * inputs collapse to the canonical fallback so the hook never surfaces a
 * blank submit-error banner to the buyer.
 */
export function resolveStripeConfirmationErrorMessage(message: string | null | undefined): string {
  if (typeof message !== 'string') {
    return DEFAULT_STRIPE_ERROR_MESSAGE;
  }
  return message.trim() ? message : DEFAULT_STRIPE_ERROR_MESSAGE;
}

/**
 * Count the digit characters in a CPF-shaped string. Used to enforce the
 * 11-digit minimum before allowing boleto generation.
 */
export function countCpfDigits(cpf: string | null | undefined): number {
  if (!cpf) {
    return 0;
  }
  return cpf.replace(D_RE, '').length;
}

/**
 * Fields the social checkout knows how to auto-format on input.
 */
const FORMATTED_FIELDS: ReadonlySet<keyof CheckoutExperienceForm> = new Set([
  'cpf',
  'cardCpf',
  'phone',
  'cep',
]);

/**
 * Apply the per-field formatter to a raw input value. Unknown fields
 * pass through unchanged, preserving the original behavior of the hook's
 * `updateField` dispatcher.
 */
export function formatCheckoutFieldValue(
  field: keyof CheckoutExperienceForm,
  rawValue: string,
  fmt: Formatters,
): string {
  if (!FORMATTED_FIELDS.has(field)) {
    return rawValue;
  }
  if (field === 'cpf' || field === 'cardCpf') {
    return fmt.cpf(rawValue);
  }
  if (field === 'phone') {
    return fmt.phone(rawValue);
  }
  return fmt.cep(rawValue);
}

export type SafeSuccessRedirect = {
  href: string;
  path: string;
};

/**
 * Validate that a backend-supplied success URL stays on the current origin
 * and project the resulting absolute href + same-origin path so the hook
 * can hand them to `window.location.href` or the Next router safely.
 *
 * Throws when the resolved origin doesn't match the supplied origin —
 * mirrors the runtime check the hook performs before redirecting.
 */
export function buildSafeSuccessRedirect(
  successPath: string,
  origin: string,
): SafeSuccessRedirect {
  const url = new URL(successPath, origin);
  if (url.origin !== origin) {
    throw new Error('Redirecionamento bloqueado: destino externo detectado.');
  }
  return {
    href: url.href,
    path: `${url.pathname}${url.search}${url.hash}`,
  };
}

/**
 * Identity-only projection used when advancing from step 1 to step 2.
 * Keeps the lead-progress payload schema in one place so the hook's
 * callback dependency arrays stay legible.
 */
export function buildIdentityLeadProgress(form: CheckoutExperienceForm) {
  return {
    name: form.name,
    email: form.email,
    phone: form.phone,
    cpf: form.cpf,
  } as const;
}

/**
 * Identity + address projection used when advancing from step 2 to step 3.
 */
export function buildAddressLeadProgress(form: CheckoutExperienceForm) {
  return {
    ...buildIdentityLeadProgress(form),
    cep: form.cep,
    street: form.street,
    number: form.number,
    neighborhood: form.neighborhood,
    city: form.city,
    state: form.state,
    complement: form.complement,
  } as const;
}

/**
 * Normalize the discount returned by the coupon validator into a
 * non-negative integer in cents. Mirrors the inline math previously
 * inside `acceptCoupon`.
 */
export function normalizeAcceptedCouponDiscount(rawDiscount: unknown): number {
  const parsed = Number(rawDiscount || 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.round(parsed));
}

/**
 * Coerce the configured coupon-popup delay into a finite, non-negative
 * millisecond value. The hook previously used a bare `Number(... || 1800)`
 * which would surface `NaN` for non-numeric configuration strings.
 */
export function resolveCouponPopupDelay(rawDelay: unknown, fallback = 1800): number {
  const parsed = Number(rawDelay || fallback);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

/**
 * Parse the desired installments count from the form, clamping at 1 so
 * the pricing engine never receives a zero/negative installment count.
 */
export function parseInstallmentsField(raw: string | null | undefined): number {
  const parsed = Number.parseInt(String(raw || '1'), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return parsed;
}
