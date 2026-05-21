/**
 * Canonical shared regex constants for the backend.
 *
 * Wave G (2026-05-21) found 12 byte-identical PATTERN_RE declarations
 * across 3 groups (UUID dash, slug edge hyphen, trailing slash). Each
 * gets a dedicated exported constant here so callers can import the
 * canonical instance instead of re-declaring.
 *
 * For digit-related regex (NON_DIGIT_RE), see common/phone.ts.
 */

/** Strip dashes from UUID-like strings: `value.replace(UUID_DASH_RE, '')`. */
export const UUID_DASH_RE = /-/g;

/** Trim leading/trailing dashes from slug strings: `value.replace(SLUG_EDGE_HYPHEN_RE, '')`. */
export const SLUG_EDGE_HYPHEN_RE = /^-|-$/g;

/** Strip trailing slashes from URLs: `value.replace(TRAILING_SLASH_RE, '')`. */
export const TRAILING_SLASH_RE = /\/+$/;

/**
 * Collapse runs of whitespace (including newlines) to a single instance.
 * Wave G (2026-05-21) found 9 byte-identical declarations under names
 * S_RE / WHITESPACE_G_RE / SPACE_RE.
 *
 * Usage: `value.replace(WHITESPACE_G_RE, ' ')` to normalize spacing.
 */
export const WHITESPACE_G_RE = /\s+/g;
