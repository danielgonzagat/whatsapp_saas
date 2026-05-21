/**
 * Canonical shared type aliases for the backend.
 *
 * Phase F+J (Round 5.2 graphify-driven detection) found 30 duplicate
 * `type UnknownRecord = Record<string, unknown>` declarations scattered
 * across kloel/* and whatsapp/* modules. Each one was byte-identical.
 *
 * Consumers re-export from here via `import type { UnknownRecord } from
 * '../common/types'; export type { UnknownRecord };` to keep their public
 * surface stable while the structural definition lives in one place.
 */

/**
 * A plain JS-object whose values are explicitly `unknown`.
 *
 * Use instead of `Record<string, any>` (which silences the type checker)
 * or `object` (too loose). Forces callers to narrow before reading
 * fields, which is the canonical Kloel posture per CLAUDE.md "regra de
 * qualidade de IA" (output validado/parseado quando usado como ação).
 */
export type UnknownRecord = Record<string, unknown>;

/**
 * Narrow an `unknown` to a plain record (or null) at runtime.
 *
 * The "plain record" criterion is: truthy, `typeof === 'object'`,
 * and NOT an Array. Returns the same value cast to `UnknownRecord`
 * so the caller can safely index into it after the null check.
 *
 * Found 5 byte-identical local declarations across `backend/src/payments`,
 * `backend/src/kloel`, and `backend/src/webhooks` before this canonical
 * home was introduced (Round 10, 2026-05-21).
 *
 * Two NON-canonical sibling shapes exist and stay separate:
 * - `agent-runtime.session-store.search.ts` returns `{}` instead of
 *   null (different no-match semantics)
 * - `webhooks.service.ts` accepts Arrays (no Array.isArray guard).
 */
export function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

/**
 * Narrow an `unknown` to a non-empty string (or null).
 * Length-based emptiness check (not trim).
 */
export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
