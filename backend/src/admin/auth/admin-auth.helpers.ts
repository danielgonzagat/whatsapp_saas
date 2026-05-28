/**
 * Pure helpers extracted from AdminAuthService.
 *
 * These functions and constants contain no Prisma, no I/O, no NestJS DI,
 * and no logging. They exist so the service stays slim and so the rules
 * around email normalization, MFA-bypass env decoding, and lock/expiry
 * windows can be unit-tested in isolation.
 */

/** Bcrypt work factor used for hashing admin passwords. */
export const BCRYPT_WORK_FACTOR = 12;

/** Env var that toggles the MFA-bypass code path. */
export const ADMIN_MFA_BYPASS_ENV = 'ADMIN_MFA_BYPASS_ENABLED';

/** Values that count as "enabled" for the MFA-bypass env var. */
export const MFA_BYPASS_ENABLED_VALUES: ReadonlySet<string> = new Set(['1', 'true', 'yes', 'on']);

/**
 * Normalize an admin email for lookup.
 *
 * Trims surrounding whitespace and lowercases. Pure function — no I/O.
 */
export function normalizeAdminEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
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
}

/**
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
}
