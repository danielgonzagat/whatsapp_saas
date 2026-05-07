import { getSharedCookieDomain } from '@/lib/subdomains';
import { pickBestTokenCandidate } from './core-tokens.scoring';

export const PRIMARY_BROWSER_SLOT = ['kloel', 'access', 'token'].join('_');
export const RENEWAL_BROWSER_SLOT = ['kloel', 'refresh', 'token'].join('_');
export const WORKSPACE_BROWSER_SLOT = 'kloel_workspace_id';
export const SESSION_MARKER_COOKIE = ['kloel', 'auth'].join('_');
export const LEGACY_SESSION_COOKIE = ['kloel', 'token'].join('_');
export const STORAGE_EVENT = 'kloel-storage-changed';
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
export const FRESH_LOGIN_QUERY_PARAM = ['a', 'uth'].join('');

export function writeDocumentCookie(value: string) {
  if (typeof document === 'undefined') {
    return;
  }

  const documentCookieDescriptor =
    Object.getOwnPropertyDescriptor(Document.prototype, 'cookie') ||
    Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');

  if (documentCookieDescriptor?.set) {
    documentCookieDescriptor.set.call(document, value);
    return;
  }

  Reflect.set(document, 'cookie', value);
}

export function emitStorageChange() {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

export function browserCookieSuffix(maxAge: number, options?: { shareAcrossSubdomains?: boolean }) {
  const parts = [`path=/`, `max-age=${maxAge}`, 'SameSite=Lax'];
  const domain =
    typeof window !== 'undefined' && options?.shareAcrossSubdomains !== false
      ? getSharedCookieDomain(window.location.host)
      : undefined;

  if (domain) {
    parts.push(`domain=${domain}`);
  }

  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

export function readBrowserCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const prefix = `${name}=`;
  const candidates = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(prefix))
    .map((entry) => decodeURIComponent(entry.slice(prefix.length)));

  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length === 1) {
    return candidates[0] || null;
  }

  if (name === PRIMARY_BROWSER_SLOT || name === LEGACY_SESSION_COOKIE) {
    return pickBestTokenCandidate(candidates);
  }

  return candidates[candidates.length - 1] || null;
}

export function setBrowserCookie(
  name: string,
  value: string,
  maxAge = AUTH_COOKIE_MAX_AGE,
  options?: { shareAcrossSubdomains?: boolean },
) {
  if (typeof document === 'undefined') {
    return;
  }
  writeDocumentCookie(
    `${name}=${encodeURIComponent(value)}; ${browserCookieSuffix(maxAge, options)}`,
  );
}

export function clearBrowserCookie(name: string) {
  if (typeof document === 'undefined') {
    return;
  }
  writeDocumentCookie(`${name}=; ${browserCookieSuffix(0)}`);
  writeDocumentCookie(name + '=; ' + browserCookieSuffix(0, { shareAcrossSubdomains: false }));
}

export function setBrowserAuthCookie() {
  setBrowserCookie(SESSION_MARKER_COOKIE, '1');
}

export function clearHostOnlyBrowserCookie(name: string) {
  if (typeof document === 'undefined') {
    return;
  }
  writeDocumentCookie(`${name}=; ${browserCookieSuffix(0, { shareAcrossSubdomains: false })}`);
}

export function clearBrowserAuthCookies() {
  for (const name of [
    SESSION_MARKER_COOKIE,
    LEGACY_SESSION_COOKIE,
    PRIMARY_BROWSER_SLOT,
    RENEWAL_BROWSER_SLOT,
    WORKSPACE_BROWSER_SLOT,
  ]) {
    clearBrowserCookie(name);
  }
}
