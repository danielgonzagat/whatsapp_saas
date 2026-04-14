import { tokenStorage } from '@/lib/api/core';
import { API_BASE } from '@/lib/http';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Socket, io } from 'socket.io-client';

type EventHandler = (data: any) => void;

/**
 * WebSocket hook for real-time updates via Socket.IO.
 *
 * Usage:
 *   const { subscribe, emit, isConnected } = useSocket();
 *
 *   useEffect(() => {
 *     const unsub = subscribe('inbox:new-message', (data) => { ... });
 *     return unsub;
 *   }, [subscribe]);
 */
export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const visualSocketDisabled =
      typeof window !== 'undefined' &&
      Boolean(
        (
          window as Window & {
            __KLOEL_E2E_DISABLE_SOCKET__?: boolean;
          }
        ).__KLOEL_E2E_DISABLE_SOCKET__,
      );

    if (visualSocketDisabled) {
      setIsConnected(false);
      return;
    }

    const token = tokenStorage.getToken();
    const workspaceId = tokenStorage.getWorkspaceId();

    // Don't connect if not authenticated
    if (!token) return;

    const socket = io(API_BASE, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Number.POSITIVE_INFINITY,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      // Join workspace room once connected
      if (workspaceId) {
        socket.emit('join', { workspaceId });
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('connect_error', () => {
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, []);

  const subscribe = useCallback((event: string, handler: EventHandler): (() => void) => {
    const socket = socketRef.current;
    if (!socket) return () => {};

    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, []);

  const emit = useCallback((event: string, data?: unknown): void => {
    socketRef.current?.emit(event, data);
  }, []);

  return { isConnected, subscribe, emit };
}
