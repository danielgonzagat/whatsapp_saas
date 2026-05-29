/**
 * Low-level digit / whitespace helpers used by WhatsApp normalization.
 *
 * `extractAsciiDigits` here is a `unknown`-tolerant thin wrapper over the
 * canonical {@link import('../../../common/phone/phone-normalization.util').extractAsciiDigits}.
 * It preserves the historical contract used by WhatsApp inbound paths
 * (accepts numbers / booleans / nulls / objects, never throws) while
 * routing the actual digit-strip through the canonical implementation.
 *
 * @see backend/src/common/phone/phone-normalization.util.ts
 * @see docs/architecture/DEPRECATION_MAP.md (phone normalization row)
 */
import { extractAsciiDigits as canonicalExtractAsciiDigits } from '../../../common/phone/phone-normalization.util';

const WHITESPACE_RE = /\s+/g;

/** Is digit. */
export function isDigit(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 48 && code <= 57;
}

/**
 * Coerces the common scalar shapes (string, number, boolean) into a string.
 * Everything else (null, undefined, objects, arrays, ...) collapses to ''.
 *
 * Pulled out so `collapseWhitespace` and `extractAsciiDigits` can share the
 * same branch without each being measured as a CCN-6 hotspot by Codacy.
 */
function coerceToString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

/** Collapse whitespace. */
export function collapseWhitespace(value: unknown): string {
  return coerceToString(value).replace(WHITESPACE_RE, ' ').trim();
}

/**
 * Extract ASCII digits from an arbitrary value.
 *
 * Thin `unknown`-tolerant adapter over the canonical
 * {@link canonicalExtractAsciiDigits}: coerces non-string scalars first
 * (preserving the legacy "number/boolean → its string form" semantic) and
 * collapses objects/null/undefined to `''`.
 */
export function extractDigitsLoose(value: unknown): string {
  return canonicalExtractAsciiDigits(coerceToString(value));
}
