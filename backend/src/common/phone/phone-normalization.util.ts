/**
 * Canonical cross-channel phone normalization.
 *
 * Source of truth per ADR-0012 (OmniCore). All callers MUST migrate here.
 *
 * Why this exists:
 *   The codebase historically grew >=6 divergent `normalizePhone` /
 *   `normalizePhoneDigits` / `formatPhone` implementations across `whatsapp/`,
 *   `autopilot/`, `meta/`, `checkout/`, `prisma/checkout-paid-effects/` and
 *   `worker/providers/`. Each is byte-similar but semantically slightly
 *   different (some strip `@c.us`, some apply a 10-digit floor, some return
 *   `null`, some return `''`). Canonicalization mission row #39 of
 *   `docs/architecture/DEPRECATION_MAP.md` consolidates them here.
 *
 * Design rules:
 *   - ZERO external dependencies (no libphonenumber). Deterministic,
 *     tree-shake-friendly, runs in worker + backend + (eventually) frontend.
 *   - Brazilian-biased: most KLOEL traffic is BR-mobile. The heuristic that
 *     prepends `55` to 10/11-digit DDD numbers is explicit and documented.
 *   - Strictly typed. The new {@link normalizePhone} returns a structured
 *     {@link NormalizedPhone} object instead of a bare string, so consumers
 *     get `digits`, `e164`, `country`, `valid` in one call.
 *   - The legacy `digits`-only shape lives in
 *     `backend/src/common/phone.ts` (digitsOnly / digitsOrNull /
 *     digitsOrUndefined / whatsappDigits). Those are NOT deprecated — they
 *     are explicit facets used in tight loops where allocating a struct is
 *     wasteful. This module is for the canonical *structured* surface.
 *
 * @see docs/architecture/DEPRECATION_MAP.md #39
 * @see docs/adr/0012-omnicore.md
 */

const NON_DIGIT_RE = /\D/g;
const WHATSAPP_USER_SUFFIX = '@c.us';
const WHATSAPP_NET_SUFFIX = '@s.whatsapp.net';
const WHATSAPP_GROUP_SUFFIX = '@g.us';
const WHATSAPP_LID_SUFFIX = '@lid';
const WHATSAPP_BROADCAST_SUFFIX = '@broadcast';
const WHATSAPP_NEWSLETTER_SUFFIX = '@newsletter';

/** Minimum digit length we accept as a possible phone. */
const MIN_PHONE_DIGITS = 8;

/** Maximum digit length we accept (E.164 max is 15). */
const MAX_PHONE_DIGITS = 15;

/**
 * Structured result of normalizing a free-form phone string.
 *
 * `digits` and `e164` always reflect the same number; `e164` is just
 * `digits` with a leading `+`. `country` is a best-effort ISO 3166-1
 * alpha-2 guess based on the leading country code; null when ambiguous.
 */
export interface NormalizedPhone {
  /** Digits-only canonical form, no '+'. Example: "5511987654321". */
  digits: string;
  /** E.164 with leading '+'. Example: "+5511987654321". */
  e164: string;
  /** ISO 3166-1 alpha-2 country guess (heuristic — BR-biased). */
  country: string | null;
  /** True if the input looked syntactically valid. */
  valid: boolean;
}

/**
 * Strip everything that isn't a digit. Used by older WhatsApp paths
 * when they only need a digits string (no country guess, no validation).
 *
 * Returns `''` for nullish / non-string input. Never throws.
 */
export function extractAsciiDigits(input: string | null | undefined): string {
  if (input === null || input === undefined) {
    return '';
  }
  const asString = typeof input === 'string' ? input : String(input);
  return asString.replace(NON_DIGIT_RE, '');
}

/**
 * Lookup table for narrow country guessing from the leading digits.
 *
 * Only the country codes we actually use are listed; everything else
 * returns `null`. The order matters: longer prefixes must be checked
 * before shorter ones (e.g. `55` for BR before `5` would not exist,
 * but `1` for US must not eat into `+1809` etc — for our needs the
 * simple table below is sufficient).
 */
function guessCountryFromDigits(digits: string): string | null {
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    return 'BR';
  }
  if (digits.startsWith('1') && digits.length === 11) {
    return 'US';
  }
  if (digits.startsWith('44') && digits.length >= 11 && digits.length <= 13) {
    return 'GB';
  }
  if (digits.startsWith('351') && digits.length === 12) {
    return 'PT';
  }
  if (digits.startsWith('34') && digits.length === 11) {
    return 'ES';
  }
  return null;
}

/**
 * Promote a domestic Brazilian DDD+number (10 or 11 digits) into the full
 * 12/13-digit international form by prepending `55`. Returns the input
 * untouched if it doesn't match the BR domestic shape.
 *
 * Rationale: ~95% of KLOEL phone inputs come from BR-resident users typing
 * `(11) 98765-4321` or `11987654321`. Detecting that pattern up front saves
 * every caller from re-implementing the heuristic.
 */
