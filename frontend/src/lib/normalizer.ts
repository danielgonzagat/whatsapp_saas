/**
 * KLOEL COSMOS — Response Normalizer
 * Utilities to normalize inconsistent backend response shapes.
 */

export interface NormalizedList<T> {
  items: T[];
  total: number;
  page?: number;
  hasMore?: boolean;
}

/**
 * Extracts an array from a response that may be:
 * - An array directly: [...]
 * - Wrapped in an object: { products: [...] } or { data: [...] }
 * - A paginated response: { data: [...], meta: { total, page } }
 */
export function unwrapArray<T>(data: unknown, key?: string): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];

  const obj = data as Record<string, unknown>;

  // Try explicit key first
  if (key && Array.isArray(obj[key])) return obj[key] as T[];

  // Try common keys
  for (const k of [
    'data',
    'items',
    'results',
    'products',
    'contacts',
    'campaigns',
    'flows',
    'deals',
    'conversations',
    'templates',
    'actions',
  ]) {
    if (Array.isArray(obj[k])) return obj[k] as T[];
  }

  return [];
}

/**
 * Extracts a paginated result with { items, total, page, hasMore }
 */
export function unwrapPaginated<T>(data: unknown, key?: string): NormalizedList<T> {
  if (!data) return { items: [], total: 0 };

  const obj = data as Record<string, unknown>;
  const items = unwrapArray<T>(data, key);

  // Extract total from common patterns
  const total =
    (obj.count as number) ??
    (obj.total as number) ??
    ((obj.meta as Record<string, unknown> | undefined)?.total as number) ??
    items.length;

  const page =
    (obj.page as number) ??
    ((obj.meta as Record<string, unknown> | undefined)?.page as number) ??
    1;

  const hasMore =
    (obj.hasMore as boolean) ??
    ((obj.meta as Record<string, unknown> | undefined)?.hasMore as boolean) ??
    undefined;

  return { items, total, page, hasMore };
}

/**
 * Ensures consistent Date handling from ISO strings
 */
export function normalizeTimestamp(value: string | Date | undefined | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
