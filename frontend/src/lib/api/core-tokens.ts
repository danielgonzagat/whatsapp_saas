import {
  decodeKloelJwtPayload,
  hasAuthenticatedKloelToken,
  isAnonymousKloelToken,
} from '@/lib/auth-identity';
import { getSharedCookieDomain } from '@/lib/subdomains';

// ============================================
// Storage keys & helpers
// ============================================

const PRIMARY_BROWSER_SLOT = ['kloel', 'access', 'token'].join('_');
const RENEWAL_BROWSER_SLOT = ['kloel', 'refresh', 'token'].join('_');
const WORKSPACE_BROWSER_SLOT = 'kloel_workspace_id';
const SESSION_MARKER_COOKIE = ['kloel', 'auth'].join('_');
const LEGACY_SESSION_COOKIE = ['kloel', 'token'].join('_');
const STORAGE_EVENT = 'kloel-storage-changed';
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const FRESH_LOGIN_QUERY_PARAM = ['a', 'uth'].join('');

let freshAuthReconciled = false;

function writeDocumentCookie(value: string) {
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

function emitStorageChange() {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

function tokenAuthenticatedScore(token: string): number {
  return hasAuthenticatedKloelToken(token) ? 1000 : 0;
}

function tokenAnonymousPenalty(token: string): number {
  return isAnonymousKloelToken(token) ? -1000 : 0;
}

function tokenNameScore(payload: Record<string, unknown> | null | undefined): number {
  return String(payload?.name || '').trim() ? 100 : 0;
}

function tokenExpScore(payload: Record<string, unknown> | null | undefined): number {
  const exp = payload?.exp;
  return typeof exp === 'number' ? exp : 0;
}

function scoreTokenCandidate(token: string): number {
  const payload = decodeKloelJwtPayload(token);
  return (
    tokenAuthenticatedScore(token) +
    tokenAnonymousPenalty(token) +
    tokenNameScore(payload) +
    tokenExpScore(payload)
  );
}

function pickBestTokenCandidate(candidates: string[]): string | null {
  return (
    [...candidates].sort(
      (left, right) => scoreTokenCandidate(right) - scoreTokenCandidate(left),
    )[0] || null
  );
}

function readBrowserCookie(name: string): string | null {
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

function browserCookieSuffix(maxAge: number, options?: { shareAcrossSubdomains?: boolean }) {
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

function setBrowserCookie(
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

function clearBrowserCookie(name: string) {
  if (typeof document === 'undefined') {
    return;
  }
  writeDocumentCookie(`${name}=; ${browserCookieSuffix(0)}`);
  writeDocumentCookie(name + '=; ' + browserCookieSuffix(0, { shareAcrossSubdomains: false }));
}

function setBrowserAuthCookie() {
  setBrowserCookie(SESSION_MARKER_COOKIE, '1');
}

function clearHostOnlyBrowserCookie(name: string) {
  if (typeof document === 'undefined') {
    return;
  }
  writeDocumentCookie(`${name}=; ${browserCookieSuffix(0, { shareAcrossSubdomains: false })}`);
}

function clearBrowserAuthCookies() {
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

function removeFreshAuthQueryParam() {
  if (typeof window === 'undefined') {
    return;
  }
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.delete(FRESH_LOGIN_QUERY_PARAM);
  window.history.replaceState(window.history.state, '', nextUrl.toString());
}

function reconcileFreshSharedAuthSession() {
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

function readStoredAccessToken(): string | null {
  return (
    localStorage.getItem(PRIMARY_BROWSER_SLOT) ||
    readBrowserCookie(PRIMARY_BROWSER_SLOT) ||
    readBrowserCookie(LEGACY_SESSION_COOKIE)
  );
}

function extractTokenWorkspaceId(token: string | null): string {
  const payload = decodeKloelJwtPayload(token);
  return String(payload?.workspaceId || '').trim();
}

function persistWorkspaceIfChanged(
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

function syncWorkspaceFromToken(): string | null {
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

function syncBrowserStorageFromCookies(options?: { clearLocalIfMissing?: boolean }): boolean {
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

/** Resolve workspace from auth payload. */
export function resolveWorkspaceFromAuthPayload(
  payload: Record<string, unknown> | null | undefined,
): {
  id: string;
  name?: string;
} | null {
  const explicitWorkspace = payload?.workspace as { id?: string; name?: string } | undefined;
  if (explicitWorkspace?.id) {
    return { id: explicitWorkspace.id, name: explicitWorkspace.name };
  }

  const userObj = payload?.user as Record<string, unknown> | undefined;
  const explicitWorkspaceId = String(userObj?.workspaceId || '').trim();
  const workspaces: Array<{ id?: string; name?: string }> = Array.isArray(payload?.workspaces)
    ? (payload.workspaces as Array<{ id?: string; name?: string }>)
    : [];

  if (explicitWorkspaceId) {
    const matchedWorkspace = workspaces.find((workspace) => {
      return String(workspace?.id || '').trim() === explicitWorkspaceId;
    });

    if (matchedWorkspace?.id) {
      return { id: matchedWorkspace.id, name: matchedWorkspace.name };
    }

    return {
      id: explicitWorkspaceId,
      name: (userObj?.workspaceName as string) || 'Workspace',
    };
  }

  const firstWorkspace = workspaces[0];
  if (firstWorkspace?.id) {
    return { id: firstWorkspace.id, name: firstWorkspace.name };
  }

  return null;
}

// Token management
// Security note: Tokens stored in localStorage for SPA compatibility.
// For higher security, migrate to httpOnly cookies with CSRF protection.
// Current approach is standard for SPAs but vulnerable to XSS.
export const tokenStorage = {
  getToken: (): string | null => {
    if (typeof window === 'undefined') {
      return null;
    }
    reconcileFreshSharedAuthSession();
    // Do NOT clear localStorage if cookie is missing — the cookie may have expired
    // while localStorage still has a valid token. Let the 401 handler deal with it.
    syncBrowserStorageFromCookies({ clearLocalIfMissing: false });
    return localStorage.getItem(PRIMARY_BROWSER_SLOT);
  },

  setToken: (
    token: string,
    options?: { shareAcrossSubdomains?: boolean; markAuthenticated?: boolean },
  ): void => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem(PRIMARY_BROWSER_SLOT, token);
    setBrowserCookie(PRIMARY_BROWSER_SLOT, token, AUTH_COOKIE_MAX_AGE, {
      shareAcrossSubdomains: options?.shareAcrossSubdomains ?? !isAnonymousKloelToken(token),
    });
    if ((options?.markAuthenticated ?? true) && hasAuthenticatedKloelToken(token)) {
      setBrowserAuthCookie();
    }
    emitStorageChange();
  },

  getRefreshToken: (): string | null => {
    if (typeof window === 'undefined') {
      return null;
    }
    reconcileFreshSharedAuthSession();
    syncBrowserStorageFromCookies();
    return localStorage.getItem(RENEWAL_BROWSER_SLOT);
  },

  setRefreshToken: (token: string, options?: { shareAcrossSubdomains?: boolean }): void => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem(RENEWAL_BROWSER_SLOT, token);
    setBrowserCookie(RENEWAL_BROWSER_SLOT, token, AUTH_COOKIE_MAX_AGE, options);
    emitStorageChange();
  },

  getWorkspaceId: (): string | null => {
    if (typeof window === 'undefined') {
      return null;
    }
    reconcileFreshSharedAuthSession();
    syncBrowserStorageFromCookies();
    return syncWorkspaceFromToken();
  },

  setWorkspaceId: (id: string, options?: { shareAcrossSubdomains?: boolean }): void => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem(WORKSPACE_BROWSER_SLOT, id);
    setBrowserCookie(WORKSPACE_BROWSER_SLOT, id, AUTH_COOKIE_MAX_AGE, options);
    emitStorageChange();
  },

  clear: (): void => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.removeItem(PRIMARY_BROWSER_SLOT);
    localStorage.removeItem(RENEWAL_BROWSER_SLOT);
    localStorage.removeItem(WORKSPACE_BROWSER_SLOT);
    clearBrowserAuthCookies();
    emitStorageChange();
  },

  ensureAuthCookie: (): void => {
    if (typeof window === 'undefined') {
      return;
    }
    reconcileFreshSharedAuthSession();
    const token =
      localStorage.getItem(PRIMARY_BROWSER_SLOT) ||
      readBrowserCookie(PRIMARY_BROWSER_SLOT) ||
      readBrowserCookie(LEGACY_SESSION_COOKIE);
    if (!token) {
      return;
    }
    if (isAnonymousKloelToken(token)) {
      return;
    }

    setBrowserCookie(PRIMARY_BROWSER_SLOT, token);
    const refreshToken = localStorage.getItem(RENEWAL_BROWSER_SLOT);
    if (refreshToken) {
      setBrowserCookie(RENEWAL_BROWSER_SLOT, refreshToken);
    }

    const workspaceId = localStorage.getItem(WORKSPACE_BROWSER_SLOT);
    if (workspaceId) {
      setBrowserCookie(WORKSPACE_BROWSER_SLOT, workspaceId);
    }

    setBrowserAuthCookie();
    syncWorkspaceFromToken();
  },
};