function promoteBrazilianDomestic(digits: string): string {
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

/**
 * Strip a leading "00" international prefix (used in EU dialing) and replace
 * it with nothing — the number that follows is already in country-code form.
 *
 * Example: "0044 20 7946 0958" -> digits "00442079460958" -> "442079460958".
 */
function stripDoubleZeroPrefix(digits: string): string {
  if (digits.startsWith('00') && digits.length > 2) {
    return digits.slice(2);
  }
  return digits;
}

/**
 * Convert a free-form phone string to a normalized form.
 *
 * Behaviour:
 *   - Removes punctuation, whitespace, parens, dashes.
 *   - Strips a leading "00" international prefix (EU dialing convention).
 *   - Recognises a leading `+` as E.164 (the digit-strip preserves the rest).
 *   - Promotes a 10/11-digit Brazilian domestic number by prepending `55`.
 *   - Rejects (returns `null`) anything below {@link MIN_PHONE_DIGITS} or
 *     above {@link MAX_PHONE_DIGITS} after cleaning.
 *
 * Returns `null` for nullish input or strings that don't look like phones.
 * Never throws.
 */
export function normalizePhone(input: string | null | undefined): NormalizedPhone | null {
  if (input === null || input === undefined) {
    return null;
  }
  const raw = typeof input === 'string' ? input : String(input);
  if (!raw) {
    return null;
  }

  const hadPlusPrefix = raw.trim().startsWith('+');
  let digits = extractAsciiDigits(raw);
  if (!digits) {
    return null;
  }

  digits = stripDoubleZeroPrefix(digits);

  // If the caller did not pass a '+' and the number is BR-domestic length,
  // promote it. We DO NOT promote when the user explicitly typed '+' since
  // they already gave us a country code.
  if (!hadPlusPrefix) {
    digits = promoteBrazilianDomestic(digits);
  }

  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
    return null;
  }

  const country = guessCountryFromDigits(digits);
  return {
    digits,
    e164: `+${digits}`,
    country,
    valid: true,
  };
}

/**
 * Trailing-segment matchers for chat ids that are NOT user numbers.
 * Groups, LIDs, broadcasts and newsletters have no canonical phone.
 */
const NON_USER_CHAT_SUFFIXES = [
  WHATSAPP_GROUP_SUFFIX,
  WHATSAPP_LID_SUFFIX,
  WHATSAPP_BROADCAST_SUFFIX,
  WHATSAPP_NEWSLETTER_SUFFIX,
] as const;

/**
 * Extract a phone digit string from a WhatsApp chat id.
 *
 * Accepts the common WAHA / Meta Cloud API shapes:
 *   - `"5511987654321@c.us"`     -> `"5511987654321"`
 *   - `"5511987654321@s.whatsapp.net"` -> `"5511987654321"`
 *   - `"5511987654321"` (bare digits) -> `"5511987654321"`
 *
 * Returns `null` for group / LID / broadcast / newsletter chats and for
 * empty input.
 */
export function extractPhoneFromChatId(chatId: string | null | undefined): string | null {
  if (chatId === null || chatId === undefined) {
    return null;
  }
  const trimmed = typeof chatId === 'string' ? chatId.trim() : String(chatId).trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  for (const suffix of NON_USER_CHAT_SUFFIXES) {
    if (lowered.endsWith(suffix)) {
      return null;
    }
  }

  // Drop the known WhatsApp user suffixes (case-insensitive).
  let core = trimmed;
  for (const suffix of [WHATSAPP_USER_SUFFIX, WHATSAPP_NET_SUFFIX]) {
    if (lowered.endsWith(suffix)) {
      core = trimmed.slice(0, trimmed.length - suffix.length);
      break;
    }
  }

  // If there is still an '@' it is some other unsupported shape; bail out.
  if (core.includes('@')) {
    return null;
  }

  const digits = extractAsciiDigits(core);
  return digits || null;
}

/**
 * Compare two free-form phones and decide whether they likely refer to the
 * same number.
 *
 * Strategy:
 *   1. If both can be {@link normalizePhone}-d, compare `digits` exactly.
 *   2. Otherwise fall back to digit-only equality on the raw strings.
 *   3. As a *loose* tie-breaker, accept a last-8-digit match — but ONLY
 *      when at least one side could NOT be fully canonicalized. This
 *      catches truncated inputs like "5511987654321" vs "987654321"
 *      without false-positive across distinct BR DDDs whose mobile
 *      numbers happen to share the trailing 8 digits.
 *
 * Returns `false` for any nullish input.
 *
 * NOTE: this comparator is intentionally NOT suitable for billing or
 * audit deduplication — those paths must compare normalized E.164
 * strings directly.
 */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return false;
  }
  const ad = extractAsciiDigits(a);
  const bd = extractAsciiDigits(b);
  if (!ad || !bd) {
    return false;
  }
  if (ad === bd) {
    return true;
  }

  const an = normalizePhone(a);
  const bn = normalizePhone(b);
  if (an && bn) {
    // Both canonicalized — trust the canonical digits as the source of truth.
    return an.digits === bn.digits;
  }

  // At least one side failed to canonicalize; fall back to the
  // last-8-digit heuristic so partial inputs still find their match.
  const tail = 8;
  if (ad.length >= tail && bd.length >= tail) {
    return ad.slice(-tail) === bd.slice(-tail);
  }
  return false;
}
