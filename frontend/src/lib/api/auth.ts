// Auth API object
import { mutate } from 'swr';
import { apiFetch, tokenStorage, resolveWorkspaceFromAuthPayload } from './core';

export const authApi = {
  signUp: async (email: string, name: string, password: string) => {
    const res = await apiFetch<any>('/api/auth/register', {
      method: 'POST',
      body: { email, name, password },
    });

    const token = res.data?.access_token || res.data?.accessToken;
    const refresh = res.data?.refresh_token || res.data?.refreshToken;
    if (token) {
      tokenStorage.setToken(token);
      if (refresh) {
        tokenStorage.setRefreshToken(refresh);
      }
      const wsId = resolveWorkspaceFromAuthPayload(res.data)?.id;
      if (wsId) {
        tokenStorage.setWorkspaceId(wsId);
      }
    }

    mutate((key: string) => typeof key === 'string' && key.startsWith('/workspace'));
    return res;
  },

  signIn: async (email: string, password: string) => {
    const res = await apiFetch<any>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });

    const token = res.data?.access_token || res.data?.accessToken;
    const refresh = res.data?.refresh_token || res.data?.refreshToken;
    if (token) {
      tokenStorage.setToken(token);
      if (refresh) {
        tokenStorage.setRefreshToken(refresh);
      }
      const wsId = resolveWorkspaceFromAuthPayload(res.data)?.id;
      if (wsId) {
        tokenStorage.setWorkspaceId(wsId);
      }
    }

    mutate((key: string) => typeof key === 'string' && key.startsWith('/workspace'));
    return res;
  },

  signInWithGoogle: async (credential: string) => {
    const res = await apiFetch<any>('/api/auth/google', {
      method: 'POST',
      body: { credential },
    });

    const token = res.data?.access_token || res.data?.accessToken;
    const refresh = res.data?.refresh_token || res.data?.refreshToken;
    if (token) {
      tokenStorage.setToken(token);
      if (refresh) {
        tokenStorage.setRefreshToken(refresh);
      }
      const wsId = resolveWorkspaceFromAuthPayload(res.data)?.id;
      if (wsId) {
        tokenStorage.setWorkspaceId(wsId);
      }
    }

    mutate((key: string) => typeof key === 'string' && key.startsWith('/workspace'));
    return res;
  },

  forgotPassword: async (email: string) => {
    return apiFetch<any>('/api/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });
  },

  signOut: async () => {
    tokenStorage.clear();
  },

  getMe: () => apiFetch<any>('/api/workspace/me'),
};
