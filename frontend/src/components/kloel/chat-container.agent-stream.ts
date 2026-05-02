// SSE agent stream connector extracted from chat-container.tsx.
// Pure async + callback — no React, no JSX.

import { API_BASE } from '@/lib/http';
import { tokenStorage } from '@/lib/api';
import type { AgentStreamEvent } from './chat-container.types';

export interface AgentStreamCallbacks {
  onEvent: (event: AgentStreamEvent) => void;
  onConnected: () => void;
  onDisconnected: () => void;
}

/**
 * Opens a persistent SSE connection to /whatsapp-api/live.
 * Returns a cleanup function that cancels retries and aborts the fetch.
 */
export function connectAgentStream(callbacks: AgentStreamCallbacks): () => void {
  const { onEvent, onConnected, onDisconnected } = callbacks;

  let isCancelled = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;

  const connect = async () => {
    const token = tokenStorage.getToken();
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!token || !workspaceId) {
      return;
    }

    controller = new AbortController();
    try {
      const response = await fetch(`${API_BASE}/whatsapp-api/live`, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${tokenStorage.getToken() || token}`,
          'x-workspace-id': tokenStorage.getWorkspaceId() || workspaceId,
        },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      onConnected();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const readStream = async (): Promise<void> => {
        if (isCancelled) {
          return;
        }
        const { done, value } = await reader.read();
        if (done) {
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) {
            continue;
          }
          const data = line.slice(6);
          if (!data || data === '[DONE]') {
            continue;
          }
          try {
            onEvent(JSON.parse(data) as AgentStreamEvent);
          } catch {
            // ignore malformed events
          }
        }
        await readStream();
      };

      await readStream();
    } catch (error) {
      if (isCancelled || controller?.signal.aborted) {
        return;
      }
      console.error('Agent stream error:', error);
      onDisconnected();
      retryTimer = setTimeout(connect, 2500);
    }
  };

  connect();

  return () => {
    isCancelled = true;
    onDisconnected();
    if (retryTimer) {
      clearTimeout(retryTimer);
    }
    controller?.abort();
  };
}
