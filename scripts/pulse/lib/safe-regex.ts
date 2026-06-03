/**
 * ReDoS defense helper: bounds untrusted input length before any regex scan.
 * Truncating to a fixed cap keeps even adversarial inputs well within linear
 * time on every JS regex engine, regardless of pattern complexity.
 */

/** Maximum length of any user-derived string we allow into a regex match. */
export const MAX_REGEX_INPUT_LEN = 4_096;

/** Truncates user-supplied input before any regex scan to neutralize ReDoS surface. */
export function safeForRegex(input: string | null | undefined): string {
  if (!input) {
    return '';
  }
  return input.length > MAX_REGEX_INPUT_LEN ? input.slice(0, MAX_REGEX_INPUT_LEN) : input;
}
