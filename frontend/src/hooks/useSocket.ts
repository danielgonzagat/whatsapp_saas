'use client';

/**
 * Socket.IO connection hook — stub.
 * Returns a disconnected state until socket.io-client is installed
 * and the real implementation is wired up.
 */
export function useSocket() {
  return { connected: false, socket: null } as const;
}
