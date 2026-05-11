import { decodeKloelJwtPayload, hasAuthenticatedKloelToken } from '@/lib/auth-identity';
import { getSharedCookieDomain } from '@/lib/subdomains';
import {
  PRIMARY_BROWSER_SLOT,
  RENEWAL_BROWSER_SLOT,
  WORKSPACE_BROWSER_SLOT,
  SESSION_MARKER_COOKIE,
  LEGACY_SESSION_COOKIE,
  FRESH_LOGIN_QUERY_PARAM,
  readBrowserCookie,
  setBrowserCookie,
  setBrowserAuthCookie,
  clearHostOnlyBrowserCookie,
  clearBrowserAuthCookies,
  emitStorageChange,
} from './core-tokens-storage';

let freshAuthReconciled = false;

export function removeFreshAuthQueryParam() {
  if (typeof window === 'undefined') {
    return;
  }
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.delete(FRESH_LOGIN_QUERY_PARAM);
  window.history.replaceState(window.history.state, '', nextUrl.toString());
}

export function reconcileFreshSharedAuthSession() {
  if (typeof window === 'undefined' || freshAuthReconciled) {
    return;
  }

  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.get(FRESH_LOGIN_QUERY_PARAM) !== '1') {
    return;
  }

  freshAuthReconciled = true;
  if (!getSharedCookieDomain(window.location.host)) {
    removeFreshAuthQueryParam();
    return;
  }

  for (const name of [
    SESSION_MARKER_COOKIE,
    LEGACY_SESSION_COOKIE,
    PRIMARY_BROWSER_SLOT,
    RENEWAL_BROWSER_SLOT,
    WORKSPACE_BROWSER_SLOT,
  ]) {
    clearHostOnlyBrowserCookie(name);
  }

  removeFreshAuthQueryParam();
  syncBrowserStorageFromCookies();
  emitStorageChange();
}

export function readStoredAccessToken(): string | null {
  return readBrowserCookie(PRIMARY_BROWSER_SLOT) || readBrowserCookie(LEGACY_SESSION_COOKIE);
}

export function extractTokenWorkspaceId(token: string | null): string {
  const payload = decodeKloelJwtPayload(token);
  return String(payload?.workspaceId || '').trim();
}

export function persistWorkspaceIfChanged(
  currentWorkspaceId: string | null,
  tokenWorkspaceId: string,
): void {
  if (currentWorkspaceId !== tokenWorkspaceId) {
    setBrowserCookie(WORKSPACE_BROWSER_SLOT, tokenWorkspaceId);
    emitStorageChange();
    return;
  }
  if (readBrowserCookie(WORKSPACE_BROWSER_SLOT) !== tokenWorkspaceId) {
    setBrowserCookie(WORKSPACE_BROWSER_SLOT, tokenWorkspaceId);
  }
}

export function syncWorkspaceFromToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const token = readStoredAccessToken();
  const tokenWorkspaceId = extractTokenWorkspaceId(token);
  const currentWorkspaceId = readBrowserCookie(WORKSPACE_BROWSER_SLOT);

  if (!tokenWorkspaceId) {
    return currentWorkspaceId;
  }

  persistWorkspaceIfChanged(currentWorkspaceId, tokenWorkspaceId);
  return tokenWorkspaceId;
}

export function syncBrowserStorageFromCookies(_options?: {
  clearLocalIfMissing?: boolean;
}): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const accessToken =
    readBrowserCookie(PRIMARY_BROWSER_SLOT) || readBrowserCookie(LEGACY_SESSION_COOKIE);
  const hasSharedSession = Boolean(readBrowserCookie(SESSION_MARKER_COOKIE) || accessToken);

  if (!hasSharedSession) {
    clearBrowserAuthCookies();
    return false;
  }

  if (hasAuthenticatedKloelToken(accessToken) && !readBrowserCookie(SESSION_MARKER_COOKIE)) {
    setBrowserAuthCookie();
  }

  return Boolean(accessToken);
}
