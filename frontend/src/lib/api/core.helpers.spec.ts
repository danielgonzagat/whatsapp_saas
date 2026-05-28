import { describe, it, expect } from 'vitest';
import {
  buildSuccessResponse,
  normalizeErrorMessage,
  buildErrorResponse,
  buildSearchParams,
  joinQueryString,
  appendQueryParams,
  buildQuery,
  authHeaders,
  isRawBinaryBody,
  shouldSerializeAsJson,
  serializeApiBody,
  BACKOFF_DELAYS_MS,
  isTrustedAbsoluteRequestTarget,
  parseRefreshErrorCode,
  pickAccessToken,
  pickRefreshToken,
  buildRequestHeaders,
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

describe('BACKOFF_DELAYS_MS', () => {
  it('is the canonical 3-step exponential schedule', () => {
    expect(BACKOFF_DELAYS_MS).toEqual([500, 1500, 4000]);
  });

  it('is monotonically increasing', () => {
    for (let i = 1; i < BACKOFF_DELAYS_MS.length; i++) {
      expect(BACKOFF_DELAYS_MS[i]).toBeGreaterThan(BACKOFF_DELAYS_MS[i - 1] as number);
    }
  });
});

describe('isTrustedAbsoluteRequestTarget', () => {
  it('accepts the configured API origin', () => {
    expect(
      isTrustedAbsoluteRequestTarget('https://api.example.com/v1/x', 'https://api.example.com'),
    ).toBe(true);
  });

  it('accepts the provided window origin', () => {
    expect(
      isTrustedAbsoluteRequestTarget(
        'https://app.example.com/page',
        'https://api.example.com',
        'https://app.example.com',
      ),
    ).toBe(true);
  });

  it('rejects unrelated origins', () => {
    expect(
      isTrustedAbsoluteRequestTarget(
        'https://evil.example.com/x',
        'https://api.example.com',
        'https://app.example.com',
      ),
    ).toBe(false);
  });

  it('rejects non-http(s) schemes even when the origin matches', () => {
    expect(
      isTrustedAbsoluteRequestTarget('javascript:alert(1)', 'https://api.example.com'),
    ).toBe(false);
    expect(isTrustedAbsoluteRequestTarget('file:///etc/passwd', 'https://api.example.com')).toBe(
      false,
    );
  });

  it('returns false for malformed URLs', () => {
    expect(isTrustedAbsoluteRequestTarget('not a url', 'https://api.example.com')).toBe(false);
  });

  it('returns false when both origins are empty', () => {
    expect(isTrustedAbsoluteRequestTarget('https://api.example.com/x', '')).toBe(false);
  });
});

describe('parseRefreshErrorCode', () => {
  it('returns the code field when present and string-typed', () => {
    expect(parseRefreshErrorCode({ code: 'refresh_token_expired' })).toBe(
      'refresh_token_expired',
    );
  });

  it('returns undefined when code is missing', () => {
    expect(parseRefreshErrorCode({ message: 'no code here' })).toBeUndefined();
  });

  it('returns undefined when code is not a string', () => {
    expect(parseRefreshErrorCode({ code: 42 })).toBeUndefined();
    expect(parseRefreshErrorCode({ code: null })).toBeUndefined();
    expect(parseRefreshErrorCode({ code: { nested: true } })).toBeUndefined();
  });

  it('returns undefined for non-object bodies', () => {
    expect(parseRefreshErrorCode(null)).toBeUndefined();
    expect(parseRefreshErrorCode(undefined)).toBeUndefined();
    expect(parseRefreshErrorCode('a string')).toBeUndefined();
    expect(parseRefreshErrorCode(123)).toBeUndefined();
  });
});

describe('pickAccessToken / pickRefreshToken', () => {
  it('prefers snake_case fields when both shapes are present', () => {
    expect(pickAccessToken({ access_token: 'snake', accessToken: 'camel' })).toBe('snake');
    expect(pickRefreshToken({ refresh_token: 'snake', refreshToken: 'camel' })).toBe('snake');
  });

  it('falls back to camelCase when snake_case is missing', () => {
    expect(pickAccessToken({ accessToken: 'camel' })).toBe('camel');
    expect(pickRefreshToken({ refreshToken: 'camel' })).toBe('camel');
  });

  it('returns undefined when neither shape is present', () => {
    expect(pickAccessToken({})).toBeUndefined();
    expect(pickRefreshToken({})).toBeUndefined();
  });
});

describe('buildRequestHeaders', () => {
  it('includes Content-Type application/json by default', () => {
    const headers = buildRequestHeaders({ isFormData: false });
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('omits Content-Type for FormData bodies', () => {
    const headers = buildRequestHeaders({ isFormData: true });
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('always sets the CSRF-mitigation header', () => {
    expect(buildRequestHeaders({ isFormData: false })['X-Requested-With']).toBe(
      'XMLHttpRequest',
    );
    expect(buildRequestHeaders({ isFormData: true })['X-Requested-With']).toBe(
      'XMLHttpRequest',
    );
  });

  it('attaches the Authorization header when token is provided', () => {
    const headers = buildRequestHeaders({ isFormData: false, token: 'abc' });
    expect(headers.Authorization).toBe('Bearer abc');
  });

  it('omits Authorization when token is missing/empty/null', () => {
    expect(buildRequestHeaders({ isFormData: false }).Authorization).toBeUndefined();
    expect(buildRequestHeaders({ isFormData: false, token: null }).Authorization).toBeUndefined();
    expect(buildRequestHeaders({ isFormData: false, token: '' }).Authorization).toBeUndefined();
  });

  it('attaches x-workspace-id when workspaceId is provided', () => {
    const headers = buildRequestHeaders({ isFormData: false, workspaceId: 'ws-1' });
    expect(headers['x-workspace-id']).toBe('ws-1');
  });

  it('omits x-workspace-id when workspaceId is missing/empty/null', () => {
    expect(
      buildRequestHeaders({ isFormData: false })['x-workspace-id'],
    ).toBeUndefined();
    expect(
      buildRequestHeaders({ isFormData: false, workspaceId: null })['x-workspace-id'],
    ).toBeUndefined();
    expect(
      buildRequestHeaders({ isFormData: false, workspaceId: '' })['x-workspace-id'],
    ).toBeUndefined();
  });

  it('lets caller-provided headers override defaults except CSRF/auth/workspace', () => {
    const headers = buildRequestHeaders({
      isFormData: false,
      headers: { 'X-Custom': 'yes', 'Content-Type': 'text/plain' },
      token: 'tk',
      workspaceId: 'ws-1',
    });
    expect(headers['X-Custom']).toBe('yes');
    // Caller headers spread BEFORE auth/workspace, so Authorization wins
    expect(headers.Authorization).toBe('Bearer tk');
    expect(headers['x-workspace-id']).toBe('ws-1');
    // Caller can override Content-Type since it spreads after the default
    expect(headers['Content-Type']).toBe('text/plain');
    // CSRF header is set before caller headers; caller could override but no test path needs it
    expect(headers['X-Requested-With']).toBe('XMLHttpRequest');
  });
});
