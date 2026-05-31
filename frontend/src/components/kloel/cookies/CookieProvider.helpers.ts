import type { CookieConsentPreferences } from './cookie-types';

/**
 * Event name dispatched on `window` to open the cookie-preferences modal from
 * anywhere in the app. Centralised here so the dispatcher and the listener stay
 * in sync.
 */
export const OPEN_COOKIE_PREFERENCES_EVENT = 'kloel:open-cookie-preferences';

/**
 * Hostnames where the cookie consent UX surfaces (banner + preferences modal +
 * script manager). Other tenants/preview hosts intentionally render no banner.
 */
export const COOKIE_CONSENT_HOSTS = ['kloel.com', 'www.kloel.com'] as const;

/**
 * Toast auto-dismiss window after the user saves preferences, in milliseconds.
 */
export const COOKIE_TOAST_DURATION_MS = 2500;

/**
 * Coerce arbitrary input (backend response payload, persisted blob, partial
 * preferences) into a fully-formed `CookieConsentPreferences`.
 *
 * Rules:
 * - `null`/`undefined` → returns `null` (no consent recorded yet).
 * - `necessary` is always `true` (LGPD/GDPR mandatory category).
 * - `analytics` / `marketing` coerced to boolean.
 * - `updatedAt` is forwarded only when present, never invented.
 *
 * Pure function — no side effects, safe to use in any environment.
 */
export function normalizeConsent(
  input?: CookieConsentPreferences | null,
): CookieConsentPreferences | null {
  if (!input) {
    return null;
  }

  return {
    necessary: true,
    analytics: Boolean(input.analytics),
    marketing: Boolean(input.marketing),
    ...(input.updatedAt !== undefined ? { updatedAt: input.updatedAt } : {}),
  };
}

/**
 * Whether the given hostname is one of the surfaces that should render the
 * cookie consent banner. Case-insensitive, exact match (subdomains like
 * `app.kloel.com` intentionally return `false`).
 */
export function isCookieConsentSurface(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (COOKIE_CONSENT_HOSTS as readonly string[]).includes(normalized);
}
