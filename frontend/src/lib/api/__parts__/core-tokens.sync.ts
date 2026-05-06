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
} from './core-tokens.storage';

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

  localStorage.removeItem(PRIMARY_BROWSER_SLOT);
  localStorage.removeItem(RENEWAL_BROWSER_SLOT);
  localStorage.removeItem(WORKSPACE_BROWSER_SLOT);

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
  syncBrowserStorageFromCookies({ clearLocalIfMissing: false });
  emitStorageChange();
}

export function readStoredAccessToken(): string | null {
  return (
    localStorage.getItem(PRIMARY_BROWSER_SLOT) ||
    readBrowserCookie(PRIMARY_BROWSER_SLOT) ||
    readBrowserCookie(LEGACY_SESSION_COOKIE)
  );
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
    localStorage.setItem(WORKSPACE_BROWSER_SLOT, tokenWorkspaceId);
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
  const currentWorkspaceId = localStorage.getItem(WORKSPACE_BROWSER_SLOT);

  if (!tokenWorkspaceId) {
    return currentWorkspaceId;
  }

  persistWorkspaceIfChanged(currentWorkspaceId, tokenWorkspaceId);
  return tokenWorkspaceId;
}

export function syncBrowserStorageFromCookies(options?: {
  clearLocalIfMissing?: boolean;
}): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const accessToken =
    readBrowserCookie(PRIMARY_BROWSER_SLOT) || readBrowserCookie(LEGACY_SESSION_COOKIE);
  const refreshToken = readBrowserCookie(RENEWAL_BROWSER_SLOT);
  const workspaceId = readBrowserCookie(WORKSPACE_BROWSER_SLOT);
  const hasSharedSession = Boolean(readBrowserCookie(SESSION_MARKER_COOKIE) || accessToken);
  let changed = false;

  const syncKey = (key: string, value: string | null) => {
    const currentValue = localStorage.getItem(key);

    if (value) {
      if (currentValue !== value) {
        localStorage.setItem(key, value);
        changed = true;
      }
      return;
    }

    if (currentValue !== null) {
      localStorage.removeItem(key);
      changed = true;
    }
  };

  if (!hasSharedSession) {
    if (options?.clearLocalIfMissing) {
      syncKey(PRIMARY_BROWSER_SLOT, null);
      syncKey(RENEWAL_BROWSER_SLOT, null);
      syncKey(WORKSPACE_BROWSER_SLOT, null);
      clearBrowserAuthCookies();

      if (changed) {
        emitStorageChange();
      }
    }

    return false;
  }

  syncKey(PRIMARY_BROWSER_SLOT, accessToken);
  syncKey(RENEWAL_BROWSER_SLOT, refreshToken);
  syncKey(WORKSPACE_BROWSER_SLOT, workspaceId);

  if (hasAuthenticatedKloelToken(accessToken) && !readBrowserCookie(SESSION_MARKER_COOKIE)) {
    setBrowserAuthCookie();
  }

  if (changed) {
    emitStorageChange();
  }

  return Boolean(accessToken);
}
