// Message action handlers for ChatContainer.
// Pure hook — no JSX, no 'use client' needed (used only in the client component).
import { useCallback, useRef } from 'react';
import {
  regenerateKloelConversationMessage,
  updateKloelMessageFeedback,
  updateKloelThreadMessage,
} from '@/lib/kloel-conversations';
import { getAssistantResponseVersions } from '@/lib/kloel-message-ui';
import { extractErrorMessage } from './chat-container.message-sender';
import type { Message } from './chat-message.types';

type SetMessages = React.Dispatch<React.SetStateAction<Message[]>>;

function normalizeMessageMeta(metadata: unknown): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  return metadata as Record<string, unknown>;
}

type UseMessageActionsParams = {
  messages: Message[];
  activeConversationId: string | null;
  setMessages: SetMessages;
  setIsTyping: (v: boolean) => void;
  refreshConversations: () => void;
  sendMessageRef: React.RefObject<(content: string) => Promise<void>>;
};

export function useMessageActions({
  messages,
  activeConversationId,
  setMessages,
  setIsTyping,
  refreshConversations,
  sendMessageRef,
}: UseMessageActionsParams) {
  const activeIdRef = useRef(activeConversationId);
  activeIdRef.current = activeConversationId;

  const handleMessageRetry = useCallback(
    async (messageId: string) => {
      const sourceMessage = messages.find((m) => m.id === messageId && m.role === 'user');
      if (!sourceMessage) return;
      await sendMessageRef.current(sourceMessage.content);
    },
    [messages, sendMessageRef],
  );

  const handleMessageEdit = useCallback(
    async (messageId: string, nextContent: string) => {
      if (!activeIdRef.current) return;
      const updated = await updateKloelThreadMessage(messageId, nextContent);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content: updated.content, meta: normalizeMessageMeta(updated.metadata) }
            : m,
        ),
      );
      await sendMessageRef.current(nextContent);
    },
    [setMessages, sendMessageRef],
  );

  const handleAssistantFeedback = useCallback(
    async (messageId: string, type: 'positive' | 'negative' | null) => {
      if (!activeIdRef.current) return;
      const updated = await updateKloelMessageFeedback(messageId, type);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, meta: normalizeMessageMeta(updated.metadata) } : m,
        ),
      );
    },
    [setMessages],
  );

  const handleAssistantRegenerate = useCallback(
    async (messageId: string) => {
      if (!activeIdRef.current) return;
      setIsTyping(true);
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === messageId);
        if (idx === -1) return prev;
        const msg = prev[idx];
        const preserved = getAssistantResponseVersions(msg.meta, msg.content, msg.id);
        return [
          ...prev.slice(0, idx),
          {
            ...msg,
            content: '',
            isStreaming: true,
            meta: { ...(msg.meta || {}), responseVersions: preserved },
          },
        ];
      });
      try {
        const regenerated = await regenerateKloelConversationMessage(
          activeIdRef.current,
          messageId,
        );
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === messageId);
          if (idx === -1) return prev;
          return [
            ...prev.slice(0, idx),
            {
              id: regenerated.id,
              role: 'assistant',
              content: regenerated.content,
              meta: normalizeMessageMeta(regenerated.metadata),
            },
          ];
        });
        refreshConversations();
      } catch (error: unknown) {
        const errMsg = extractErrorMessage(
          error,
          'Desculpe, ocorreu uma instabilidade ao tentar gerar uma nova versão.',
        );
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, content: errMsg, isStreaming: false } : m)),
        );
      } finally {
        setIsTyping(false);
      }
    },
    [setMessages, setIsTyping, refreshConversations],
  );

  return {
    handleMessageRetry,
    handleMessageEdit,
    handleAssistantFeedback,
    handleAssistantRegenerate,
  };
}
