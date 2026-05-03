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
import { computeDrainStep, createClientRequestId, toErrorMessage } from '../KloelDashboard.helpers';
import { type DashboardMessage } from '../KloelDashboard.message';
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
  streamingMessageId: string | null;
}

export function createSendMessageHandler(ctx: SendMessageContext) {
  return async (rawText: string, requestMetadata?: KloelChatRequestMetadata) => {
    const text = rawText.trim();
    if (!text || ctx.isReplyInFlight) {
      return;
    }
    const clientRequestId = createClientRequestId();
    const buildMetadata = (cid: string): KloelChatRequestMetadata => ({
      clientRequestId: cid,
      source: 'kloel_dashboard',
      attachments: ctx.attachments
        .filter((a) => a.status === 'ready')
        .map((a) => ({
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
    ctx.clearAllAttachments();
    ctx.setIsThinking(true);

    const assistantId = `assistant_${Date.now()}`;
    let streamedReply = '';
    let renderBuffer = '';
    let nextConversationId = ctx.activeConversationId || null;
    let nextTitle = ctx.conversationTitle;
    let streamEnded = false;
    let finalized = false;
    let finalError: string | null = null;
    let hasExitedThinking = false;
    const thinkingStartedAt = Date.now();
    const minimumThinkingMs = 420;
    const playbackTimerRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };

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

    const finalizeStream = () => {
      if (finalized) {
        return;
      }
      finalized = true;
      clearPlaybackTimer();
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
        void ctx.loadConversation(nextConversationId);
      }
    };

    const drainBufferedReply = () => {
      playbackTimerRef.current = null;

      if (finalized) {
        return;
      }

      if (!hasExitedThinking && renderBuffer.length > 0) {
        const remainingThinking = minimumThinkingMs - (Date.now() - thinkingStartedAt);
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
          metadata: { clientRequestId },
        },
      ]);
      ctx.setStreamingMessageId(assistantId);

      ctx.activeStreamRef.current = streamAuthenticatedKloelMessage(
        {
          message: text,
          conversationId: ctx.activeConversationId || undefined,
          mode: 'chat',
          metadata: normalizedMetadata,
        },
        {
          onEvent: (event) => {
            if (
              event.type === 'status' &&
              (event.phase === 'thinking' ||
                event.phase === 'tool_calling' ||
                event.phase === 'tool_result')
            ) {
              ctx.setIsThinking(true);
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
            ctx.setActiveConversation(thread.conversationId);

            if (ctx.requestedConversationId !== thread.conversationId) {
              ctx.router.replace(
                `${KLOEL_CHAT_ROUTE}?conversationId=${encodeURIComponent(thread.conversationId)}`,
                { scroll: false },
              );
            }
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
