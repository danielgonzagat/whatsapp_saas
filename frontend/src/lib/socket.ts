/**
 * KLOEL COSMOS — Socket.IO Client Singleton
 * Connects to the backend inbox gateway for real-time events.
 */

import { io, type Socket } from 'socket.io-client';
import { API_BASE } from './http';
import { tokenStorage } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = tokenStorage.getToken();
    const workspaceId = tokenStorage.getWorkspaceId();

    socket = io(API_BASE, {
      auth: { token },
      query: { workspaceId: workspaceId || '' },
      transports: ['websocket', 'polling'],
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export type InboxEvent =
  | { type: 'message:new'; data: any }
  | { type: 'conversation:update'; data: any }
  | { type: 'message:status'; data: any };
