/**
 * Low-level digit / whitespace helpers used by WhatsApp normalization.
 *
 * Extracted from whatsapp-normalization.util.ts so each helper is measured
 * on its own by complexity scanners (Codacy / lizard bundles neighbouring TS
 * functions into a single inflated-CCN entry when they live together).
 */
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

/** Extract ascii digits. */
export function extractAsciiDigits(value: unknown): string {
  const input = coerceToString(value);
  let result = '';
  for (const char of input) {
    if (isDigit(char)) {
      result += char;
    }
  }
  return result;
}
