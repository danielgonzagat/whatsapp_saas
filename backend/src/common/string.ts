/**
 * Canonical string helpers shared across backend modules.
 *
 * Phase F+J of the canonicalization mission consolidated:
 * - 2 duplicate `normalizeEmail` implementations (auth-service / auth)
 *   into one. The checkout variant intentionally returns `null` for empty
 *   input and stays local in `backend/src/checkout/`.
 * - 4 duplicate `safeStr` implementations (lead-brain / lead-processor /
 *   workspace-context / product-sub-resources/common) — all functionally
 *   identical, only parameter names differed.
 *
 * The gate `scripts/ops/check-canonical-duplicates.mjs` flags new
 * duplicates of these symbols.
 */

/**
 * Trim and lowercase an email address.
 *
 * Always returns a string (`''` for null/undefined/empty input).
 * For nullable semantics (return `null` instead of `''`), use the local
 * `checkout-social-lead.util.ts::normalizeEmail` variant.
 */
export function normalizeEmail(email: string): string {
  return String(email || '')
    .trim()
    .toLowerCase();
}

/**
 * Coerce `value` to a string when it is already string/number/boolean/bigint,
 * otherwise return `fallback` (default `''`).
 *
 * Use for safely rendering arbitrary user/external data without
 * `null`/`undefined`/`object` surprises. `bigint` support was added so this
 * helper can also serve the mind-verbalizer surface (which previously had
 * its own `safeString` variant that only differed by handling bigint).
 */
export function safeStr(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return fallback;
}
