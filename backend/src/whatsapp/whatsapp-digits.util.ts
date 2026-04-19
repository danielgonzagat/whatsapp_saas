/**
 * Low-level digit / whitespace helpers used by WhatsApp normalization.
 *
 * Extracted from whatsapp-normalization.util.ts so each helper is measured
 * on its own by complexity scanners (Codacy / lizard bundles neighbouring TS
 * functions into a single inflated-CCN entry when they live together).
 */
const WHITESPACE_RE = /\s+/g;

export function isDigit(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 48 && code <= 57;
}

export function collapseWhitespace(value: unknown): string {
  return (
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : ''
  )
    .replace(WHITESPACE_RE, ' ')
    .trim();
}

export function extractAsciiDigits(value: unknown): string {
  const input =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : '';
  let result = '';

  for (const char of input) {
    if (isDigit(char)) {
      result += char;
    }
  }

  return result;
}
