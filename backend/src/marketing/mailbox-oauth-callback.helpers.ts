import type { ConfigService } from '@nestjs/config';

const TRAILING_SLASHES_RE = /\/+$/;

/**
 * Canonical FRONTEND_URL resolver used by mailbox OAuth callback controllers
 * (Gmail + Microsoft). Reads FRONTEND_URL → NEXT_PUBLIC_APP_URL → process.env
 * fallbacks → 'http://localhost:3000', then strips trailing slashes so a
 * `new URL(target, ...)` call always sees a clean origin.
 */
export function normalizeFrontendUrl(config: ConfigService): string {
  const raw =
    config.get<string>('FRONTEND_URL') ||
    config.get<string>('NEXT_PUBLIC_APP_URL') ||
    process.env.FRONTEND_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000';
  return String(raw).replace(TRAILING_SLASHES_RE, '');
}

/**
 * Canonical OAuth-callback redirect builder for mailbox flows (Gmail + Microsoft).
 *
 * Guards against open-redirects by accepting only relative `returnTo` paths
 * that start with `/` (and not `//`). Anything else falls back to
 * `/marketing/email`. Appends `params` as query string to the resolved URL.
 */
export function buildRedirect(
  config: ConfigService,
  returnTo: string,
  params: Record<string, string>,
): string {
  const target =
    returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/marketing/email';
  const url = new URL(target, normalizeFrontendUrl(config));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
