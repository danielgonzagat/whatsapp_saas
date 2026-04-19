// Pure helpers extracted from video/page.tsx to reduce the host component's
// cyclomatic complexity. Behaviour is identical to the original inline logic.

/**
 * Convert an unknown thrown value into a user-facing error message,
 * falling back to a module-specific default when no string is available.
 */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Safely read a string field from an unknown API payload, returning the
 * provided fallback when the field is missing or not a string.
 */
export function readStringField(
  data: unknown,
  field: string,
  fallback: string | null = null,
): string | null {
  if (data && typeof data === 'object' && field in data) {
    const value = (data as Record<string, unknown>)[field];
    if (typeof value === 'string') return value;
  }
  return fallback;
}
