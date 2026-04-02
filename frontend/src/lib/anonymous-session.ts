'use client';

import { mutate } from 'swr';
import { tokenStorage } from './api';

const GUEST_WORKSPACE_CLAIM_KEY = 'kloel_guest_workspace_claim_candidate';

type AnonymousSession = {
  token: string;
  workspaceId: string;
  refreshToken?: string;
  created: boolean;
};

function resolveAnonymousToken(payload: any): string {
  return String(payload?.access_token || payload?.accessToken || payload?.token || '').trim();
}

function resolveAnonymousWorkspaceId(payload: any): string {
  return String(
    payload?.user?.workspaceId || payload?.workspace?.id || payload?.workspaceId || '',
  ).trim();
}

export async function ensureAnonymousSession(): Promise<AnonymousSession> {
  const existingToken = tokenStorage.getToken();
  const existingWorkspaceId = tokenStorage.getWorkspaceId();

  if (existingToken && existingWorkspaceId) {
    rememberGuestWorkspaceClaimCandidate(existingWorkspaceId);
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

  const payload = await response.json().catch(() => ({}));
  mutate((key: unknown) => typeof key === 'string' && key.startsWith('/auth'));
  const token = resolveAnonymousToken(payload);
  const workspaceId = resolveAnonymousWorkspaceId(payload);
  const refreshToken = String(payload?.refresh_token || payload?.refreshToken || '').trim();

  if (!token || !workspaceId) {
    throw new Error('Resposta inválida ao criar sessão anônima.');
  }

  tokenStorage.setToken(token);
  tokenStorage.setWorkspaceId(workspaceId);
  rememberGuestWorkspaceClaimCandidate(workspaceId);
  if (refreshToken) {
    tokenStorage.setRefreshToken(refreshToken);
  }

  return {
    token,
    workspaceId,
    refreshToken: refreshToken || undefined,
    created: true,
  };
}

export function rememberGuestWorkspaceClaimCandidate(workspaceId?: string | null) {
  if (typeof window === 'undefined') return;
  const normalized = String(workspaceId || '').trim();
  if (!normalized) return;
  localStorage.setItem(GUEST_WORKSPACE_CLAIM_KEY, normalized);
}

export function getGuestWorkspaceClaimCandidate(): string {
  if (typeof window === 'undefined') return '';
  return String(localStorage.getItem(GUEST_WORKSPACE_CLAIM_KEY) || '').trim();
}

export function clearGuestWorkspaceClaimCandidate() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(GUEST_WORKSPACE_CLAIM_KEY);
}
