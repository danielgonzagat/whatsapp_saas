import { tokenStorage } from '@/lib/api/core';

export type ImpersonationPayload = {
  access_token?: string;
  refresh_token?: string;
  workspace?: { id?: string; name?: string } | null;
  user?: { workspaceId?: string } | null;
  next?: string;
};

export function readImpersonationPayload(): ImpersonationPayload | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  const raw = params.get('session');
  if (!raw) {
    return null;
  }
  try {
    const decoded = window.atob(raw);
    return JSON.parse(decoded) as ImpersonationPayload;
  } catch {
    return null;
  }
}

export function applyImpersonationPayload(payload: ImpersonationPayload): void {
  if (!payload.access_token) {
    return;
  }
  const workspaceId = payload.workspace?.id || payload.user?.workspaceId;
  tokenStorage.setToken(payload.access_token);
  if (payload.refresh_token) {
    tokenStorage.setRefreshToken(payload.refresh_token);
  }
  if (workspaceId) {
    tokenStorage.setWorkspaceId(workspaceId);
  }
  tokenStorage.ensureAuthCookie();
}

export function resolveNextRoute(candidate: string | undefined, fallback: string): string {
  return candidate?.startsWith('/') ? candidate : fallback;
}
