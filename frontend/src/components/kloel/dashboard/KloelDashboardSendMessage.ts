'use client';

import {
  type KloelChatAttachment,
  type KloelChatCapability,
  type KloelChatRequestMetadata,
  type KloelLinkedProduct,
} from '@/lib/kloel-chat';
import { streamAuthenticatedKloelMessage } from '@/lib/kloel-conversations';
import { KLOEL_CHAT_ROUTE } from '@/lib/kloel-dashboard-context';
import { appendAssistantTraceFromEvent } from '@/lib/kloel-message-ui';
import { computeDrainStep, createClientRequestId, toErrorMessage } from './KloelDashboard.helpers';
import { type DashboardMessage } from './KloelDashboard.message';
import { type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';

export interface SendMessageContext {
  setMessages: Dispatch<SetStateAction<DashboardMessage[]>>;
  setIsThinking: Dispatch<SetStateAction<boolean>>;
  setStreamingMessageId: Dispatch<SetStateAction<string | null>>;
  setActiveConversationId: Dispatch<SetStateAction<string | null>>;
  setConversationTitle: Dispatch<SetStateAction<string>>;
  isReplyInFlight: boolean;
  activeConversationId: string | null;
  conversationTitle: string;
  conversationTitleMap: Map<string, string>;
  clearAllAttachments: () => void;
  clearComposerContext: () => void;
  loadConversation: (id: string) => Promise<void>;
  refreshConversations: () => Promise<void>;
  upsertConversation: (conv: {
    id: string;
    title: string;
    updatedAt: string;
    lastMessagePreview: string;
  }) => void;
  setActiveConversation: (id: string | null) => void;
  requestedConversationId: string | null;
  router: ReturnType<typeof useRouter>;
  attachments: KloelChatAttachment[];
  linkedProduct: KloelLinkedProduct | null;
  activeCapability: KloelChatCapability | null;
  activeStreamRef: MutableRefObject<{ abort: () => void } | null>;
  loadedConversationIdRef: MutableRefObject<string | null>;
  streamingMessageId: string | null;
}

export function createSendMessageHandler(ctx: SendMessageContext) {
  return async (rawText: string, requestMetadata?: KloelChatRequestMetadata) => {
    const readyAttachments = ctx.attachments.filter((attachment) => attachment.status === 'ready');
    const text =
      rawText.trim() || (readyAttachments.length > 0 ? 'Analise os anexos enviados.' : '');
    if (!text || ctx.isReplyInFlight) {
      return;
    }
    const clientRequestId = createClientRequestId();
    const buildMetadata = (cid: string): KloelChatRequestMetadata => ({
      clientRequestId: cid,
      source: 'kloel_dashboard',
      attachments: readyAttachments.map((a) => ({
        id: a.id,
        name: a.name,
        size: a.size,
        mimeType: a.mimeType,
        kind: a.kind,
        url: a.url || a.previewUrl || null,
      })),
      linkedProduct: ctx.linkedProduct,
      capability: ctx.activeCapability,
    });

    const normalizedMetadata = {
      ...(requestMetadata || buildMetadata(clientRequestId)),
      clientRequestId,
      source: 'kloel_dashboard',
    } satisfies KloelChatRequestMetadata;

    const userMessage: DashboardMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      text,
      metadata: normalizedMetadata,
    };

    ctx.setMessages((current) => [...current, userMessage]);
    ctx.clearComposerContext();
    ctx.setIsThinking(true);

    const assistantId = `assistant_${Date.now()}`;
    const initialAssistantMetadata = {
      clientRequestId,
    };
    let streamedReply = '';
    let renderBuffer = '';
    let nextConversationId = ctx.activeConversationId || null;
    let nextTitle = ctx.conversationTitle;
    let streamEnded = false;
    let finalized = false;
    let finalError: string | null = null;
    let hasExitedThinking = false;
    const thinkingStartedAt = performance.now();
    const minimumThinkingMs = 420;
    const playbackTimerRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };
    // Safety net: if the stream never delivers a terminal event (provider
    // wedged, keep-alive pings masking the idle timeout, connection severed
    // without a close), finalizeStream() would never run and
    // streamingMessageId would stay set forever — which keeps the derived
    // isReplyInFlight true, so EVERY subsequent send becomes a silent no-op
    // ("Kloel não responde e nada aparece"). This wall-clock backstop
    // guarantees the streaming state is always released.
    const HARD_STREAM_WATCHDOG_MS = 300_000;
    const hardWatchdogRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };
    const clearHardWatchdog = () => {
      if (hardWatchdogRef.current) {
        clearTimeout(hardWatchdogRef.current);
        hardWatchdogRef.current = null;
      }
    };

    const syncAssistantText = (nextText: string) => {
      ctx.setMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, text: nextText } : message,
        ),
      );
    };

    const clearPlaybackTimer = () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
    // Defensive legacy path: if a stale backend still emits reasoning_delta, coalesce
    // before metadata handling drops the private text so it never renders per token.
    let reasoningBuffer = '';
    let reasoningFlushTimer: ReturnType<typeof setTimeout> | null = null;
    const flushReasoning = () => {
      reasoningFlushTimer = null;
      if (!reasoningBuffer) {
        return;
      }
      const delta = reasoningBuffer;
      reasoningBuffer = '';
      ctx.setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                metadata:
                  appendAssistantTraceFromEvent(message.metadata, {
                    type: 'reasoning_delta',
                    text: delta,
                  }) || null,
              }
            : message,
        ),
      );
    };
    const scheduleReasoningFlush = () => {
      if (reasoningFlushTimer) {
        return;
      }
      reasoningFlushTimer = setTimeout(flushReasoning, 40);
    };

    const finalizeStream = () => {
      if (finalized) {
        return;
      }
      finalized = true;
      clearPlaybackTimer();
      clearHardWatchdog();
      ctx.activeStreamRef.current = null;
      ctx.setIsThinking(false);
      ctx.setStreamingMessageId(null);

      if (nextConversationId) {
        ctx.upsertConversation({
          id: nextConversationId,
          title: nextTitle || 'Nova conversa',
          updatedAt: new Date().toISOString(),
          lastMessagePreview: streamedReply.trim() || 'Resposta gerada pelo Kloel',
        });
        void ctx.refreshConversations();
        if (!finalError) {
          void ctx.loadConversation(nextConversationId);
        }
        if (ctx.requestedConversationId !== nextConversationId) {
          ctx.router.replace(
            `${KLOEL_CHAT_ROUTE}?conversationId=${encodeURIComponent(nextConversationId)}`,
            { scroll: false },
          );
        }
      }
    };

    const drainBufferedReply = () => {
      playbackTimerRef.current = null;

      if (finalized) {
        return;
      }

      if (!hasExitedThinking && renderBuffer.length > 0) {
        const remainingThinking = minimumThinkingMs - (performance.now() - thinkingStartedAt);
        if (remainingThinking > 0) {
          playbackTimerRef.current = setTimeout(drainBufferedReply, remainingThinking);
          return;
        }

        hasExitedThinking = true;
        ctx.setIsThinking(false);
      }

      if (renderBuffer.length > 0) {
        const step = computeDrainStep(renderBuffer.length);
        const nextSlice = renderBuffer.slice(0, step);
        renderBuffer = renderBuffer.slice(step);
        streamedReply += nextSlice;
        syncAssistantText(streamedReply);
        playbackTimerRef.current = setTimeout(drainBufferedReply, 20);
        return;
      }

      if (streamEnded) {
        if (finalError && !streamedReply.trim()) {
          streamedReply = finalError;
          syncAssistantText(streamedReply);
        }
        finalizeStream();
      }
    };

    const scheduleDrain = () => {
      if (playbackTimerRef.current) {
        return;
      }
      playbackTimerRef.current = setTimeout(drainBufferedReply, 0);
    };

    try {
      ctx.setMessages((current) => [
        ...current,
        {
          id: assistantId,
          role: 'assistant',
          text: '',
          metadata: initialAssistantMetadata,
        },
      ]);
      ctx.setStreamingMessageId(assistantId);

      // IDLE watchdog: reasoning is UNLIMITED in time. As long as the stream is
      // actively delivering events/tokens (reasoning_delta included) the timer is
      // re-armed (see armWatchdog() calls in onEvent/onChunk), so an arbitrarily
      // long think never trips it. It fires ONLY on true silence — no event for
      // the idle window — to release a genuinely wedged stream.
      const armWatchdog = () => {
        clearHardWatchdog();
        hardWatchdogRef.current = setTimeout(() => {
          if (finalized) {
            return;
          }
          try {
            ctx.activeStreamRef.current?.abort();
          } catch {
            // best-effort: aborting a wedged stream must not throw here
          }
          const watchdogMessage =
            'O Kloel não respondeu a tempo. Sua mensagem foi preservada — tente enviar novamente.';
          finalError = finalError || watchdogMessage;
          if (!streamedReply.trim()) {
            streamedReply = watchdogMessage;
            syncAssistantText(streamedReply);
          }
          streamEnded = true;
          finalizeStream();
        }, HARD_STREAM_WATCHDOG_MS);
      };
      armWatchdog();

      ctx.activeStreamRef.current = streamAuthenticatedKloelMessage(
        {
          message: text,
          ...(ctx.activeConversationId ? { conversationId: ctx.activeConversationId } : {}),
          mode: 'chat',
          metadata: normalizedMetadata,
        },
        {
          onEvent: (event) => {
            armWatchdog();
            if (
              event.type === 'status' &&
              (event.phase === 'thinking' ||
                event.phase === 'tool_calling' ||
                event.phase === 'tool_result')
            ) {
              ctx.setIsThinking(true);
            }

            if (event.type === 'reasoning_delta') {
              ctx.setIsThinking(true);
              reasoningBuffer += event.text;
              scheduleReasoningFlush();
              return;
            }

            ctx.setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      metadata: appendAssistantTraceFromEvent(message.metadata, event) || null,
                    }
                  : message,
              ),
            );
          },
          onChunk: (chunk) => {
            armWatchdog();
            renderBuffer += chunk;
            scheduleDrain();
          },
          onThread: (thread) => {
            nextConversationId = thread.conversationId;
            nextTitle =
              thread.title ||
              (thread.conversationId
                ? ctx.conversationTitleMap.get(thread.conversationId)
                : null) ||
              nextTitle ||
              'Nova conversa';

            ctx.setActiveConversationId(thread.conversationId);
            ctx.setConversationTitle(nextTitle || 'Nova conversa');
            ctx.loadedConversationIdRef.current = thread.conversationId;
            ctx.setActiveConversation(thread.conversationId);
          },
          onDone: () => {
            streamEnded = true;
            scheduleDrain();
          },
          onError: (error) => {
            finalError = error || 'Desculpe, ocorreu uma instabilidade ao continuar sua conversa.';
            if (!streamedReply.trim() && !renderBuffer.trim()) {
              renderBuffer = finalError;
            }
            streamEnded = true;
            scheduleDrain();
          },
        },
      );
    } catch (error: unknown) {
      clearPlaybackTimer();
      clearHardWatchdog();
      ctx.activeStreamRef.current = null;
      ctx.setIsThinking(false);
      ctx.setStreamingMessageId(null);
      ctx.setMessages((current) => [
        ...current,
        {
          id: `assistant_error_${Date.now()}`,
          role: 'assistant',
          text: toErrorMessage(
            error,
            'Desculpe, ocorreu uma instabilidade ao continuar sua conversa.',
          ),
          metadata: null,
        },
      ]);
    }
  };
}
