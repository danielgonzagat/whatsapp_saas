/**
 * Canonical phone-number facets shared across backend modules.
 *
 * Phase F+J (Round 4.1) of the canonicalization mission consolidates 3
 * divergent `normalizePhone` implementations into 3 explicit facets:
 *
 * - `digitsOnly(value)`       — base normalizer: digits, empty string if none
 * - `digitsOrNull(value)`     — nullable variant: returns `null` if empty
 * - `whatsappDigits(value)`   — WhatsApp-specific: also strips `@c.us` and
 *                               `@s.whatsapp.net` suffixes
 *
 * Naming the facets explicitly (rather than overloading `normalizePhone`
 * with optional args) is intentional: each call site declares which
 * semantic it wants, no per-caller surprise.
 */

/**
 * Canonical "non-digit characters" regex.
 *
 * Wave F (2026-05-21) found 22 local `const D_RE = /\D/g` declarations
 * across `backend/src/auth/`, `whatsapp/`, `checkout/`, `meta/`, `cia/`,
 * `flows/`, etc. — all byte-identical. Exported here so callers can
 * import the canonical instance instead of re-declaring it.
 *
 * Use via {@link digitsOnly} when possible (preferred — encapsulates
 * the regex). Use the bare constant only when the value must be passed
 * to a non-string `.replace` invocation that this module's facets don't
 * cover.
 */
export const NON_DIGIT_RE = /\D/g;
const WHATSAPP_USER_SUFFIX = '@c.us';
const WHATSAPP_NET_SUFFIX = '@s.whatsapp.net';

/**
 * Strip every non-digit character. Returns `''` for null/undefined input.
 *
 * Use when the field is always shown and empty is acceptable.
 * For nullable lookup semantics, see `digitsOrNull`.
 */
export function digitsOnly(value: string | null | undefined): string {
  return String(value ?? '').replace(NON_DIGIT_RE, '');
}

/**
 * Strip every non-digit character. Returns `null` if the result is empty.
 *
 * Use in checkout / lead workflows where a missing phone must propagate
 * as `null` (not as `''`) so the downstream Prisma query and validator
 * treat it correctly.
 */
export function digitsOrNull(value: string | null | undefined): string | null {
  const digits = digitsOnly(value);
  return digits || null;
}

/**
 * Strip every non-digit character. Returns `undefined` if input is non-string
 * or result is empty.
 *
 * Use in KYC / Stripe Connect onboarding where empty phone fields must be
 * OMITTED from the outgoing API payload (Stripe rejects empty-string fields
 * with type=phone). Equivalent to `readTrimmedString(value) -> digits || undefined`.
 *
 * Two call sites previously had byte-identical local re-implementations:
 *   - kyc/kyc.helpers.ts::digitsOnly (exported, value: unknown)
 *   - payments/connect/connect.service.ts::digitsOnly (local)
 */
export function digitsOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const normalized = trimmed.replace(NON_DIGIT_RE, '');
  return normalized || undefined;
}

/**
 * WhatsApp-specific normalizer: drop `@c.us` / `@s.whatsapp.net` suffix
 * BEFORE stripping non-digits, so a WhatsApp JID like
 * `5511999999999@s.whatsapp.net` becomes `5511999999999`.
 *
 * Use exclusively in WhatsApp inbound/outbound paths where the JID
 * format leaks from WAHA / Meta Cloud API. Other paths must use
 * `digitsOnly` (cheaper, no string scan).
 */
export function whatsappDigits(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(WHATSAPP_USER_SUFFIX, '')
    .replace(WHATSAPP_NET_SUFFIX, '')
    .replace(NON_DIGIT_RE, '');
}
