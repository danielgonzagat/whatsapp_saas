import { describe, it, expect } from 'vitest';
import {
  appendQueryParams,
  authHeaders,
  buildErrorResponse,
  buildQuery,
  buildSearchParams,
  buildSuccessResponse,
  isRawBinaryBody,
  joinQueryString,
  normalizeErrorMessage,
  serializeApiBody,
  shouldSerializeAsJson,
} from './core.helpers';

describe('buildSuccessResponse', () => {
  it('wraps a plain object payload while preserving original keys', () => {
    const payload = { foo: 1, bar: 'b' };
    const res = buildSuccessResponse<typeof payload>(payload, 200);
    expect(res.status).toBe(200);
    expect(res.data).toEqual(payload);
    expect((res as unknown as { foo: number }).foo).toBe(1);
    expect((res as unknown as { bar: string }).bar).toBe('b');
  });

  it('treats array payloads as opaque data', () => {
    const payload = [1, 2, 3];
    const res = buildSuccessResponse<number[]>(payload, 201);
    expect(res.status).toBe(201);
    expect(res.data).toEqual(payload);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it('handles primitive payloads (string, number, boolean, null)', () => {
    expect(buildSuccessResponse('hi', 200).data).toBe('hi');
    expect(buildSuccessResponse(42, 200).data).toBe(42);
    expect(buildSuccessResponse(true, 200).data).toBe(true);
    expect(buildSuccessResponse(null, 200).data).toBe(null);
  });
});

describe('normalizeErrorMessage', () => {
  it('joins array messages with comma+space', () => {
    expect(normalizeErrorMessage(['a', 'b', 'c'])).toBe('a, b, c');
  });

  it('returns string messages unchanged', () => {
    expect(normalizeErrorMessage('boom')).toBe('boom');
  });

  it('returns undefined for undefined input', () => {
    expect(normalizeErrorMessage(undefined)).toBeUndefined();
  });
});

describe('buildErrorResponse', () => {
  it('prefers normalized message over error field', () => {
    const res = buildErrorResponse({ message: 'oops', error: 'unused' }, 400);
    expect(res).toEqual({ error: 'oops', status: 400 });
  });

  it('falls back to error field when message is missing', () => {
    const res = buildErrorResponse({ error: 'forbidden' }, 403);
    expect(res).toEqual({ error: 'forbidden', status: 403 });
  });

  it('falls back to HTTP <status> when nothing else is provided', () => {
    const res = buildErrorResponse({}, 500);
    expect(res).toEqual({ error: 'HTTP 500', status: 500 });
  });

  it('joins array messages before falling back', () => {
    const res = buildErrorResponse({ message: ['a', 'b'] }, 422);
    expect(res).toEqual({ error: 'a, b', status: 422 });
  });
});

describe('buildSearchParams', () => {
  it('skips undefined values', () => {
    const sp = buildSearchParams({ a: '1', b: undefined, c: '3' });
    expect(sp.toString()).toBe('a=1&c=3');
  });

  it('encodes special characters', () => {
    const sp = buildSearchParams({ q: 'hello world&fries' });
    expect(sp.toString()).toBe('q=hello+world%26fries');
  });

  it('returns empty params when all entries are undefined', () => {
    const sp = buildSearchParams({ a: undefined, b: undefined });
    expect(sp.toString()).toBe('');
  });
});

describe('joinQueryString', () => {
  it('returns base url unchanged when qs is empty', () => {
    expect(joinQueryString('/api/things', '')).toBe('/api/things');
  });

  it('uses ? when base has no existing query', () => {
    expect(joinQueryString('/api/things', 'a=1')).toBe('/api/things?a=1');
  });

  it('uses & when base already has a query', () => {
    expect(joinQueryString('/api/things?x=y', 'a=1')).toBe('/api/things?x=y&a=1');
  });
});

describe('appendQueryParams', () => {
  it('returns base unchanged when params is undefined', () => {
    expect(appendQueryParams('/api/x')).toBe('/api/x');
  });

  it('returns base unchanged when params has only undefined entries', () => {
    expect(appendQueryParams('/api/x', { a: undefined })).toBe('/api/x');
  });

  it('appends with ? when base has no query', () => {
    expect(appendQueryParams('/api/x', { a: '1', b: '2' })).toBe('/api/x?a=1&b=2');
  });

  it('appends with & when base already has a query', () => {
    expect(appendQueryParams('/api/x?z=9', { a: '1' })).toBe('/api/x?z=9&a=1');
  });
});

describe('buildQuery', () => {
  it('returns empty string for an empty params object', () => {
    expect(buildQuery({})).toBe('');
  });

  it('skips undefined and null values', () => {
    expect(buildQuery({ a: '1', b: undefined, c: null, d: 4 })).toBe('?a=1&d=4');
  });

  it('coerces numbers to strings', () => {
    expect(buildQuery({ page: 2, perPage: 50 })).toBe('?page=2&perPage=50');
  });

  it('encodes special characters', () => {
    expect(buildQuery({ q: 'hi there' })).toBe('?q=hi+there');
  });
});

describe('authHeaders', () => {
  it('returns empty object when token is absent', () => {
    expect(authHeaders()).toEqual({});
    expect(authHeaders(undefined)).toEqual({});
  });

  it('returns Bearer header when token is provided', () => {
    expect(authHeaders('abc.def.ghi')).toEqual({
      authorization: 'Bearer abc.def.ghi',
    });
  });
});

describe('isRawBinaryBody', () => {
  it('detects FormData', () => {
    expect(isRawBinaryBody(new FormData())).toBe(true);
  });

  it('detects Blob', () => {
    expect(isRawBinaryBody(new Blob(['x']))).toBe(true);
  });

  it('detects ArrayBuffer', () => {
    expect(isRawBinaryBody(new ArrayBuffer(8))).toBe(true);
  });

  it('rejects plain objects, arrays, strings, undefined, null', () => {
    expect(isRawBinaryBody({})).toBe(false);
    expect(isRawBinaryBody([])).toBe(false);
    expect(isRawBinaryBody('hi')).toBe(false);
    expect(isRawBinaryBody(undefined)).toBe(false);
    expect(isRawBinaryBody(null)).toBe(false);
  });
});

describe('shouldSerializeAsJson', () => {
  it('returns true for plain objects', () => {
    expect(shouldSerializeAsJson({ a: 1 })).toBe(true);
  });

  it('returns true for arrays', () => {
    expect(shouldSerializeAsJson([1, 2])).toBe(true);
  });

  it('returns false for raw binary bodies', () => {
    expect(shouldSerializeAsJson(new FormData())).toBe(false);
    expect(shouldSerializeAsJson(new Blob(['x']))).toBe(false);
    expect(shouldSerializeAsJson(new ArrayBuffer(4))).toBe(false);
  });

  it('returns false for primitives, null, undefined', () => {
    expect(shouldSerializeAsJson(undefined)).toBe(false);
    expect(shouldSerializeAsJson(null)).toBe(false);
    expect(shouldSerializeAsJson('hi')).toBe(false);
    expect(shouldSerializeAsJson(42)).toBe(false);
    expect(shouldSerializeAsJson(true)).toBe(false);
  });
});

describe('serializeApiBody', () => {
  it('JSON.stringifies plain objects', () => {
    expect(serializeApiBody({ a: 1 })).toBe('{"a":1}');
  });

  it('JSON.stringifies arrays', () => {
    expect(serializeApiBody([1, 2])).toBe('[1,2]');
  });

  it('returns FormData as-is', () => {
    const fd = new FormData();
    expect(serializeApiBody(fd)).toBe(fd);
  });

  it('returns Blob as-is', () => {
    const blob = new Blob(['x']);
    expect(serializeApiBody(blob)).toBe(blob);
  });

  it('returns null for null/undefined', () => {
    expect(serializeApiBody(undefined)).toBe(null);
    expect(serializeApiBody(null)).toBe(null);
  });

  it('passes string bodies through unchanged', () => {
    expect(serializeApiBody('raw')).toBe('raw');
  });
});
