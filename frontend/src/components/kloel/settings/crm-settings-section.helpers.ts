// Pure helpers extracted from crm-settings-section.tsx to reduce the host
// component's cyclomatic complexity. Behaviour is identical to the original
// inline logic; no visual delta is introduced.

// `formatMoney` re-exported from the canonical money helper (DUP merge).
export { formatMoney } from '@/lib/common/money';

/**
 * Convert an unknown thrown value into a user-facing error message, falling
 * back to a caller-supplied default when no `Error.message` is available.
 */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
