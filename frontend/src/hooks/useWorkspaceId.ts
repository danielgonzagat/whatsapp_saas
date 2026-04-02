'use client';

import { useEffect, useState } from 'react';
import { tokenStorage } from '@/lib/api';

/**
 * Retorna o workspaceId real do usuário autenticado.
 * Lê do armazenamento sincronizado entre cookie compartilhado e localStorage.
 * Enquanto não há valor, retorna string vazia.
 */
export function useWorkspaceId(): string {
  const [wsId, setWsId] = useState('');

  useEffect(() => {
    const handler = () => {
      const stored = tokenStorage.getWorkspaceId() || '';
      setWsId((prev) => (prev === stored ? prev : stored)); // Avoid unnecessary re-render
    };
    handler();
    window.addEventListener('storage', handler);
    window.addEventListener('kloel-storage-changed', handler);
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
export function useWorkspace(): {
  workspaceId: string;
  isLoading: boolean;
  isAuthenticated: boolean;
  user: any;
  error: string | null;
} {
  const workspaceId = useWorkspaceId();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const handler = () => {
      setIsAuthenticated(!!tokenStorage.getToken());
    };
    handler();
    window.addEventListener('storage', handler);
    window.addEventListener('kloel-storage-changed', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('kloel-storage-changed', handler);
    };
  }, []);

  return {
    workspaceId,
    isAuthenticated,
    isLoading: false,
    user: null,
    error: null,
  };
}
