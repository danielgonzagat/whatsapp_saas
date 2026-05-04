import { hasAuthenticatedKloelToken, isAnonymousKloelToken } from '@/lib/auth-identity';
import {
  AUTH_COOKIE_MAX_AGE,
  clearBrowserAuthCookies,
  emitStorageChange,
  LEGACY_SESSION_COOKIE,
  PRIMARY_BROWSER_SLOT,
  readBrowserCookie,
  RENEWAL_BROWSER_SLOT,
  setBrowserAuthCookie,
  setBrowserCookie,
  WORKSPACE_BROWSER_SLOT,
} from './__parts__/core-tokens.storage';
import {
  reconcileFreshSharedAuthSession,
  syncBrowserStorageFromCookies,
  syncWorkspaceFromToken,
} from './__parts__/core-tokens.sync';

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
