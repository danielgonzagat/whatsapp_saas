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

function readMeta(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  return obj.meta as Record<string, unknown> | undefined;
}

function firstDefinedNumber(
  candidates: Array<number | undefined | null | unknown>,
  fallback: number,
): number {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
  }
  return fallback;
}

function firstDefinedBoolean(
  candidates: Array<boolean | undefined | null | unknown>,
): boolean | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'boolean') return candidate;
  }
  return undefined;
}

function extractTotal(obj: Record<string, unknown>, fallback: number): number {
  const meta = readMeta(obj);
  return firstDefinedNumber([obj.count, obj.total, meta?.total], fallback);
}

function extractPage(obj: Record<string, unknown>): number {
  const meta = readMeta(obj);
  return firstDefinedNumber([obj.page, meta?.page], 1);
}

function extractHasMore(obj: Record<string, unknown>): boolean | undefined {
  const meta = readMeta(obj);
  return firstDefinedBoolean([obj.hasMore, meta?.hasMore]);
}

/**
 * Extracts a paginated result with { items, total, page, hasMore }
 */
export function unwrapPaginated<T>(data: unknown, key?: string): NormalizedList<T> {
  if (!data) return { items: [], total: 0 };

  const obj = data as Record<string, unknown>;
  const items = unwrapArray<T>(data, key);

  return {
    items,
    total: extractTotal(obj, items.length),
    page: extractPage(obj),
    hasMore: extractHasMore(obj),
  };
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
