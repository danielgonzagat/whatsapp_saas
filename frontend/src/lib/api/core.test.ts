import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { REFRESH_TOKEN_ERROR_CODES } from './auth-errors';
import { ensureFreshAccessToken, tokenStorage } from './core';

function createTestJwt(payload: Record<string, unknown>) {
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `header.${encoded}.signature`;
}

/**
 * Cross-tab refresh / 429 backoff behaviour lives in `core.ts` and is
 * exercised end-to-end by the auth integration tests. This unit spec
 * locks the contract that every recovery branch in `doRefreshAccessToken`
 * matches a code the backend actually emits — i.e. the frontend mirror
 * stays byte-identical to `backend/src/auth/auth-service.tokens.ts`.
 */
describe('REFRESH_TOKEN_ERROR_CODES (frontend mirror)', () => {
  it('exposes the 6 expected keys', () => {
    expect(Object.keys(REFRESH_TOKEN_ERROR_CODES).sort()).toEqual(
      [
        'AGENT_MISSING',
        'EXPIRED',
        'ISSUANCE_FAILED',
        'RACE_LOST',
        'REPLAYED',
        'UNKNOWN',
      ].sort(),
    );
  });

  it('each value matches the backend string literal exactly', () => {
    // These strings are the wire format the backend uses in the 401/503
    // response body. If a value drifts here, the switch case in core.ts
    // silently falls through to the default `clear-and-redirect` branch.
    expect(REFRESH_TOKEN_ERROR_CODES.UNKNOWN).toBe('refresh_token_unknown');
    expect(REFRESH_TOKEN_ERROR_CODES.AGENT_MISSING).toBe('refresh_token_agent_missing');
    expect(REFRESH_TOKEN_ERROR_CODES.REPLAYED).toBe('refresh_token_replayed');
    expect(REFRESH_TOKEN_ERROR_CODES.EXPIRED).toBe('refresh_token_expired');
    expect(REFRESH_TOKEN_ERROR_CODES.RACE_LOST).toBe('refresh_token_race_lost');
    expect(REFRESH_TOKEN_ERROR_CODES.ISSUANCE_FAILED).toBe('refresh_token_issuance_failed');
  });

  it('values are all unique', () => {
    const values = Object.values(REFRESH_TOKEN_ERROR_CODES);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('ensureFreshAccessToken transient-failure handling', () => {
  const expiredToken = createTestJwt({
    sub: 'u1',
    email: 'a@b.com',
    exp: Math.floor(Date.now() / 1000) - 60,
  });

  beforeEach(() => {
    document.cookie = `kloel_access_token=${expiredToken}; path=/`;
    document.cookie = 'kloel_refresh_token=refresh-token; path=/';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.cookie = 'kloel_access_token=; path=/; max-age=0';
    document.cookie = 'kloel_refresh_token=; path=/; max-age=0';
  });

  it('keeps the session when /auth/refresh throws (network/timeout)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network timeout'));

    const refreshed = await ensureFreshAccessToken();

    expect(refreshed).toBe(false);
    // Transient failure must NOT clear the still-usable credentials.
    expect(tokenStorage.getToken()).toBe(expiredToken);
    expect(tokenStorage.getRefreshToken()).toBe('refresh-token');
  });

  it('clears the session only on an explicit auth rejection from /auth/refresh', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: REFRESH_TOKEN_ERROR_CODES.EXPIRED }),
    } as Response);

    const refreshed = await ensureFreshAccessToken();

    expect(refreshed).toBe(false);
    expect(tokenStorage.getToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });
});
