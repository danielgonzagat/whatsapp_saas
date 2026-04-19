// Auth API object
import { mutate } from 'swr';
import { apiFetch, resolveWorkspaceFromAuthPayload, tokenStorage } from './core';

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  workspaceId?: string | null;
  [k: string]: unknown;
}

export interface AuthWorkspaceSummary {
  id: string;
  name?: string | null;
  [k: string]: unknown;
}

export interface AuthPayload {
  access_token?: string;
  accessToken?: string;
  refresh_token?: string;
  refreshToken?: string;
  user?: AuthUser;
  workspace?: AuthWorkspaceSummary;
  workspaces?: AuthWorkspaceSummary[];
  subscription?: Record<string, unknown> | null;
  onboardingCompleted?: boolean;
  [k: string]: unknown;
}

type AuthResponse = { data?: AuthPayload | null; error?: string | null };

export interface DataExportPayload {
  exportedAt: string;
  user?: Record<string, unknown> | null;
  workspace?: Record<string, unknown> | null;
  auditLogs?: unknown[];
  messages?: unknown[];
  [k: string]: unknown;
}

export interface DataDeletionPayload {
  confirmationCode: string;
  status: string;
  [k: string]: unknown;
}

export interface AuthSessionEntry {
  id: string;
  isCurrent: boolean;
  device: string;
  detail: string;
  deviceType: 'mobile' | 'desktop' | 'monitor';
  ipAddress?: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

export interface AuthSessionsPayload {
  sessions: AuthSessionEntry[];
}

export interface GoogleExtendedProfilePayload {
  provider: 'google';
  email: string | null;
  phone: string | null;
  birthday: string | null;
  address: {
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    countryCode: string | null;
    formattedValue: string | null;
  } | null;
}

function persistAuthPayload(res: AuthResponse): void {
  const payload = res.data ?? null;
  const token = payload?.access_token || payload?.accessToken;
  const refresh = payload?.refresh_token || payload?.refreshToken;
  if (!token) return;

  tokenStorage.setToken(token);
  if (refresh) {
    tokenStorage.setRefreshToken(refresh);
  }
  const wsId = resolveWorkspaceFromAuthPayload(payload as Record<string, unknown> | null)?.id;
  if (wsId) {
    tokenStorage.setWorkspaceId(wsId);
  }
}

export const authApi = {
  signUp: async (email: string, name: string, password: string) => {
    const res = await apiFetch<AuthPayload>('/api/auth/register', {
      method: 'POST',
      body: { email, name, password },
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

  signInWithFacebook: async (accessToken: string) => {
    const res = await apiFetch<AuthPayload>('/api/auth/facebook', {
      method: 'POST',
      body: { accessToken },
    });

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

  changePassword: async (currentPassword: string, newPassword: string) => {
    return apiFetch<{ success?: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
  },

  requestMagicLink: async (email: string) => {
    return apiFetch<{ success?: boolean; message?: string }>('/api/auth/magic-link/request', {
      method: 'POST',
      body: { email },
    });
  },

  listSessions: async () => {
    return apiFetch<AuthSessionsPayload>('/api/auth/sessions');
  },

  revokeSession: async (sessionId: string) => {
    return apiFetch<{ success?: boolean; revokedSessionId?: string | null }>(
      '/api/auth/sessions/revoke',
      {
        method: 'POST',
        body: { sessionId },
      },
    );
  },

  revokeOtherSessions: async () => {
    return apiFetch<{ success?: boolean; revokedCount?: number }>(
      '/api/auth/sessions/revoke-others',
      {
        method: 'POST',
      },
    );
  },

  exportMyData: async () => {
    return apiFetch<DataExportPayload>('/user/data-export');
  },

  requestDataDeletion: async () => {
    return apiFetch<DataDeletionPayload>('/user/data-deletion', {
      method: 'DELETE',
    });
  },

  getGoogleExtendedProfile: async (accessToken: string) => {
    return apiFetch<GoogleExtendedProfilePayload>('/api/user/google-profile-extended', {
      method: 'GET',
      headers: {
        'X-Google-Access-Token': accessToken,
      },
    });
  },

  consumeMagicLink: async (token: string, linkToken?: string) => {
    const res = await apiFetch<AuthPayload>('/api/auth/magic-link/consume', {
      method: 'POST',
      body: linkToken ? { token, linkToken } : { token },
    });

    persistAuthPayload(res);
    mutate((key) => typeof key === 'string' && key.startsWith('/workspace'));
    return res;
  },

  signOut: async () => {
    try {
      await fetch('/api/auth/sessions/revoke-current', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      // ignore revoke-current failures; local cleanup still happens below
    }

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
