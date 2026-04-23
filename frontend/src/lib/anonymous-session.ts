'use client';

import { mutate } from 'swr';
import { tokenStorage } from './api';

const GUEST_WORKSPACE_CLAIM_SLOT = ['kloel', 'guest', 'workspace', 'claim', 'candidate'].join('_');

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

/** Ensure anonymous session. */
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
  rememberGuestWorkspaceClaimCandidate(workspaceId);
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

/** Remember guest workspace claim candidate. */
export function rememberGuestWorkspaceClaimCandidate(workspaceId?: string | null) {
  if (typeof window === 'undefined') {
    return;
  }
  const normalized = String(workspaceId || '').trim();
  if (!normalized) {
    return;
  }
  localStorage.setItem(GUEST_WORKSPACE_CLAIM_SLOT, normalized);
}

/** Get guest workspace claim candidate. */
export function getGuestWorkspaceClaimCandidate(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return String(localStorage.getItem(GUEST_WORKSPACE_CLAIM_SLOT) || '').trim();
}

/** Clear guest workspace claim candidate. */
export function clearGuestWorkspaceClaimCandidate() {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem(GUEST_WORKSPACE_CLAIM_SLOT);
}
