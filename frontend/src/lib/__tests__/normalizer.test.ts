import { describe, it, expect } from 'vitest';
import { unwrapArray, unwrapPaginated, normalizeTimestamp } from '../normalizer';

describe('unwrapArray', () => {
  it('returns empty array for null/undefined', () => {
    expect(unwrapArray(null)).toEqual([]);
    expect(unwrapArray(undefined)).toEqual([]);
  });

  it('returns the array directly if input is an array', () => {
    const arr = [1, 2, 3];
    expect(unwrapArray(arr)).toBe(arr);
  });

  it('unwraps from explicit key', () => {
    const data = { products: [{ id: 1 }, { id: 2 }] };
    expect(unwrapArray(data, 'products')).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('unwraps from common "data" key', () => {
    const data = { data: ['a', 'b'] };
    expect(unwrapArray(data)).toEqual(['a', 'b']);
  });

  it('unwraps from "items" key', () => {
    const data = { items: [10, 20] };
    expect(unwrapArray(data)).toEqual([10, 20]);
  });

  it('returns empty array when no matching key found', () => {
    const data = { foo: 'bar' };
    expect(unwrapArray(data)).toEqual([]);
  });
});

describe('unwrapPaginated', () => {
  it('returns empty result for null/undefined', () => {
    expect(unwrapPaginated(null)).toEqual({ items: [], total: 0 });
    expect(unwrapPaginated(undefined)).toEqual({ items: [], total: 0 });
  });

  it('extracts items and total from paginated response', () => {
    const data = {
      data: [{ id: 1 }, { id: 2 }],
      total: 50,
      page: 2,
      hasMore: true,
    };
    const result = unwrapPaginated(data);
    expect(result.items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.total).toBe(50);
    expect(result.page).toBe(2);
    expect(result.hasMore).toBe(true);
  });

  it('defaults total to items.length when no total field', () => {
    const data = { data: ['a', 'b', 'c'] };
    const result = unwrapPaginated(data);
    expect(result.total).toBe(3);
  });

  it('reads total from meta object', () => {
    const data = { data: [1], meta: { total: 100, page: 3 } };
    const result = unwrapPaginated(data);
    expect(result.total).toBe(100);
    expect(result.page).toBe(3);
  });
});

describe('normalizeTimestamp', () => {
  it('returns null for null/undefined/empty', () => {
    expect(normalizeTimestamp(null)).toBeNull();
    expect(normalizeTimestamp(undefined)).toBeNull();
    expect(normalizeTimestamp('')).toBeNull();
  });

  it('returns a Date object from ISO string', () => {
    const result = normalizeTimestamp('2024-01-15T10:30:00Z');
    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });

  it('passes through Date objects', () => {
    const d = new Date('2024-06-01');
    expect(normalizeTimestamp(d)).toBe(d);
  });

  it('returns null for invalid date strings', () => {
    expect(normalizeTimestamp('not-a-date')).toBeNull();
  });
});
