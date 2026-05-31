import { describe, it, expect } from 'vitest';
import {
  BACKOFF_DELAYS_MS,
  buildAbsoluteRequestInit,
  buildRequestHeaders,
  extractFetchErrorMessage,
  isAbsoluteHttpEndpoint,
  isTrustedAbsoluteRequestTarget,
  parseRefreshErrorCode,
  pickAccessToken,
  pickRefreshToken,
} from './core.helpers';

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

describe('isAbsoluteHttpEndpoint', () => {
  it('detects http:// URLs', () => {
    expect(isAbsoluteHttpEndpoint('http://api.example.com/x')).toBe(true);
  });

  it('detects https:// URLs', () => {
    expect(isAbsoluteHttpEndpoint('https://api.example.com/x')).toBe(true);
  });

  it('rejects relative paths', () => {
    expect(isAbsoluteHttpEndpoint('/api/x')).toBe(false);
    expect(isAbsoluteHttpEndpoint('api/x')).toBe(false);
  });

  it('rejects non-http schemes that share a prefix character', () => {
    expect(isAbsoluteHttpEndpoint('httpx://x')).toBe(false);
    expect(isAbsoluteHttpEndpoint('ftp://x')).toBe(false);
    expect(isAbsoluteHttpEndpoint('javascript:alert(1)')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isAbsoluteHttpEndpoint('')).toBe(false);
  });
});

describe('buildAbsoluteRequestInit', () => {
  it('sets method and JSON Content-Type', () => {
    const init = buildAbsoluteRequestInit('POST');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });

  it('JSON.stringifies truthy bodies', () => {
    const init = buildAbsoluteRequestInit('PUT', { a: 1 });
    expect(init.body).toBe('{"a":1}');
  });

  it('serializes arrays as JSON', () => {
    const init = buildAbsoluteRequestInit('POST', [1, 2, 3]);
    expect(init.body).toBe('[1,2,3]');
  });

  it('returns null body when body is undefined or null', () => {
    expect(buildAbsoluteRequestInit('POST').body).toBeNull();
    expect(buildAbsoluteRequestInit('POST', null).body).toBeNull();
    expect(buildAbsoluteRequestInit('POST', undefined).body).toBeNull();
  });

  it('returns null body for falsy primitives (legacy parity)', () => {
    // Mirrors `body ? JSON.stringify(body) : null` from the original
    // inlined init — falsy primitives never made it to JSON.stringify.
    expect(buildAbsoluteRequestInit('POST', 0).body).toBeNull();
    expect(buildAbsoluteRequestInit('POST', '').body).toBeNull();
    expect(buildAbsoluteRequestInit('POST', false).body).toBeNull();
  });

  it('supports the four HTTP verbs the generic client uses', () => {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE'] as const) {
      expect(buildAbsoluteRequestInit(method).method).toBe(method);
    }
  });
});

describe('extractFetchErrorMessage', () => {
  it('returns the message field when present and non-empty', () => {
    expect(extractFetchErrorMessage({ message: 'boom' })).toBe('boom');
  });

  it('prefers message over statusText fallback', () => {
    expect(extractFetchErrorMessage({ message: 'real' }, 'fallback')).toBe('real');
  });

  it('falls back to statusText when body parse is assumed failed (null)', () => {
    expect(extractFetchErrorMessage(null, 'Service Unavailable')).toBe(
      'Service Unavailable',
    );
  });

  it('falls back to statusText when body parse is assumed failed (undefined)', () => {
    expect(extractFetchErrorMessage(undefined, 'Not Found')).toBe('Not Found');
  });

  it('returns Request failed when message is empty string (legacy parity)', () => {
    // Original `error.message || 'Request failed'` treated '' as falsy and
    // jumped straight to the literal — statusText was NOT consulted here.
    expect(extractFetchErrorMessage({ message: '' }, 'Bad Request')).toBe(
      'Request failed',
    );
  });

  it('returns Request failed when message is missing on a parsed object', () => {
    expect(extractFetchErrorMessage({}, 'Bad Request')).toBe('Request failed');
  });

  it('returns Request failed when both parsed and statusText are absent', () => {
    expect(extractFetchErrorMessage(null)).toBe('Request failed');
    expect(extractFetchErrorMessage(null, '')).toBe('Request failed');
    expect(extractFetchErrorMessage(undefined, undefined)).toBe('Request failed');
  });

  it('ignores non-string message fields', () => {
    expect(extractFetchErrorMessage({ message: 123 }, 'fallback')).toBe(
      'Request failed',
    );
    expect(extractFetchErrorMessage({ message: { nested: true } }, 'fallback')).toBe(
      'Request failed',
    );
  });
});
