'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { apiUrl } from '@/lib/http';

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
  const { data: session, status } = useSession();
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(status === 'loading');
  const [error, setError] = useState<string | null>(null);

  const sessionWorkspaceId = useMemo(() => {
    return (session?.user as any)?.workspaceId || '';
  }, [session]);

  // Prefer workspaceId da sessão se existir
  useEffect(() => {
    if (sessionWorkspaceId) {
      setWorkspaceId(sessionWorkspaceId);
      setLoading(false);
    }
  }, [sessionWorkspaceId]);

  // Se autenticado mas sem workspaceId na sessão, busca via /workspace/me
  useEffect(() => {
    const fetchWorkspace = async () => {
      if (loading) return;
      if (workspaceId) return;
      if (status !== 'authenticated') return;

      try {
        setLoading(true);
        const res = await fetch(apiUrl('/workspace/me'), { credentials: 'include' });
        if (!res.ok) throw new Error(`Erro ao carregar workspace: ${res.status}`);
        const data = await res.json();
        if (data?.id) {
          setWorkspaceId(data.id);
        } else {
          setError('Workspace não encontrado para o usuário.');
        }
      } catch (err: any) {
        setError(err?.message || 'Erro ao buscar workspace.');
      } finally {
        setLoading(false);
      }
    };

    fetchWorkspace();
  }, [status, workspaceId, loading]);

  return {
    workspaceId,
    isAuthenticated: status === 'authenticated',
    isLoading: loading || status === 'loading',
    user: session?.user || null,
    error,
  };
}
