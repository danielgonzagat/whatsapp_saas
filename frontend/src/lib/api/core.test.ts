import { describe, it, expect } from 'vitest';
import { REFRESH_TOKEN_ERROR_CODES } from './auth-errors';

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
