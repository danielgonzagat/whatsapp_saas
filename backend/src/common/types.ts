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
