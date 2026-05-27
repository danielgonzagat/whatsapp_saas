import {
  collapseWhitespace,
  extractAsciiDigits,
  isDigit,
} from './whatsapp-digits.util';

export { extractAsciiDigits };

/**
 * Extract a phone digit string from any WhatsApp chat-id-shaped input.
 *
 * INTENTIONAL DIVERGENCE from the canonical
 * {@link import('../../../common/phone/phone-normalization.util').extractPhoneFromChatId}:
 *
 *   - canonical util → returns `null` for groups (`@g.us`), LIDs (`@lid`),
 *     broadcasts (`@broadcast`), and newsletters (`@newsletter`) since
 *     those carry no real user phone.
 *   - this WhatsApp-channel helper → returns the leading digits before
 *     `@` no-matter-what (group ids, LIDs, etc. included). This preserves
 *     the legacy inbound-WAHA bucketing where every chat — group or 1:1 —
 *     is keyed by its leading digit run so the channel-side session can
 *     dedupe within a single workspace without losing group routing.
 *
 * Per ADR-0012 OmniCore Wave W3 this divergence is intentional and
 * WhatsApp-channel-scoped; non-WhatsApp normalization paths MUST use the
 * canonical common helper.
 *
 * Routes the actual digit extraction through {@link extractAsciiDigits}
 * (which itself wraps the canonical util), so there is no independent
 * digit-strip implementation. Always returns a string (possibly `''`).
 *
 * @see backend/src/common/phone/phone-normalization.util.ts
 * @see docs/adr/0012-kloel-omnicore-channel-unification.md
 * @see docs/architecture/DEPRECATION_MAP.md (phone normalization row)
 */
export function extractPhoneFromChatId(value: unknown): string {
  const input =
    typeof value === 'string'
      ? value.trim()
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value).trim()
        : '';
  const atIndex = input.indexOf('@');
  const core = atIndex >= 0 ? input.slice(0, atIndex) : input;
  return extractAsciiDigits(core);
}

function looksLikePhoneDoePlaceholder(value: string): boolean {
  const parts = collapseWhitespace(value).split(' ');
  if (parts.length < 2) {
    return false;
  }

  const lastPart = parts[parts.length - 1];
  if (!lastPart) {
    return false;
  }
  const last = lastPart.toLowerCase();
  if (last !== 'doe') {
    return false;
  }

  const prefix = parts.slice(0, -1).join('');
  if (!prefix) {
    return false;
  }

  for (const char of prefix) {
    if (char === '+' || char === '-' || char === '(' || char === ')' || char === ' ') {
      continue;
    }
    if (!isDigit(char)) {
      return false;
    }
  }

  return extractAsciiDigits(prefix).length > 0;
}

function trimTrailingPunctuation(value: string): string {
  let end = value.length;
  while (end > 0) {
    const char = value[end - 1];
    if (
      char === '?' ||
      char === '!' ||
      char === '.' ||
      char === ',' ||
      char === ';' ||
      char === ':'
    ) {
      end -= 1;
      continue;
    }
    break;
  }
  return value.slice(0, end).trim();
}

const LITERAL_PLACEHOLDER_NAMES: ReadonlySet<string> = new Set(['doe', 'unknown', 'desconhecido']);

function matchesPhoneDerivedPlaceholder(
  lowered: string,
  normalized: string,
  phoneDigits: string,
): boolean {
  if (!phoneDigits) {
    return false;
  }
  if (lowered === `${phoneDigits} doe`) {
    return true;
  }
  if (extractAsciiDigits(normalized) === phoneDigits) {
    return true;
  }
  return false;
}

/** Is placeholder contact name. */
export function isPlaceholderContactName(value: unknown, phone?: string | null): boolean {
  const normalized = collapseWhitespace(value);
  if (!normalized) {
    return true;
  }

  const lowered = normalized.toLowerCase();
  if (LITERAL_PLACEHOLDER_NAMES.has(lowered)) {
    return true;
  }

  if (looksLikePhoneDoePlaceholder(normalized)) {
    return true;
  }

  const phoneDigits = extractAsciiDigits(phone);
  return matchesPhoneDerivedPlaceholder(lowered, normalized, phoneDigits);
}

/** Extract fallback topic. */
export function extractFallbackTopic(message: string, maxWords = 8, maxExplicitWords = 6) {
  const normalized = collapseWhitespace(message);
  if (!normalized) {
    return null;
  }

  const words = normalized.split(' ');
  const pivotIndex = words.findIndex((word) => {
    const lowered = trimTrailingPunctuation(word).toLowerCase();
    return (
      lowered === 'sobre' ||
      lowered === 'do' ||
      lowered === 'da' ||
      lowered === 'de' ||
      lowered === 'para'
    );
  });

  const candidateWords =
    pivotIndex >= 0 && pivotIndex < words.length - 1
      ? words.slice(pivotIndex + 1, pivotIndex + 1 + maxExplicitWords)
      : words.slice(0, maxWords);

  const compact = trimTrailingPunctuation(candidateWords.join(' ').trim());
  return compact || null;
}

/** Normalize intent text. */
export function normalizeIntentText(message: string): string {
  const normalized = collapseWhitespace(message).toLowerCase().normalize('NFD');
  let result = '';

  for (const char of normalized) {
    const code = char.charCodeAt(0);
    if (code >= 0x0300 && code <= 0x036f) {
      continue;
    }
    result += char;
  }

  return result;
}

/** Includes any phrase. */
export function includesAnyPhrase(haystack: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => haystack.includes(phrase));
}
