'use client';

import { mutate } from 'swr';
import { apiFetch } from '@/lib/api';
import { apiUrl } from '@/lib/http';
import { tokenStorage } from './api/core';
import {
  parseKloelStreamPayload,
  type KloelStreamErrorEvent,
  type KloelStreamEvent,
} from './kloel-stream-events';

export interface KloelSyncResponse {
  response: string;
  conversationId?: string;
  title?: string;
  reply?: string;
  message?: string;
  content?: string;
}

export interface ThreadMessagePayload {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
  createdAt?: string;
}

export interface ThreadMessageFeedbackValue {
  type: 'positive' | 'negative';
  updatedAt?: string;
}

export interface RegeneratedAssistantPayload extends ThreadMessagePayload {
  deletedMessageIds?: string[];
}

export interface ThreadSearchPayload {
  id: string;
  title: string;
  updatedAt?: string;
  matchedContent?: string;
  previewHtml?: string;
  tags?: string[];
  rank?: number;
}

export interface KloelStreamThreadPayload {
  conversationId: string;
  title?: string;
}

export interface KloelStreamOptions {
  onEvent?: (event: KloelStreamEvent) => void;
  onChunk: (chunk: string) => void;
  onThread?: (thread: KloelStreamThreadPayload) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
}

export function extractWrappedPayload<T>(payload: any): T {
  if (payload?.data !== undefined) {
    return payload.data as T;
  }
  return payload as T;
}

export async function sendAuthenticatedKloelMessage(input: {
  message: string;
  conversationId?: string | null;
  mode?: 'chat' | 'onboarding' | 'sales';
  companyContext?: string;
  metadata?: any;
}): Promise<KloelSyncResponse> {
  const res = await apiFetch<KloelSyncResponse>('/kloel/think/sync', {
    method: 'POST',
    body: {
      message: input.message,
      conversationId: input.conversationId || undefined,
      mode: input.mode,
      companyContext: input.companyContext,
      metadata: input.metadata,
    },
  });

  mutate((key: unknown) => typeof key === 'string' && key.startsWith('/kloel'));
  return extractWrappedPayload<KloelSyncResponse>(res);
}

