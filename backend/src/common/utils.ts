/**
 * Canonical small utilities for the backend.
 */

/** Read a value as trimmed text — returns '' for non-string/non-number/non-boolean. */
export function readText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}
