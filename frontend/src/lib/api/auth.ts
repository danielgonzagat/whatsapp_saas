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
  /** MFA challenge state returned after password verification. */
  state?: 'mfa_required' | string;
  /** Short-lived token used to verify the MFA login code. */
  mfaToken?: string;
  [k: string]: unknown;
}

type AuthResponse = { data?: AuthPayload | null; error?: string | null; status?: number };
type AuthApiResponse = { data?: AuthPayload; error?: string; status: number };

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

function readAuthErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const { message, error } = record;
    if (Array.isArray(message)) {
      return message.join(', ');
    }
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
    if (typeof error === 'string' && error.trim().length > 0) {
      return error;
    }
  }
  return fallback;
}

async function readOptionalJsonPayload(response: Response): Promise<unknown> {
  if (typeof response.text === 'function') {
    const body = await response.text();
    const trimmed = body.trim();
    if (!trimmed) {
      return null;
    }
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return { message: trimmed };
    }
  }

  if (typeof response.json === 'function') {
    return response.json() as Promise<unknown>;
  }

  return null;
}

async function fetchWorkspaceMe(): Promise<AuthApiResponse> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = tokenStorage.getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['x-kloel-access-token'] = token;
  }
  const workspaceId = tokenStorage.getWorkspaceId();
  if (workspaceId) {
    headers['x-workspace-id'] = workspaceId;
  }

  try {
    const response = await fetch('/api/workspace/me', {
      method: 'GET',
      credentials: 'include',
      headers,
    });
    const payload = await readOptionalJsonPayload(response);
    if (!response.ok) {
      return {
        error: readAuthErrorMessage(payload, response.statusText || `HTTP ${response.status}`),
        status: response.status,
      };
    }
    return { data: payload as AuthPayload, status: response.status };
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : 'Network error',
      status: 0,
    };
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
    const res = await apiFetch<AuthPayload>('/auth/register', {
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
    const res = await apiFetch<AuthPayload>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });

    persistAuthPayload(res);
    mutate((key) => typeof key === 'string' && key.startsWith('/workspace'));
    return res;
  },

  verifyMfaLogin: async (mfaToken: string, code: string) => {
    const res = await apiFetch<AuthPayload>('/auth/mfa/verify', {
      method: 'POST',
      body: { mfaToken, code },
    });

    persistAuthPayload(res);
    mutate((key) => typeof key === 'string' && key.startsWith('/workspace'));
    return res;
  },

  signInWithGoogle: async (credential: string) => {
    const res = await apiFetch<AuthPayload>('/auth/oauth/google', {
      method: 'POST',
      body: { credential },
    });

    persistAuthPayload(res);
    mutate((key) => typeof key === 'string' && key.startsWith('/workspace'));
    return res;
  },

  signInWithFacebook: async (accessToken: string, userId?: string) => {
    const res = await apiFetch<AuthPayload>('/auth/oauth/facebook', {
      method: 'POST',
      body: { accessToken, userId },
    });

    persistAuthPayload(res);
    mutate((key) => typeof key === 'string' && key.startsWith('/workspace'));
    return res;
  },

  requestMagicLink: async (email: string, redirectTo?: string) => {
    return apiFetch<{ success?: boolean; message?: string; redirectTo?: string }>(
      '/auth/magic-link/request',
      {
        method: 'POST',
        body: { email, redirectTo },
      },
    );
  },

  verifyMagicLink: async (token: string) => {
    const res = await apiFetch<AuthPayload & { redirectTo?: string }>('/auth/magic-link/verify', {
      method: 'POST',
      body: { token },
    });

    persistAuthPayload(res);
    mutate((key) => typeof key === 'string' && key.startsWith('/workspace'));
    return res;
  },

  forgotPassword: async (email: string) => {
    return apiFetch<{ ok?: boolean }>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });
  },

  signOut: async () => {
    try {
      await apiFetch('/auth/logout', {
        method: 'POST',
      });
    } catch {
      // ignore logout cookie cleanup failures
    }
    tokenStorage.clear();
  },

  getMe: fetchWorkspaceMe,
};
