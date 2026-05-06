// Custom hook for WhatsApp connection state, extracted from chat-container.tsx.
'use client';

import {
  authApi,
  getWhatsAppStatus,
  resolveWorkspaceFromAuthPayload,
  tokenStorage,
} from '@/lib/api';
import { useCallback, useEffect, useState } from 'react';

interface UseWhatsAppOpts {
  isAuthenticated: boolean;
  onConnected: () => void;
}

export function useWhatsApp({ isAuthenticated, onConnected }: UseWhatsAppOpts) {
  const [isWhatsAppConnected, setIsWhatsAppConnected] = useState(false);

  const resolveWorkspaceIdForSession = useCallback(async () => {
    const stored = tokenStorage.getWorkspaceId() || '';
    if (stored) return stored;
    const token = tokenStorage.getToken();
    if (!token) return '';
    try {
      const res = await authApi.getMe();
      const id = resolveWorkspaceFromAuthPayload(res.data)?.id || '';
      if (id) tokenStorage.setWorkspaceId(id);
      return id;
    } catch (error) {
      console.error('Failed to recover workspace for WhatsApp session:', error);
      return '';
    }
  }, []);

  const checkWhatsAppStatus = useCallback(async () => {
    try {
      const workspaceId = await resolveWorkspaceIdForSession();
      if (!workspaceId) return;
      const status = await getWhatsAppStatus(workspaceId);
      if (status.connected) {
        setIsWhatsAppConnected(true);
        onConnected();
      } else {
        setIsWhatsAppConnected(false);
      }
    } catch {
      // Ignore errors
    }
  }, [resolveWorkspaceIdForSession, onConnected]);

  useEffect(() => {
    if (isAuthenticated) void checkWhatsAppStatus();
  }, [checkWhatsAppStatus, isAuthenticated]);

  useEffect(() => {
    const sync = () => {
      if (!tokenStorage.getToken()) {
        setIsWhatsAppConnected(false);
        return;
      }
      void checkWhatsAppStatus();
    };
    window.addEventListener('storage', sync);
    window.addEventListener('kloel-storage-changed', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('kloel-storage-changed', sync);
    };
  }, [checkWhatsAppStatus]);

  return { isWhatsAppConnected, setIsWhatsAppConnected };
}
