// kloelApi object (chat streaming)
import { API_BASE } from '../http';
import { apiFetch, tokenStorage } from './core';

const API_URL = API_BASE;

export const kloelApi = {
  // Send message and get streaming response.
  // Returns an object with an `abort()` method to cancel the stream.
  chat: (
    message: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (error: string) => void,
    signal?: AbortSignal,
  ) => {
    const controller = new AbortController();
    const SSE_TIMEOUT_MS = 30_000;

    // If the caller supplies an external signal, forward its abort.
    if (signal) {
      if (signal.aborted) {
        controller.abort(signal.reason);
      } else {
        signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
      }
    }

    const run = async () => {
      const token = tokenStorage.getToken();

      try {
        const res = await fetch(`${API_URL}/kloel/think`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ message }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          onError(errData.message || `HTTP ${res.status}`);
          return;
        }

        // Handle SSE streaming
        const reader = res.body?.getReader();
        if (!reader) {
          onError('Stream not available');
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        // Idle-timeout: abort if no data arrives within SSE_TIMEOUT_MS.
        let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
          () => controller.abort('SSE idle timeout'),
          SSE_TIMEOUT_MS,
        );
        const resetTimeout = () => {
          if (timeoutId !== undefined) clearTimeout(timeoutId);
          timeoutId = setTimeout(() => controller.abort('SSE idle timeout'), SSE_TIMEOUT_MS);
        };

        try {
          // biome-ignore lint/performance/noAwaitInLoops: sequential processing required
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            resetTimeout();

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  onDone();
                  return;
                }
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.chunk) {
                    onChunk(parsed.chunk);
                  }
                  if (parsed.error) {
                    onError(parsed.error);
                    return;
                  }
                } catch {
                  // Plain text chunk
                  onChunk(data);
                }
              }
            }
          }

          onDone();
        } finally {
          if (timeoutId !== undefined) clearTimeout(timeoutId);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          onError(
            typeof controller.signal.reason === 'string'
              ? controller.signal.reason
              : 'Stream aborted',
          );
          return;
        }
        onError(err instanceof Error ? err.message : 'Connection failed');
      }
    };

    run();

    return { abort: () => controller.abort('Cancelled by caller') };
  },

  // Non-streaming chat (fallback)
  chatSync: (message: string) => {
    return apiFetch<{ response: string }>(`/kloel/think/sync`, {
      method: 'POST',
      body: { message },
    });
  },

  // Get conversation history
  getHistory: () => {
    return apiFetch<{ messages: Array<Record<string, unknown>> }>(`/kloel/history`);
  },
};
