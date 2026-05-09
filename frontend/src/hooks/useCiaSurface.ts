'use client';

import {
  type CiaSurfaceResponse,
  autostartCia,
  ciaApi,
  getWhatsAppStatus,
  tokenStorage,
} from '@/lib/api';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type StreamEvent = {
  type: string;
  message: string;
  phase?: string | null;
  ts?: string;
  meta?: Record<string, unknown>;
};

interface UseCiaSurfaceReturn {
  surface: CiaSurfaceResponse | null;
  loading: boolean;
  activating: boolean;
  error: string | null;
  moneyEvents: StreamEvent[];
  loadSurface: () => Promise<void>;
  handleAutopilotTotal: () => Promise<void>;
}

export function useCiaSurface(workspaceId: string, workspaceLoading: boolean): UseCiaSurfaceReturn {
  const autoStartRef = useRef(false);
  const [surface, setSurface] = useState<CiaSurfaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSurface = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setLoading((current) => (surface ? current : true));
    const res = await ciaApi.getSurface(workspaceId);
    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      setSurface(res.data);
      setError(null);
    }
    setLoading(false);
  }, [surface, workspaceId]);

  useEffect(() => {
    if (!workspaceId || workspaceLoading || !surface || autoStartRef.current) {
      return;
    }

    const mode = String(surface.autonomy?.mode || 'OFF');
    const reason = String(surface.autonomy?.reason || '');
    const isActive = ['LIVE', 'BACKLOG', 'FULL'].includes(mode);
    if (isActive || reason === 'manual_pause') {
      return;
    }

    autoStartRef.current = true;

    void (async () => {
      try {
        const status = await getWhatsAppStatus(workspaceId);
        const connected = !!status.connected;

        if (!connected) {
          autoStartRef.current = false;
          return;
        }

        await autostartCia(workspaceId);
        await loadSurface();
      } catch {
        autoStartRef.current = false;
      }
    })();
  }, [loadSurface, surface, workspaceId, workspaceLoading]);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    const token = tokenStorage.getToken();
    if (!token) {
      return;
    }

    let cancelled = false;

    async function stream() {
      try {
        const response = await fetch('/api/whatsapp-api/agent/stream', {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-workspace-id': workspaceId,
            Accept: 'text/event-stream',
          },
        });

        if (!response.ok || !response.body) {
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const readStream = async (): Promise<void> => {
          if (cancelled) {
            return;
          }
          const { value, done } = await reader.read();
          if (done) {
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() || '';

          for (const chunk of chunks) {
            const payload = chunk
              .split('\n')
              .filter((line) => line.startsWith('data: '))
              .map((line) => line.slice(6))
              .join('');
            if (!payload) {
              continue;
            }

            const event = JSON.parse(payload) as StreamEvent;
            if (event.type === 'heartbeat' && !event.message) {
              continue;
            }

            setSurface((current) => {
              if (!current) {
                return current;
              }
              const recent = [...(current.recent || []), event].slice(-12);
              return {
                ...current,
                now: {
                  message: event.message,
                  phase: event.phase || null,
                  type: event.type,
                  ts: event.ts,
                },
                recent,
              };
            });
          }
          await readStream();
        };

        await readStream();
      } catch {
        // polling fallback
      }
    }

    void stream();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  async function handleAutopilotTotal() {
    if (!workspaceId) {
      return;
    }
    setActivating(true);
    const res = await ciaApi.activateAutopilotTotal(workspaceId);
    if (res.error) {
      setError(res.error);
    } else {
      await loadSurface();
    }
    setActivating(false);
  }

  const moneyEvents = useMemo(
    () =>
      (surface?.recent || []).filter((event) => event.type === 'sale' || event.type === 'payment'),
    [surface],
  );

  return {
    surface,
    loading,
    activating,
    error,
    moneyEvents,
    loadSurface,
    handleAutopilotTotal,
  };
}
