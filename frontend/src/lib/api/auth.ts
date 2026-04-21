// Auth API object
import { mutate } from 'swr';
import { apiFetch, resolveWorkspaceFromAuthPayload, tokenStorage } from './core';

/** Auth user shape. */
export interface AuthUser {
  /** Id property. */
  id: string;
  /** Email property. */
  email: string;
  /** Name property. */
  name?: string | null;
  /** Workspace id property. */
  workspaceId?: string | null;
  [k: string]: unknown;
}

/** Auth workspace summary shape. */
export interface AuthWorkspaceSummary {
  /** Id property. */
  id: string;
  /** Name property. */
  name?: string | null;
  [k: string]: unknown;
}

/** Auth payload shape. */
export interface AuthPayload {
  /** Access_token property. */
  access_token?: string;
  /** Access token property. */
  accessToken?: string;
  /** Refresh_token property. */
  refresh_token?: string;
  /** Refresh token property. */
  refreshToken?: string;
  /** User property. */
  user?: AuthUser;
  /** Workspace property. */
  workspace?: AuthWorkspaceSummary;
  /** Workspaces property. */
  workspaces?: AuthWorkspaceSummary[];
  /** Subscription property. */
  subscription?: Record<string, unknown> | null;
  /** Onboarding completed property. */
  onboardingCompleted?: boolean;
  [k: string]: unknown;
}

type AuthResponse = { data?: AuthPayload | null; error?: string | null };

function persistAuthPayload(res: AuthResponse): void {
  const payload = res.data ?? null;
  const token = payload?.access_token || payload?.accessToken;
  const refresh = payload?.refresh_token || payload?.refreshToken;
  if (!token) {
    return;
  }

  tokenStorage.setToken(token);
  if (refresh) {
    tokenStorage.setRefreshToken(refresh);
  }
  const wsId = resolveWorkspaceFromAuthPayload(payload as Record<string, unknown> | null)?.id;
  if (wsId) {
    tokenStorage.setWorkspaceId(wsId);
  }
}

/** Auth api. */
export const authApi = {
  signUp: async (
    email: string,
    name: string,
    password: string,
    options?: { workspaceName?: string; affiliateInviteToken?: string },
  ) => {
    const res = await apiFetch<AuthPayload>('/api/auth/register', {
      method: 'POST',
      body: {
        email,
        name,
        password,
        workspaceName: options?.workspaceName,
        affiliateInviteToken: options?.affiliateInviteToken,
      },
    });

    persistAuthPayload(res);
    mutate((key) => typeof key === 'string' && key.startsWith('/workspace'));
    return res;
  },

  signIn: async (email: string, password: string) => {
    const res = await apiFetch<AuthPayload>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });

    persistAuthPayload(res);
    mutate((key) => typeof key === 'string' && key.startsWith('/workspace'));
    return res;
  },

  signInWithGoogle: async (credential: string) => {
    const res = await apiFetch<AuthPayload>('/api/auth/google', {
      method: 'POST',
      body: { credential },
    });

    persistAuthPayload(res);
    mutate((key) => typeof key === 'string' && key.startsWith('/workspace'));
    return res;
  },

  signInWithFacebook: async (accessToken: string, userId?: string) => {
    const res = await apiFetch<AuthPayload>('/api/auth/facebook', {
      method: 'POST',
      body: { accessToken, userId },
    });

    persistAuthPayload(res);
    mutate((key) => typeof key === 'string' && key.startsWith('/workspace'));
    return res;
  },

  requestMagicLink: async (email: string, redirectTo?: string) => {
    return apiFetch<{ success?: boolean; message?: string; redirectTo?: string }>(
      '/api/auth/magic-link/request',
      {
        method: 'POST',
        body: { email, redirectTo },
      },
    );
  },

  verifyMagicLink: async (token: string) => {
    const res = await apiFetch<AuthPayload & { redirectTo?: string }>(
      '/api/auth/magic-link/verify',
      {
        method: 'POST',
        body: { token },
      },
    );

    persistAuthPayload(res);
    mutate((key) => typeof key === 'string' && key.startsWith('/workspace'));
    return res;
  },

  forgotPassword: async (email: string) => {
    return apiFetch<{ ok?: boolean }>('/api/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });
  },

  signOut: async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      // ignore logout cookie cleanup failures
    }
    tokenStorage.clear();
  },

  getMe: () => apiFetch<AuthPayload>('/api/workspace/me'),
};
