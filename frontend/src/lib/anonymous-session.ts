'use client';

import { mutate } from 'swr';
import { tokenStorage } from './api';

type AnonymousSession = {
  token: string;
  workspaceId: string;
  refreshToken?: string;
  created: boolean;
};

interface AnonymousSessionPayload {
  access_token?: string;
  accessToken?: string;
  token?: string;
  refresh_token?: string;
  refreshToken?: string;
  workspaceId?: string;
  workspace?: { id?: string };
  user?: { workspaceId?: string };
  [key: string]: unknown;
}

function resolveAnonymousToken(payload: AnonymousSessionPayload): string {
  return String(payload?.access_token || payload?.accessToken || payload?.token || '').trim();
}

function resolveAnonymousWorkspaceId(payload: AnonymousSessionPayload): string {
  return String(
    payload?.user?.workspaceId || payload?.workspace?.id || payload?.workspaceId || '',
  ).trim();
}

export async function ensureAnonymousSession(): Promise<AnonymousSession> {
  const existingToken = tokenStorage.getToken();
  const existingWorkspaceId = tokenStorage.getWorkspaceId();

  if (existingToken && existingWorkspaceId) {
    return {
      token: existingToken,
      workspaceId: existingWorkspaceId,
      refreshToken: tokenStorage.getRefreshToken() || undefined,
      created: false,
    };
  }

  const response = await fetch('/api/auth/anonymous', { method: 'POST' });
  if (!response.ok) {
    throw new Error('Falha ao criar sessão anônima.');
  }

  const payload: AnonymousSessionPayload = await response
    .json()
    .catch(() => ({}) as AnonymousSessionPayload);
  mutate((key: unknown) => typeof key === 'string' && key.startsWith('/auth'));
  const token = resolveAnonymousToken(payload);
  const workspaceId = resolveAnonymousWorkspaceId(payload);
  const refreshToken = String(payload?.refresh_token || payload?.refreshToken || '').trim();

  if (!token || !workspaceId) {
    throw new Error('Resposta inválida ao criar sessão anônima.');
  }

  tokenStorage.setToken(token, {
    shareAcrossSubdomains: false,
    markAuthenticated: false,
  });
  tokenStorage.setWorkspaceId(workspaceId, {
    shareAcrossSubdomains: false,
  });
  if (refreshToken) {
    tokenStorage.setRefreshToken(refreshToken, {
      shareAcrossSubdomains: false,
    });
  }

  return {
    token,
    workspaceId,
    refreshToken: refreshToken || undefined,
    created: true,
  };
}
