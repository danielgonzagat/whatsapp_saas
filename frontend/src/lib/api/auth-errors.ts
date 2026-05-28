/**
 * Refresh token error codes — mirrored from the backend
 * `REFRESH_TOKEN_ERROR_CODES` enum in
 * `backend/src/auth/auth-service.tokens.ts`.
 *
 * The backend returns these as `data.code` in the 401/503 response body
 * from `POST /auth/refresh`. The frontend interceptor dispatches per-code
 * recovery instead of blindly clearing credentials.
 *
 * Keys AND values MUST stay byte-identical to the backend export. A
 * regression spec asserts this contract on both sides — see
 * `backend/src/auth/auth-service.tokens.spec.ts` and
 * `frontend/src/lib/api/core.test.ts`.
 */
export const REFRESH_TOKEN_ERROR_CODES = {
  /** Token is unknown to the server (not in DB). */
  UNKNOWN: 'refresh_token_unknown',
  /** Agent record missing or detached from the token. */
  AGENT_MISSING: 'refresh_token_agent_missing',
  /** Replay attack detected — all sibling tokens revoked server-side. */
  REPLAYED: 'refresh_token_replayed',
  /** Refresh token is past its 30-day expiry. */
  EXPIRED: 'refresh_token_expired',
  /** Another concurrent request claimed the one-shot refresh token first. */
  RACE_LOST: 'refresh_token_race_lost',
  /** Token issuance step failed after successful claim (transient — retry). */
  ISSUANCE_FAILED: 'refresh_token_issuance_failed',
} as const;

export type RefreshTokenErrorCode =
  (typeof REFRESH_TOKEN_ERROR_CODES)[keyof typeof REFRESH_TOKEN_ERROR_CODES];
