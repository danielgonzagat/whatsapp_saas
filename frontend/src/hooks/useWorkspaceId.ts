'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { apiUrl } from '@/lib/http';
import { tokenStorage } from '@/lib/api';

const GUEST_WORKSPACE_KEY = 'kloel_guest_workspace';
const GUEST_TOKEN_KEY = 'kloel_guest_token';

interface WorkspaceState {
  workspaceId: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  isGuest: boolean;
  user: any;
  error?: string | null;
}

/**
 * Retorna o workspaceId real do usuário autenticado ou do workspace convidado.
 * Nunca usa fallback "default-ws".
 * Enquanto carrega, retorna string vazia e isLoading=true para que a UI desabilite ações sensíveis.
 */
export function useWorkspaceId(): string {
  const { workspaceId } = useWorkspace();
  return workspaceId;
}

/**
 * Hook que resolve o workspace real via sessão, /workspace/me, ou modo convidado (guest).
 */
export function useWorkspace(): WorkspaceState {
  const { data: session, status } = useSession();
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(status === 'loading');
  const [error, setError] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState<boolean>(false);

  const sessionWorkspaceId = useMemo(() => {
    return (session?.user as any)?.workspaceId || '';
  }, [session]);

  // Prefer workspaceId da sessão se existir
  useEffect(() => {
    if (sessionWorkspaceId) {
      setWorkspaceId(sessionWorkspaceId);
      setIsGuest(false);
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
        const accessToken = (session?.user as any)?.accessToken || tokenStorage.getToken();
        const res = await fetch(apiUrl('/workspace/me'), {
          credentials: 'include',
          headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
        });
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
  }, [status, workspaceId, loading, session]);

  // Se NÃO autenticado, tenta usar workspace convidado
  const ensureGuestWorkspace = useCallback(async () => {
    if (status === 'loading') return;
    if (status === 'authenticated') return;
    if (workspaceId) return;

    // Verifica localStorage primeiro
    const storedWs = typeof window !== 'undefined' ? localStorage.getItem(GUEST_WORKSPACE_KEY) : null;
    const storedToken = typeof window !== 'undefined' ? localStorage.getItem(GUEST_TOKEN_KEY) : null;

    if (storedWs && storedToken) {
      setWorkspaceId(storedWs);
      setIsGuest(true);
      tokenStorage.setToken(storedToken);
      tokenStorage.setWorkspaceId(storedWs);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(apiUrl('/workspace/guest'), { method: 'POST' });
      if (!res.ok) throw new Error(`Erro ao criar workspace convidado: ${res.status}`);
      const data = await res.json();
      if (data?.workspaceId && data?.accessToken) {
        localStorage.setItem(GUEST_WORKSPACE_KEY, data.workspaceId);
        localStorage.setItem(GUEST_TOKEN_KEY, data.accessToken);
        tokenStorage.setToken(data.accessToken);
        tokenStorage.setWorkspaceId(data.workspaceId);
        setWorkspaceId(data.workspaceId);
        setIsGuest(true);
      } else {
        setError('Falha ao criar workspace convidado.');
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao criar workspace convidado.');
    } finally {
      setLoading(false);
    }
  }, [status, workspaceId]);

  useEffect(() => {
    ensureGuestWorkspace();
  }, [ensureGuestWorkspace]);

  return {
    workspaceId,
    isAuthenticated: status === 'authenticated',
    isLoading: loading || status === 'loading',
    isGuest,
    user: session?.user || null,
    error,
  };
}
