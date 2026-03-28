'use client';

import { useEffect, useState } from 'react';

/**
 * Retorna o workspaceId real do usuário autenticado.
 * Lê apenas do localStorage — não faz chamadas API.
 * Enquanto não há valor, retorna string vazia.
 */
export function useWorkspaceId(): string {
  const [wsId, setWsId] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('kloel_workspace_id') || '';
    }
    return '';
  });

  useEffect(() => {
    const handler = () => {
      const stored = localStorage.getItem('kloel_workspace_id') || '';
      setWsId(stored);
    };
    window.addEventListener('storage', handler);
    window.addEventListener('kloel-storage-changed', handler);
    // Also check on mount in case it changed
    handler();
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('kloel-storage-changed', handler);
    };
  }, []);

  return wsId;
}

/**
 * Hook que retorna workspaceId + isLoading (always false since no API calls).
 */
export function useWorkspace(): { workspaceId: string; isLoading: boolean; isAuthenticated: boolean; user: any; error: string | null } {
  const workspaceId = useWorkspaceId();

  return {
    workspaceId,
    isAuthenticated: typeof window !== 'undefined' ? !!localStorage.getItem('kloel_access_token') : false,
    isLoading: false,
    user: null,
    error: null,
  };
}
