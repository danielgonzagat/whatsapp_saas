// Pure helpers extracted from autopilot/page.tsx to reduce the host
// component's cyclomatic complexity. All transforms are byte-identical to the
// original inline implementation.

export function unwrapSettled<T>(
  result: PromiseSettledResult<unknown>,
  transform: (value: unknown) => T,
  fallback: T,
): T {
  return result.status === 'fulfilled' ? transform(result.value) : fallback;
}

export function unwrapDataEnvelope<T>(value: unknown): T | null {
  if (!value || typeof value !== 'object') {
    return (value ?? null) as T | null;
  }
  const inner = (value as { data?: T }).data;
  return (inner !== undefined ? inner : (value as T)) ?? null;
}

export function unwrapArrayEnvelope<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  const inner = (value as { data?: T[] } | null | undefined)?.data;
  return Array.isArray(inner) ? (inner as T[]) : [];
}
