'use client';

import { mutate } from 'swr';
import { apiFetch } from '@/lib/api';
import { apiUrl } from '@/lib/http';
import { tokenStorage } from './api/core';

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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (!raw || raw === '[DONE]') continue;

          try {
            const event = JSON.parse(raw);

            if (event?.type === 'thread' && event?.conversationId) {
              options.onThread?.({
                conversationId: String(event.conversationId),
                title: typeof event.title === 'string' ? event.title : undefined,
              });
              continue;
            }

            if (typeof event?.content === 'string' && event.content.length > 0) {
              options.onChunk(event.content);
            }

            if (event?.error) {
              throw new Error(String(event.error));
            }

            if (event?.done) {
              options.onDone?.();
              mutate((key: unknown) => typeof key === 'string' && key.startsWith('/kloel'));
              return;
            }
          } catch (error: any) {
            options.onError?.(error?.message || 'stream_parse_failed');
            return;
          }
        }
      }

      options.onDone?.();
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/kloel'));
    } catch (error: any) {
      if (controller.signal.aborted) {
        options.onError?.(
          typeof controller.signal.reason === 'string'
            ? controller.signal.reason
            : 'stream_aborted',
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

export async function loadKloelThreadMessages(
  conversationId: string,
): Promise<ThreadMessagePayload[]> {
  const res = await apiFetch<ThreadMessagePayload[]>(`/kloel/threads/${conversationId}/messages`);
  const payload = extractWrappedPayload<ThreadMessagePayload[] | undefined>(res);
  return Array.isArray(payload) ? payload : [];
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
