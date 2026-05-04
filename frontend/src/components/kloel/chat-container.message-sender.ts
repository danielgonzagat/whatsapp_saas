// Chat message sending logic extracted from chat-container.tsx.
// No React hooks — only accepts React setState callbacks as arguments.

import { kloelError } from '@/lib/i18n/t';
import { streamAuthenticatedKloelMessage } from '@/lib/kloel-conversations';
import { appendAssistantTraceFromEvent } from '@/lib/kloel-message-ui';
import { apiUrl } from '@/lib/http';
import { mutate } from 'swr';
import { parseGuestStreamLine } from './chat-container.helpers';
import type { Message } from './chat-message.types';

type SetMessages = React.Dispatch<React.SetStateAction<Message[]>>;

/** Dependencies for the guest (unauthenticated) chat path. */
export interface GuestChatDeps {
  content: string;
  assistantId: string;
  guestSessionId: string | null;
  setMessages: SetMessages;
  setIsTyping: (v: boolean) => void;
}

/** Sends a message via the guest/unauthenticated SSE endpoint. */
export async function runGuestChat(deps: GuestChatDeps): Promise<void> {
  const { content, assistantId, guestSessionId, setMessages, setIsTyping } = deps;
  try {
    const response = await fetch(apiUrl('/chat/guest'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-Session-Id': guestSessionId || '',
      },
      body: JSON.stringify({ message: content.trim(), sessionId: guestSessionId }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    mutate((key: unknown) => typeof key === 'string' && key.startsWith('/chat'));
    const reader = response.body?.getReader();
    if (!reader) throw kloelError('Stream not available');
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    const readGuestStream = async (): Promise<void> => {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const update = parseGuestStreamLine(line);
        if (!update) continue;
        if (update.errorContent) {
          fullContent = update.errorContent;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: fullContent, isStreaming: false } : m,
            ),
          );
          throw new Error(fullContent);
        }
        if (update.delta) {
          fullContent += update.delta;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: fullContent } : m)),
          );
        }
      }
      await readGuestStream();
    };

    await readGuestStream();
    if (!fullContent.trim()) throw new Error('empty_stream');
    setMessages((prev) =>
      prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)),
    );
    setIsTyping(false);
  } catch (error) {
    console.error('Guest chat error:', error);
    try {
      const syncResponse = await fetch(apiUrl('/chat/guest/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': guestSessionId || '' },
        body: JSON.stringify({ message: content.trim(), sessionId: guestSessionId }),
      });
      if (syncResponse.ok) {
        const data = await syncResponse.json();
        const reply = data.reply ?? data.response ?? 'Sem resposta';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: reply, isStreaming: false } : m,
          ),
        );
        setIsTyping(false);
        return;
      }
    } catch {
      /* ignore */
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              content:
                'Desculpe, estou com dificuldades no momento. Tente novamente em alguns segundos.',
              isStreaming: false,
            }
          : m,
      ),
    );
    setIsTyping(false);
  }
}

/** Dependencies for the authenticated chat path. */
export interface AuthedChatDeps {
  content: string;
  assistantId: string;
  clientRequestId: string;
  activeConversationId: string | null;
  conversations: { id: string; title: string }[];
  setMessages: SetMessages;
  setIsTyping: (v: boolean) => void;
  setShowSlowHint: (v: boolean) => void;
  setIsCancelableReply: (v: boolean) => void;
  setActiveConversationId: (v: string) => void;
  setActiveConversation: (v: string | null) => void;
  upsertConversation: (c: { id: string; title: string; updatedAt: string }) => void;
  refreshConversations: () => void;
  loadConversation: (id: string) => Promise<void>;
  loadedConversationIdRef: React.MutableRefObject<string | null>;
  authedChatStreamRef: React.MutableRefObject<{ abort: () => void } | null>;
  extractErrorMessage: (e: unknown, fallback: string) => string;
}

/** Sends a message via the authenticated streaming endpoint. */
export function runAuthedChat(deps: AuthedChatDeps): void {
  const {
    content,
    assistantId,
    clientRequestId,
    activeConversationId,
    conversations,
    setMessages,
    setIsTyping,
    setShowSlowHint,
    setIsCancelableReply,
    setActiveConversationId,
    setActiveConversation,
    upsertConversation,
    refreshConversations,
    loadConversation,
    loadedConversationIdRef,
    authedChatStreamRef,
    extractErrorMessage,
  } = deps;

  let streamedReply = '';
  let nextConversationId = activeConversationId || null;
  let nextTitle =
    conversations.find((c) => c.id === activeConversationId)?.title || 'Nova conversa';

  setIsCancelableReply(true);
  authedChatStreamRef.current = streamAuthenticatedKloelMessage(
    {
      message: content.trim(),
      conversationId: activeConversationId || undefined,
      mode: 'chat',
      metadata: { clientRequestId, source: 'kloel_chat_container' },
    },
    {
      onEvent: (event) => {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? { ...message, meta: appendAssistantTraceFromEvent(message.meta, event) }
              : message,
          ),
        );
      },
      onChunk: (chunk) => {
        streamedReply += chunk;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: streamedReply, isStreaming: true } : m,
          ),
        );
      },
      onThread: (thread) => {
        nextConversationId = thread.conversationId;
        nextTitle =
          thread.title ||
          conversations.find((c) => c.id === thread.conversationId)?.title ||
          nextTitle ||
          'Nova conversa';
        loadedConversationIdRef.current = thread.conversationId;
        setActiveConversationId(thread.conversationId);
        setActiveConversation(thread.conversationId);
        upsertConversation({
          id: thread.conversationId,
          title: nextTitle,
          updatedAt: new Date().toISOString(),
        });
      },
      onDone: () => {
        authedChatStreamRef.current = null;
        setIsCancelableReply(false);
        setShowSlowHint(false);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)),
        );
        if (nextConversationId) {
          upsertConversation({
            id: nextConversationId,
            title: nextTitle,
            updatedAt: new Date().toISOString(),
          });
          void refreshConversations();
          void loadConversation(nextConversationId);
        }
        setIsTyping(false);
      },
      onError: (error) => {
        authedChatStreamRef.current = null;
        setIsCancelableReply(false);
        setShowSlowHint(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    streamedReply.trim() ||
                    error ||
                    'Desculpe, ocorreu um erro ao continuar sua conversa.',
                  isStreaming: false,
                }
              : m,
          ),
        );
        setIsTyping(false);
      },
    },
  );
}

/** Synchronously extracts an error message from an unknown error value. */
export function extractErrorMessage(error: unknown, fallback: string): string {
  return error && typeof error === 'object' && 'message' in error
    ? String((error as { message: string }).message)
    : fallback;
}
