'use client';

import { useEffect, useState, useMemo } from 'react';
import { apiUrl } from '@/lib/http';
import { authApi, tokenStorage } from '@/lib/api';

interface WorkspaceState {
  workspaceId: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: any;
  error?: string | null;
}

/**
 * Retorna o workspaceId real do usuário autenticado. Nunca usa fallback "default-ws".
 * Enquanto carrega, retorna string vazia e isLoading=true para que a UI desabilite ações sensíveis.
 */
export function useWorkspaceId(): string {
  const { workspaceId } = useWorkspace();
  return workspaceId;
}

/**
 * Hook que resolve o workspace real via sessão ou via endpoint /workspace/me.
 */
export function useWorkspace(): WorkspaceState {
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const storedWorkspaceId = useMemo(() => tokenStorage.getWorkspaceId() || '', []);

  useEffect(() => {
    if (storedWorkspaceId) {
      setWorkspaceId(storedWorkspaceId);
      setLoading(false);
    }
  }, [storedWorkspaceId]);

  useEffect(() => {
    const fetchWorkspace = async () => {
      const accessToken = tokenStorage.getToken();
      if (!accessToken) {
        setLoading(false);
        return;
      }
      if (workspaceId && user) return;

      try {
        setLoading(true);
        const res = await authApi.getMe();
        if (res.error || !res.data?.user) {
          throw new Error(res.error || 'Erro ao carregar workspace');
        }

        const nextWorkspaceId = res.data.workspaces?.[0]?.id || res.data.user?.workspaceId || '';
        if (nextWorkspaceId) {
          setWorkspaceId(nextWorkspaceId);
          tokenStorage.setWorkspaceId(nextWorkspaceId);
        } else {
          setError('Workspace não encontrado para o usuário.');
        }
        setUser(res.data.user || null);
      } catch (err: any) {
        setError(err?.message || 'Erro ao buscar workspace.');
      } finally {
        setLoading(false);
      }
    };

    fetchWorkspace();
  }, [workspaceId, user]);

  return {
    workspaceId,
    isAuthenticated: !!tokenStorage.getToken(),
    isLoading: loading,
    user,
    error,
  };
}
