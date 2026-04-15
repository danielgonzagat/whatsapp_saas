import type {
  AuthenticatedSession,
  LoginResponse,
  MfaSetupPayload,
} from '../auth/admin-session-types';
import { adminFetch } from './admin-client';

export const adminAuthApi = {
  login(email: string, password: string): Promise<LoginResponse> {
    return adminFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      auth: 'none',
      body: { email, password },
    });
  },
  changePassword(changeToken: string, newPassword: string): Promise<LoginResponse> {
    return adminFetch<LoginResponse>('/auth/change-password', {
      method: 'POST',
      auth: 'explicit',
      explicitToken: changeToken,
      body: { newPassword },
    });
  },
  setupMfa(setupToken: string): Promise<MfaSetupPayload> {
    return adminFetch<MfaSetupPayload>('/auth/mfa/setup', {
      method: 'POST',
      auth: 'explicit',
      explicitToken: setupToken,
    });
  },
  verifyInitialMfa(setupToken: string, code: string): Promise<AuthenticatedSession> {
    return adminFetch<AuthenticatedSession>('/auth/mfa/verify-initial', {
      method: 'POST',
      auth: 'explicit',
      explicitToken: setupToken,
      body: { code },
    });
  },
  verifyMfa(mfaToken: string, code: string): Promise<AuthenticatedSession> {
    return adminFetch<AuthenticatedSession>('/auth/mfa/verify', {
      method: 'POST',
      auth: 'explicit',
      explicitToken: mfaToken,
      body: { code },
    });
  },
  refresh(rawRefresh: string): Promise<AuthenticatedSession> {
    return adminFetch<AuthenticatedSession>('/auth/refresh', {
      method: 'POST',
      auth: 'none',
      body: { refreshToken: rawRefresh },
    });
  },
  logout(): Promise<void> {
    return adminFetch<void>('/auth/logout', { method: 'POST' });
  },
};
