'use client';

import { useCallback } from 'react';
import type { KloelChatRequestMetadata } from '@/lib/kloel-chat';
import {
  updateKloelThreadMessage,
  updateKloelMessageFeedback,
  regenerateKloelConversationMessage,
} from '@/lib/kloel-conversations';
import { getAssistantResponseVersions } from '@/lib/kloel-message-ui';
import { toErrorMessage, toMessageMetadata } from './KloelDashboard.helpers';
import type { DashboardMessage } from './KloelDashboard.message';
export interface UseKloelMessageHandlersDeps {
  messages: DashboardMessage[];
  setMessages: React.Dispatch<React.SetStateAction<DashboardMessage[]>>;
  handleSendMessage: (text: string, metadata?: KloelChatRequestMetadata) => Promise<void>;
  activeConversationId: string | null;
  refreshConversations: () => Promise<void>;
  setIsThinking: (value: boolean) => void;
  setStreamingMessageId: (value: string | null) => void;
}
export function useKloelMessageHandlers(deps: UseKloelMessageHandlersDeps) {
  const {
    messages,
    setMessages,
    handleSendMessage,
    activeConversationId,
    refreshConversations,
    setIsThinking,
    setStreamingMessageId,
  } = deps;

  const handleUserRetry = useCallback(
    async (messageId: string) => {
      const sourceMessage = messages.find(
        (message) => message.id === messageId && message.role === 'user',
      );
      if (!sourceMessage) {return;}
      await handleSendMessage(
        sourceMessage.text,
        sourceMessage.metadata as KloelChatRequestMetadata | undefined,
      );
    },
    [handleSendMessage, messages],
  );

  const handleUserEdit = useCallback(
    async (messageId: string, nextText: string) => {
      const updatedMessage = await updateKloelThreadMessage(messageId, nextText);
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                text: updatedMessage.content,
                metadata: toMessageMetadata(updatedMessage.metadata),
              }
            : message,
        ),
      );
      await handleSendMessage(
        nextText,
        updatedMessage.metadata as KloelChatRequestMetadata | undefined,
      );
    },
    [handleSendMessage],
  );

  const handleAssistantFeedback = useCallback(
    async (messageId: string, type: 'positive' | 'negative' | null) => {
      const updatedMessage = await updateKloelMessageFeedback(messageId, type);
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, metadata: toMessageMetadata(updatedMessage.metadata) }
            : message,
        ),
      );
    },
    [],
  );

  const handleAssistantRegenerate = useCallback(
    async (messageId: string) => {
      if (!activeConversationId) {return;}
      setStreamingMessageId(messageId);
      setIsThinking(true);
      setMessages((current) => {
        const targetIndex = current.findIndex((message) => message.id === messageId);
        if (targetIndex === -1) {return current;}
        const targetMessage = current[targetIndex];
        const preservedVersions = getAssistantResponseVersions(
          targetMessage.metadata,
          targetMessage.text,
          targetMessage.id,
        );
        return [
          ...current.slice(0, targetIndex),
          {
            ...targetMessage,
            text: '',
            metadata: { ...(targetMessage.metadata || {}), responseVersions: preservedVersions },
          },
        ];
      });
      try {
        const regenerated = await regenerateKloelConversationMessage(
          activeConversationId,
          messageId,
        );
        setMessages((current) => {
          const targetIndex = current.findIndex((message) => message.id === messageId);
          if (targetIndex === -1) {return current;}
          return [
            ...current.slice(0, targetIndex),
            {
              id: regenerated.id,
              role: 'assistant',
              text: regenerated.content,
              metadata: toMessageMetadata(regenerated.metadata),
            },
          ];
        });
        void refreshConversations();
      } catch (error: unknown) {
        setMessages((current) =>
          current.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  text: toErrorMessage(
                    error,
                    'Desculpe, ocorreu uma instabilidade ao tentar gerar uma nova versão.',
                  ),
                }
              : message,
          ),
        );
      } finally {
        setIsThinking(false);
        setStreamingMessageId(null);
      }
    },
    [activeConversationId, refreshConversations],
  );

  return { handleUserRetry, handleUserEdit, handleAssistantFeedback, handleAssistantRegenerate };
}
