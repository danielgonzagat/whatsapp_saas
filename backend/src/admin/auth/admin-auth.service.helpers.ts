/**
 * Pure helpers for AdminAuthService and related admin-auth machinery.
 *
 * Extracted from AdminAuthService, AdminAuthController, and AdminAuthGuard.
 * All exports are pure functions or constants — no Prisma, no I/O, no NestJS
 * DI, no logging. They exist so the service stays slim and the rules around
 * email normalization, MFA-bypass env decoding, lock/expiry windows, token
 * validation, scope enforcement, and header parsing can be unit-tested in
 * isolation.
 */

import { adminErrors } from '../common/admin-api-errors';
import type { AdminTokenScope } from './admin-token.types';
import { WHITESPACE_G_RE } from '../../common/regex';

/** Minimal request shape consumed by the header-parsing helpers. */
export interface HttpRequestLike {
  readonly ip?: string;
  readonly socket?: { readonly remoteAddress?: string };
  readonly headers: Record<string, string | string[] | undefined>;
} /** Bcrypt work factor used for hashing admin passwords. */
export { BCRYPT_ROUNDS as BCRYPT_WORK_FACTOR } from '../../common/constants';

/** Env var that toggles the MFA-bypass code path. */
export const ADMIN_MFA_BYPASS_ENV = 'ADMIN_MFA_BYPASS_ENABLED';

/** Values that count as "enabled" for the MFA-bypass env var. */
export const MFA_BYPASS_ENABLED_VALUES: ReadonlySet<string> = new Set([
  '1',
  'true',
  'yes',
  'on',
]); /**
 * Normalize an admin email for lookup.
 *
 * Trims surrounding whitespace and lowercases. Pure function — no I/O.
 */
export function normalizeAdminEmail(email: string): string {
  return email.trim().toLowerCase();
} /**
 * Decide whether the MFA-bypass env value enables the bypass path.
 *
 * Accepts the raw env string (or `undefined` when unset). The comparison
 * trims and lowercases, then checks `MFA_BYPASS_ENABLED_VALUES`.
 */
export function isMfaBypassEnvEnabled(rawValue: string | undefined): boolean {
  return MFA_BYPASS_ENABLED_VALUES.has(
    String(rawValue ?? '')
      .trim()
      .toLowerCase(),
  );
} /**
 * Determine whether an admin account is currently locked.
 *
 * Returns `true` when `lockedUntil` is set and strictly greater than
 * `now`. A `null`/`undefined` `lockedUntil` means "not locked".
 *
 * `now` defaults to `Date.now()` and is parameterizable for tests.
 */
export function isAccountLocked(
  lockedUntil: Date | null | undefined,
  now: number = Date.now(),
): boolean {
  return Boolean(lockedUntil && lockedUntil.getTime() > now);
}

/**
 * Determine whether a session row is past its expiry.
 *
 * Returns `true` when `expiresAt` is strictly less than `now`.
 *
 * `now` defaults to `Date.now()` and is parameterizable for tests.
 */
export function isSessionExpired(expiresAt: Date, now: number = Date.now()): boolean {
  return expiresAt.getTime() < now;
} // ──────────────────────────────────────────────────────────
// Token validation
// ──────────────────────────────────────────────────────────

/**
 * Extract a Bearer token from an Authorization header value.
 *
 * Returns the raw token string (without the "Bearer " prefix) when the
 * header is well-formed, or `null` when the header is missing, empty, or
 * malformed.
 */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const parts = header.split(WHITESPACE_G_RE);
  if (parts.length !== 2) {
    return null;
  }
  if (parts[0].toLowerCase() !== 'bearer') {
    return null;
  }
  return parts[1] || null;
}

/**
 * Assert that an admin token carries the expected scope.
 *
 * Throws `adminErrors.invalidToken()` when the scope does not match.
 * This replaces the four identical inline checks in the service methods
 * (`changePassword`, `setupMfa`, `verifyInitialMfa`, `verifyMfa`).
 */
export function assertTokenScope(
  admin: { scope: AdminTokenScope },
  expected: AdminTokenScope,
): void {
  if (admin.scope !== expected) {
    throw adminErrors.invalidToken();
  }
} // ──────────────────────────────────────────────────────────
// Header parsing
// ──────────────────────────────────────────────────────────

/**
 * Read the first client IP from an `x-forwarded-for` header.
 *
 * Returns `null` when the header is not a non-empty string or when the
 * first entry is empty after trimming.
 */
export function readForwardedForIp(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string' || header.length === 0) {
    return null;
  }
  const first = header.split(',')[0].trim();
  return first.length > 0 ? first : null;
}

/**
 * Extract the client IP from an Express request.
 *
 * Prefers `x-forwarded-for` (first entry) when present; falls back to
 * `req.ip`, then `req.socket.remoteAddress`, then `'0.0.0.0'`.
 */
export function extractClientIp(req: HttpRequestLike): string {
  const forwarded = readForwardedForIp(req.headers['x-forwarded-for']);
  if (forwarded) {
    return forwarded;
  }
  return req.ip ?? req.socket?.remoteAddress ?? '0.0.0.0';
}

/**
 * Extract the User-Agent string from an Express request.
 *
 * Returns `'unknown'` when the header is missing or not a string.
 */
export function extractUserAgent(req: HttpRequestLike): string {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua : 'unknown';
}
