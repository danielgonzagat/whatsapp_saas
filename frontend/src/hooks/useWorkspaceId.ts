'use client';

import { useSession } from 'next-auth/react';

/**
 * Hook centralizado para obter o workspaceId do usuário autenticado.
 * Retorna o workspaceId da sessão ou um fallback temporário para usuários não autenticados.
 */
export function useWorkspaceId(): string {
  const { data: session, status } = useSession();
  
  // Se autenticado, usa o workspaceId da sessão
  if (status === 'authenticated' && session?.user) {
    const workspaceId = (session.user as any)?.workspaceId;
    if (workspaceId) {
      return workspaceId;
    }
  }
  
  // Fallback para usuários não autenticados ou sem workspaceId
  // Em produção, deve redirecionar para login
  return 'default-ws';
}

/**
 * Hook que retorna o workspaceId e o status de autenticação
 */
export function useWorkspace(): { 
  workspaceId: string; 
  isAuthenticated: boolean; 
  isLoading: boolean;
  user: any;
} {
  const { data: session, status } = useSession();
  
  const isLoading = status === 'loading';
  const isAuthenticated = status === 'authenticated';
  
  let workspaceId = 'default-ws';
  
  if (isAuthenticated && session?.user) {
    const sessionWorkspaceId = (session.user as any)?.workspaceId;
    if (sessionWorkspaceId) {
      workspaceId = sessionWorkspaceId;
    }
  }
  
  return {
    workspaceId,
    isAuthenticated,
    isLoading,
    user: session?.user || null,
  };
}
