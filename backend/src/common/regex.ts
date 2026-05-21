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

/** Template placeholder: `'{{name}}'.replace(NAME_RE, 'John')` → `'John'`. */
export const NAME_RE = /\{\{name\}\}/g;

/** Template placeholder with capture: matches `{{keyName}}` and captures the key. */
export const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/** Strip JSON code-fence markers from LLM output. */
export const JSON_CODE_FENCE_RE = /```json\n?|\n?```/g;

/** Strip Unicode invisible / control characters. */
export const INVISIBLE_CHARS_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g;

/** Detect prompts leaking API keys, secrets, or credentials. */
export const SECRET_MARKER_RE = /(api[_-]?key|secret|token|password|bearer\s+[a-z0-9._-]+)/i;

/** Detect common prompt-injection / jailbreak patterns. */
export const PROMPT_INJECTION_RE =
  /(ignore (all )?(previous|prior) instructions|system prompt|developer message|exfiltrate|reveal hidden|jailbreak|override policy)/i;

/** Validate a skill/agent ID. */
export const VALID_SKILL_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Strip Unicode combining diacritical marks from text (accent normalization). */
export const DIACRITICS_RE = /[\u0300-\u036f]/g;
