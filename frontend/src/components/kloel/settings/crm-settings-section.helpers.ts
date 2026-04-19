// Pure helpers extracted from crm-settings-section.tsx to reduce the host
// component's cyclomatic complexity. Behaviour is identical to the original
// inline logic; no visual delta is introduced.

/**
 * Convert an unknown thrown value into a user-facing error message, falling
 * back to a caller-supplied default when no `Error.message` is available.
 */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function formatMoney(value?: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'R$ 0,00';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
