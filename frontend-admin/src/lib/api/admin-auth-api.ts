import type {
  AuthenticatedSession,
  LoginResponse,
  MfaSetupPayload,
} from '../auth/admin-session-types';
import { adminFetch } from './admin-client';
import { AdminApiClientError, type AdminApiErrorShape } from './admin-errors';

interface AdminAuthRouteOptions<TBody> {
  body?: TBody;
}

async function adminAuthRouteFetch<TResponse = unknown, TBody = unknown>(
  path: string,
  options: AdminAuthRouteOptions<TBody> = {},
): Promise<TResponse> {
  const routePath = path.startsWith('/') ? path.slice(1) : path;
  const response = await fetch(`/api/admin/auth/${routePath}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    credentials: 'include',
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  if (response.status === 204) {
    return undefined as TResponse;
  }

  const text = await response.text();
  const payload = text
    ? ((): unknown => {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return { code: 'admin.internal.parse_error', message: text };
        }
      })()
    : {};

  if (!response.ok) {
    throw new AdminApiClientError(response.status, payload as AdminApiErrorShape);
  }

  return payload as TResponse;
}

/** Admin auth api. */
export const adminAuthApi = {
  login(email: string, password: string): Promise<LoginResponse> {
    return adminAuthRouteFetch<LoginResponse>('/login', { body: { email, password } });
  },
  changePassword(changeToken: string, newPassword: string): Promise<LoginResponse> {
    return adminAuthRouteFetch<LoginResponse>('/change-password', {
      body: { changeToken, newPassword },
    });
  },
  setupMfa(setupToken: string): Promise<MfaSetupPayload> {
    return adminAuthRouteFetch<MfaSetupPayload>('/mfa/setup', { body: { setupToken } });
  },
  verifyInitialMfa(setupToken: string, code: string): Promise<AuthenticatedSession> {
    return adminAuthRouteFetch<AuthenticatedSession>('/mfa/verify-initial', {
      body: { setupToken, code },
    });
  },
  verifyMfa(mfaToken: string, code: string): Promise<AuthenticatedSession> {
    return adminAuthRouteFetch<AuthenticatedSession>('/mfa/verify', {
      body: { mfaToken, code },
    });
  },
  refresh(): Promise<AuthenticatedSession> {
    return adminAuthRouteFetch<AuthenticatedSession>('/refresh');
  },
  async logout(): Promise<void> {
    try {
      await adminFetch<void>('/auth/logout', { method: 'POST' });
    } finally {
      await adminAuthRouteFetch<void>('/logout');
    }
  },
};