export function streamAuthenticatedKloelMessage(
  input: {
    message: string;
    conversationId?: string | null;
    mode?: 'chat' | 'onboarding' | 'sales';
    companyContext?: string;
    metadata?: any;
  },
  options: KloelStreamOptions,
) {
  const controller = new AbortController();
  const token = tokenStorage.getToken();
  const SSE_IDLE_TIMEOUT_MS = 45_000;

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason);
    } else {
      options.signal.addEventListener('abort', () => controller.abort(options.signal?.reason), {
        once: true,
      });
    }
  }

  const run = async () => {
    try {
      const response = await fetch(apiUrl('/kloel/think'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${tokenStorage.getToken() || token || ''}`,
          'x-workspace-id': tokenStorage.getWorkspaceId() || '',
        },
        body: JSON.stringify({
          message: input.message,
          conversationId: input.conversationId || undefined,
          mode: input.mode,
          companyContext: input.companyContext,
          metadata: input.metadata,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let hasTerminalEvent = false;
      let idleTimeoutId: ReturnType<typeof setTimeout> | null = setTimeout(
        () => controller.abort('stream_idle_timeout'),
        SSE_IDLE_TIMEOUT_MS,
      );

      const resetIdleTimeout = () => {
        if (idleTimeoutId) {
          clearTimeout(idleTimeoutId);
        }
        idleTimeoutId = setTimeout(
          () => controller.abort('stream_idle_timeout'),
          SSE_IDLE_TIMEOUT_MS,
        );
      };

      const finishIdleTimeout = () => {
        if (!idleTimeoutId) return;
        clearTimeout(idleTimeoutId);
        idleTimeoutId = null;
      };

      const consumeLine = (line: string) => {
        if (!line.startsWith('data: ')) return false;

        const raw = line.slice(6);
        if (!raw || raw === '[DONE]') return false;

        const payload = JSON.parse(raw);

        for (const event of parseKloelStreamPayload(payload)) {
          options.onEvent?.(event);

          if (event.type === 'thread') {
            options.onThread?.({
              conversationId: event.conversationId,
              title: event.title,
            });
            continue;
          }

          if (event.type === 'content') {
            options.onChunk(event.content);
            continue;
          }

          if (event.type === 'error') {
            hasTerminalEvent = true;
            throw createKloelStreamError(event);
          }

          if (event.type === 'done') {
            hasTerminalEvent = true;
            options.onDone?.();
            mutate((key: unknown) => typeof key === 'string' && key.startsWith('/kloel'));
            return true;
          }
        }

        return false;
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          resetIdleTimeout();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            try {
              const shouldStop = consumeLine(line);
              if (shouldStop) {
                finishIdleTimeout();
                return;
              }
            } catch (error: any) {
              finishIdleTimeout();
              options.onError?.(error?.message || 'stream_parse_failed');
              return;
            }
          }
        }

        buffer += decoder.decode();
        if (buffer.trim().length > 0) {
          try {
            const shouldStop = consumeLine(buffer.trim());
            if (shouldStop) {
              finishIdleTimeout();
              return;
            }
          } catch (error: any) {
            finishIdleTimeout();
            options.onError?.(error?.message || 'stream_parse_failed');
            return;
          }
        }

        finishIdleTimeout();
      } finally {
        finishIdleTimeout();
      }

      if (!hasTerminalEvent) {
        options.onError?.(
          'A resposta foi interrompida antes da conclusão. Sua mensagem foi preservada. Tente novamente.',
        );
        return;
      }
    } catch (error: any) {
      if (controller.signal.aborted) {
        const abortReason =
          typeof controller.signal.reason === 'string'
            ? controller.signal.reason
            : 'stream_aborted';

        if (abortReason === 'cancelled_by_client') {
          return;
        }

        options.onError?.(
          abortReason === 'stream_idle_timeout'
            ? 'A resposta ficou inativa por muito tempo. Sua mensagem foi preservada. Tente novamente.'
            : abortReason,
        );
        return;
      }

      options.onError?.(error?.message || 'stream_failed');
    }
  };

  void run();

  return {
    abort: () => controller.abort('cancelled_by_client'),
  };
}

function createKloelStreamError(event: KloelStreamErrorEvent) {
  const error = new Error(event.content || event.error || 'stream_failed');
  (error as Error & { code?: string }).code = event.error || 'stream_failed';
  return error;
}

export async function loadKloelThreadMessages(
  conversationId: string,
): Promise<ThreadMessagePayload[]> {
  const res = await apiFetch<ThreadMessagePayload[]>(`/kloel/threads/${conversationId}/messages`);
  const payload = extractWrappedPayload<ThreadMessagePayload[] | undefined>(res);
  return Array.isArray(payload) ? payload : [];
}

export async function updateKloelThreadMessage(
  messageId: string,
  content: string,
): Promise<ThreadMessagePayload> {
  const res = await apiFetch<ThreadMessagePayload>(
    `/kloel/messages/${encodeURIComponent(messageId)}`,
    {
      method: 'PUT',
      body: { content },
    },
  );

  if (res.error) {
    throw new Error(res.error);
  }

  mutate((key: unknown) => typeof key === 'string' && key.startsWith('/kloel'));
  return extractWrappedPayload<ThreadMessagePayload>(res);
}

export async function updateKloelMessageFeedback(
  messageId: string,
  type: ThreadMessageFeedbackValue['type'] | null,
): Promise<ThreadMessagePayload> {
  const res = await apiFetch<ThreadMessagePayload>(
    `/kloel/messages/${encodeURIComponent(messageId)}/feedback`,
    {
      method: 'POST',
      body: { type },
    },
  );

  if (res.error) {
    throw new Error(res.error);
  }

  mutate((key: unknown) => typeof key === 'string' && key.startsWith('/kloel'));
  return extractWrappedPayload<ThreadMessagePayload>(res);
}

export async function regenerateKloelConversationMessage(
  conversationId: string,
  messageId: string,
): Promise<RegeneratedAssistantPayload> {
  const res = await apiFetch<RegeneratedAssistantPayload>(
    `/kloel/conversations/${encodeURIComponent(conversationId)}/regenerate`,
    {
      method: 'POST',
      body: { messageId },
    },
  );

  if (res.error) {
    throw new Error(res.error);
  }

  mutate((key: unknown) => typeof key === 'string' && key.startsWith('/kloel'));
  return extractWrappedPayload<RegeneratedAssistantPayload>(res);
}

export async function searchKloelThreads(
  query: string,
  limit = 20,
): Promise<ThreadSearchPayload[]> {
  const normalizedQuery = String(query || '').trim();
  if (normalizedQuery.length < 2) {
    return [];
  }

  const res = await apiFetch<ThreadSearchPayload[]>(
    `/kloel/conversations/search?q=${encodeURIComponent(normalizedQuery)}&limit=${Math.min(Math.max(limit, 1), 20)}`,
  );
  const payload = extractWrappedPayload<ThreadSearchPayload[] | undefined>(res);
  return Array.isArray(payload) ? payload : [];
}
