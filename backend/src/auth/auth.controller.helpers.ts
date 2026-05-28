import type { CookieOptions, Response } from 'express';
import { getJwtCookieMaxAgeMs } from './jwt-config';
import type { AuthenticatedRequest } from '../common/interfaces';

/** Name of the cookie that carries the JWT for browser-based clients. */
export const KLOEL_TOKEN_COOKIE = 'kloel_token';

/** Generic "user not authenticated" error message reused across protected endpoints. */
export const NOT_AUTHENTICATED_MESSAGE = 'Usuário não autenticado';

/**
 * Build the Set-Cookie options used for the Kloel auth cookie.
 * Keeps the matrix of httpOnly/secure/sameSite/maxAge/path in one place so
 * register, login, refresh and any future endpoint stay aligned.
 */
export function buildAuthCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: getJwtCookieMaxAgeMs(),
    path: '/',
  };
}

/**
 * Persist `accessToken` as the kloel_token cookie on the given response,
 * using the canonical cookie options. No-op when the token is empty/undefined.
 */
export function setAuthCookie(res: Response, accessToken: string | null | undefined): void {
  if (!accessToken) {
    return;
  }
  res.cookie(KLOEL_TOKEN_COOKIE, accessToken, buildAuthCookieOptions());
}

/**
 * Spread helper that builds `{ ip }` only when `ip` is defined.
 * Encodes the project rule "never send `undefined` IPs into the service layer".
 */
export function ipSpread(ip: string | undefined): { ip?: string } {
  return ip !== undefined ? { ip } : {};
}

/**
 * Mask an email for Sentry breadcrumbs so we keep enough signal for triage
 * without leaking PII. Returns the first three characters followed by `***`.
 * Handles empty/undefined gracefully (returns just `***`).
 */
export function maskEmailForSentry(email: string | null | undefined): string {
  const safe = String(email ?? '').trim();
  return safe.substring(0, 3) + '***';
}

/**
 * Pull the authenticated agent id from a JWT-bearing request.
 * Throws a plain `Error` (preserving the existing controller contract) when
 * the user is missing or `sub` is empty.
 */
export function requireAgentId(req: AuthenticatedRequest): string {
  const agentId = req.user?.sub;
  if (!agentId) {
    throw new Error(NOT_AUTHENTICATED_MESSAGE);
  }
  return agentId;
}

/**
 * `true` when the underlying error carries an HTTP 409 (Conflict) status.
 * Mirrors `(err as { status?: number } | null)?.status === 409` defensively.
 */
export function isConflictStatus(err: unknown): boolean {
  return (err as { status?: number } | null)?.status === 409;
}

/**
 * `true` when the payload likely carries a referral code.
 * Tolerant to unknown shapes (used for Sentry extras).
 */
export function hasReferralCode(body: unknown): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }
  return Boolean((body as Record<string, unknown>).referralCode);
}
