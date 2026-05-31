/**
 * Pure CORS origin matching helpers extracted from main.ts.
 *
 * These functions are responsible for compiling CORS origin patterns
 * sourced from environment variables into safe matchers. Keeping them
 * pure (no Nest, no Express, no env reads) makes them trivially unit
 * testable and re-usable from other bootstraps (tests, scripts).
 */

export const MAX_ORIGIN_PATTERN_LENGTH = 200;

/**
 * Returns true when `value` matches the given wildcard pattern.
 * Patterns may contain `*` characters which match any sequence of
 * characters (including the empty string). Anchoring is implicit:
 * the entire value must match the pattern.
 *
 * Examples:
 *   matchesWildcardPattern('https://a.kloel.com', 'https://*.kloel.com') === true
 *   matchesWildcardPattern('https://a.evil.com', 'https://*.kloel.com')  === false
 */
export function matchesWildcardPattern(value: string, pattern: string): boolean {
  if (!pattern.includes('*')) {
    return value === pattern;
  }

  const parts = pattern.split('*');
  let cursor = 0;

  if (!pattern.startsWith('*')) {
    const prefix = parts.shift() ?? '';
    if (!value.startsWith(prefix)) {
      return false;
    }
    cursor = prefix.length;
  }

  const suffix = pattern.endsWith('*') ? '' : (parts.pop() ?? '');

  for (const part of parts) {
    if (!part) {
      continue;
    }

    const nextIndex = value.indexOf(part, cursor);
    if (nextIndex === -1) {
      return false;
    }
    cursor = nextIndex + part.length;
  }

  if (!suffix) {
    return true;
  }

  const suffixIndex = value.indexOf(suffix, cursor);
  return suffixIndex !== -1 && value.endsWith(suffix);
}

/**
 * Normalizes a raw CORS origin pattern string (typically sourced from
 * env vars) into a simplified wildcard form. Returns null if the
 * pattern is empty, too long, or contains disallowed characters.
 *
 * Accepts both `*` style globs and the lightweight regex-style
 * anchors / escapes commonly used in env vars (`^`, `$`, `\.`, `.*`).
 *
 * Logs warnings via the optional `warn` callback (defaults to
 * console.warn) so unit tests can capture them without polluting
 * stdout.
 */
export function normalizeCorsOriginPattern(
  raw: string,
  warn: (message: string, ...args: unknown[]) => void = console.warn,
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > MAX_ORIGIN_PATTERN_LENGTH) {
    warn('[CORS] Origin pattern too long, ignored (%d chars)', trimmed.length);
    return null;
  }

  const normalized = trimmed
    .replace(/^\^/, '')
    .replace(/\$$/, '')
    .replace(/\\\./g, '.')
    .replace(/\.\*/g, '*');

  const isAllowedPattern = /^https?:\/\/[A-Za-z0-9.*:/_-]+$/.test(normalized);
  if (!isAllowedPattern) {
    warn('[CORS] Unsupported origin pattern ignored: %s', trimmed);
    return null;
  }

  return normalized;
}

/**
 * Compiles a raw CORS origin pattern into a matcher function.
 * Returns null when the pattern is invalid / would be rejected by
 * `normalizeCorsOriginPattern`.
 */
export function compileCorsOriginMatcher(
  raw: string,
  warn: (message: string, ...args: unknown[]) => void = console.warn,
): ((origin: string) => boolean) | null {
  const normalized = normalizeCorsOriginPattern(raw, warn);
  if (!normalized) {
    return null;
  }
  return (origin: string) => matchesWildcardPattern(origin, normalized);
}
