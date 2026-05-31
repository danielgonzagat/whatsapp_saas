'use client';

import { apiFetch } from '@/lib/api';
import { apiUrl } from '@/lib/http';
import { readStreamSequential } from '@/lib/async-sequence';
import { type KloelChatRequestMetadata } from '@/lib/kloel-chat';
import { mutate } from 'swr';
import { tokenStorage } from './api/core';
import {
  STREAM_INTERRUPTED_MESSAGE,
  clampThreadSearchLimit,
  consumeSseBuffer,
  createKloelStreamError,
  describeStreamAbortReason,
  extractSseDataPayload,
  extractWrappedPayload,
  normalizeThreadSearchQuery,
  toErrorMessage,
} from './kloel-conversations.helpers';
import {
  type KloelStreamEvent,
  parseKloelStreamPayload,
} from './kloel-stream-events';

type JsonRecord = Record<string, unknown>;

// Preserve the public API: `extractWrappedPayload` was previously declared
// inline in this module. After the Wave 117 helper extraction it lives in
// `kloel-conversations.helpers.ts`, but we keep re-exporting it from here so
// existing external consumers continue to import from `kloel-conversations`.
export { extractWrappedPayload };

/** Kloel sync response shape. */
export interface KloelSyncResponse {
  /** Response property. */
  response: string;
  /** Conversation id property. */
  conversationId?: string;
  /** Title property. */
  title?: string;
  /** Reply property. */
  reply?: string;
  /** Message property. */
  message?: string;
  /** Content property. */
  content?: string;
}

/** Thread message payload shape. */
export interface ThreadMessagePayload {
  /** Id property. */
  id: string;
  /** Role property. */
  role: 'user' | 'assistant';
  /** Content property. */
  content: string;
  /** Metadata property. */
  metadata?: JsonRecord | null;
  /** Created at property. */
  createdAt?: string;
}

/** Thread message feedback value shape. */
export interface ThreadMessageFeedbackValue {
  /** Type property. */
  type: 'positive' | 'negative';
  /** Updated at property. */
  updatedAt?: string;
}

/** Regenerated assistant payload shape. */
export interface RegeneratedAssistantPayload extends ThreadMessagePayload {
  /** Deleted message ids property. */
  deletedMessageIds?: string[];
}

/** Thread search payload shape. */
export interface ThreadSearchPayload {
  /** Id property. */
  id: string;
  /** Title property. */
  title: string;
  /** Updated at property. */
  updatedAt?: string;
  /** Matched content property. */
  matchedContent?: string;
  /** Preview html property. */
  previewHtml?: string;
  /** Tags property. */
  tags?: string[];
  /** Rank property. */
  rank?: number;
}

/** Kloel stream thread payload shape. */
export interface KloelStreamThreadPayload {
  /** Conversation id property. */
  conversationId: string;
  /** Title property. */
  title?: string | undefined;
}

/** Kloel stream options shape. */
export interface KloelStreamOptions {
  /** On event property. */
  onEvent?: (event: KloelStreamEvent) => void;
  /** On chunk property. */
  onChunk: (chunk: string) => void;
  /** On thread property. */
  onThread?: (thread: KloelStreamThreadPayload) => void;
  /** On done property. */
  onDone?: () => void;
  /** On error property. */
  onError?: (message: string) => void;
  /** Signal property. */
  signal?: AbortSignal;
}

/** Send authenticated kloel message. */
export async function sendAuthenticatedKloelMessage(
  input: {
    message: string;
    conversationId?: string | null;
    mode?: 'chat' | 'onboarding' | 'sales';
    companyContext?: string;
    metadata?: KloelChatRequestMetadata;
  },
  options: { signal?: AbortSignal } = {},
): Promise<KloelSyncResponse> {
  const res = await apiFetch<KloelSyncResponse>('/kloel/think/sync', {
    method: 'POST',
    body: {
      message: input.message,
      conversationId: input.conversationId || undefined,
      mode: input.mode,
      companyContext: input.companyContext,
      metadata: input.metadata,
    },
    ...(options.signal ? { signal: options.signal } : {}),
  });

  mutate((key: unknown) => typeof key === 'string' && key.startsWith('/kloel'));
  return extractWrappedPayload<KloelSyncResponse>(res);
}

