// Auth API object
import { mutate } from 'swr';
import { requestFacebookAccessTokenWithEmailScope } from '../facebook-sdk';
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

const FACEBOOK_EMAIL_PERMISSION_ERRORS = new Set([
  'O Facebook não retornou email. Autorize a permissão de email para continuar.',
  'O Facebook não liberou a permissão de email para este login. Autorize a permissão de email e tente novamente.',
]);

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

function persistAuthMutationScope(): void {
  mutate((key) => typeof key === 'string' && key.startsWith('/workspace'));
}

function shouldRetryFacebookConsent(error?: string | null): boolean {
  if (typeof window === 'undefined' || !error) {
    return false;
  }

  return FACEBOOK_EMAIL_PERMISSION_ERRORS.has(error);
}

async function postFacebookAuth(accessToken: string, userId?: string) {
  return await apiFetch<AuthPayload>('/api/auth/facebook', {
    method: 'POST',
    body: { accessToken, userId },
  });
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
    persistAuthMutationScope();
    return res;
  },

  signIn: async (email: string, password: string) => {
    const res = await apiFetch<AuthPayload>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });

    persistAuthPayload(res);
    persistAuthMutationScope();
    return res;
  },

  signInWithGoogle: async (credential: string) => {
    const res = await apiFetch<AuthPayload>('/api/auth/google', {
      method: 'POST',
      body: { credential },
    });

    persistAuthPayload(res);
    persistAuthMutationScope();
    return res;
  },

  signInWithFacebook: async (accessToken: string, userId?: string) => {
    let res = await postFacebookAuth(accessToken, userId);

    if (shouldRetryFacebookConsent(res.error)) {
      try {
        const refreshedAuth = await requestFacebookAccessTokenWithEmailScope();
        res = await postFacebookAuth(refreshedAuth.accessToken, refreshedAuth.userId);
      } catch (error: unknown) {
        return {
          error:
            error instanceof Error ? error.message : 'Falha ao autenticar com Facebook.',
          status: 401,
        };
      }
    }

    persistAuthPayload(res);
    persistAuthMutationScope();
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
    persistAuthMutationScope();
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
