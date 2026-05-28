/**
 * Intent Router pure helpers — re-export barrel.
 *
 * The catalogue and parser primitives previously lived in this file. They were
 * extracted into sibling modules to keep each piece independently testable:
 *
 * - `./intent-router.parsers` — `IntentPattern` type and pure extractors.
 * - `./patterns/catalog.*`     — thematic chunks of the pattern table.
 * - `./patterns`               — concatenated `INTENT_PATTERNS` array.
 *
 * The public API exported here is unchanged — callers can keep importing from
 * `intent-router.helpers` without modification.
 */

export type { IntentPattern } from './intent-router.parsers';
export {
  parseAmount,
  isDeactivation,
  isCardPaymentMention,
} from './intent-router.parsers';
export { INTENT_PATTERNS } from './patterns';