/** Stream authenticated kloel message. */
export function streamAuthenticatedKloelMessage(
  input: {
    message: string;
    conversationId?: string | null;
    mode?: 'chat' | 'onboarding' | 'sales';
    companyContext?: string;
    metadata?: KloelChatRequestMetadata;
  },
  options: KloelStreamOptions,
) {
  const controller = new AbortController();
  const token = tokenStorage.getToken();
  // Time allowed between consecutive SSE chunks once the stream is flowing.
  const SSE_IDLE_TIMEOUT_MS = 45_000;
  // Extra grace period for the *first* byte after headers are accepted.
  // LLM cold-starts can take longer than 45s; starting the strict inter-chunk
  // timer before any data arrives would abort valid but slow responses.
  const SSE_FIRST_BYTE_TIMEOUT_MS = 90_000;

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
      // The initial timeout is the longer first-byte budget (90s). Every call
      // to resetIdleTimeout() — which fires on each received chunk — arms the
      // shorter inter-chunk budget (45s). This way slow LLM cold-starts don't
      // time out before the first token, while a stalled mid-stream is caught
      // quickly once data has started flowing.
      let idleTimeoutId: ReturnType<typeof setTimeout> | null = setTimeout(
        () => controller.abort('stream_idle_timeout'),
        SSE_FIRST_BYTE_TIMEOUT_MS,
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
        if (!idleTimeoutId) {
          return;
        }
        clearTimeout(idleTimeoutId);
        idleTimeoutId = null;
      };

      const consumeLine = (line: string) => {
        const raw = extractSseDataPayload(line);
        if (raw === null) {
          return false;
        }

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
            // Only a terminal error (done:true) stops the stream. A
            // non-terminal error (done:false) is recoverable: surface any
            // carried content as a chunk and keep reading so the trailing
            // content + the real terminal `done` still render. Backends should
            // emit content/status events for recoverable cases, but we stay
            // defensive here so a stray done:false error never wedges the chat.
            if (event.done !== true) {
              if (typeof event.content === 'string' && event.content.length > 0) {
                options.onChunk(event.content);
              }
              continue;
            }
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
        await readStreamSequential(
          () => reader.read(),
          async ({ value }) => {
            resetIdleTimeout();
            buffer += decoder.decode(value, { stream: true });
            const split = consumeSseBuffer(buffer);
            buffer = split.remainder;

            for (const line of split.lines) {
              try {
                const shouldStop = consumeLine(line);
                if (shouldStop) {
                  finishIdleTimeout();
                  return true;
                }
              } catch (error: unknown) {
                finishIdleTimeout();
                options.onError?.(toErrorMessage(error, 'stream_parse_failed'));
                return true;
              }
            }
            return false;
          },
        );

        buffer += decoder.decode();
        if (buffer.trim().length > 0) {
          try {
            const shouldStop = consumeLine(buffer.trim());
            if (shouldStop) {
              finishIdleTimeout();
              return;
            }
          } catch (error: unknown) {
            finishIdleTimeout();
            options.onError?.(toErrorMessage(error, 'stream_parse_failed'));
            return;
          }
        }

        finishIdleTimeout();
      } finally {
        finishIdleTimeout();
      }

      if (!hasTerminalEvent) {
        options.onError?.(STREAM_INTERRUPTED_MESSAGE);
        return;
      }
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        const message = describeStreamAbortReason(controller.signal.reason);
        if (message === null) {
          return;
        }
        options.onError?.(message);
        return;
      }

      options.onError?.(toErrorMessage(error, 'stream_failed'));
    }
  };

  void run();

  return {
    abort: () => controller.abort('cancelled_by_client'),
  };
}

/** Load kloel thread messages. */
export async function loadKloelThreadMessages(
  conversationId: string,
): Promise<ThreadMessagePayload[]> {
  const res = await apiFetch<ThreadMessagePayload[]>(`/kloel/threads/${conversationId}/messages`);
  const payload = extractWrappedPayload<ThreadMessagePayload[] | undefined>(res);
  return Array.isArray(payload) ? payload : [];
}

/** Update kloel thread message. */
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

/** Update kloel message feedback. */
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

/** Regenerate kloel conversation message. */
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

/** Search kloel threads. */
export async function searchKloelThreads(
  query: string,
  limit = 20,
): Promise<ThreadSearchPayload[]> {
  const normalizedQuery = normalizeThreadSearchQuery(query);
  if (normalizedQuery === null) {
    return [];
  }

  const res = await apiFetch<ThreadSearchPayload[]>(
    `/kloel/conversations/search?q=${encodeURIComponent(normalizedQuery)}&limit=${clampThreadSearchLimit(limit)}`,
  );
  const payload = extractWrappedPayload<ThreadSearchPayload[] | undefined>(res);
  return Array.isArray(payload) ? payload : [];
}
