// Agent + message action handlers extracted from chat-container.tsx.
'use client';

import { billingApi, whatsappApi } from '@/lib/api';
import {
  regenerateKloelConversationMessage,
  updateKloelMessageFeedback,
  updateKloelThreadMessage,
} from '@/lib/kloel-conversations';
import { getAssistantResponseVersions } from '@/lib/kloel-message-ui';
import { useCallback } from 'react';
import { extractErrorMessage } from './chat-container.message-sender';
import type { Message } from './chat-message.types';

type SetMessages = React.Dispatch<React.SetStateAction<Message[]>>;

interface UseAgentActionsOpts {
  isAuthenticated: boolean;
  activeConversationId: string | null;
  messages: Message[];
  setMessages: SetMessages;
  setIsTyping: (v: boolean) => void;
  setIsAgentThinking: (v: boolean) => void;
  setCurrentThought: (v: string) => void;
  setAgentThoughts: React.Dispatch<React.SetStateAction<string[]>>;
  setPendingAgentAction: (v: string | null) => void;
  setShowActivationSuccess: (v: boolean) => void;
  setHasCard: (v: boolean) => void;
  refreshSubscription: () => Promise<void>;
  refreshConversations: () => void;
  openAuthModal: (mode: 'login' | 'signup') => void;
  setInputValue: (v: string) => void;
  handleSendMessageRef: React.MutableRefObject<(content: string) => Promise<void>>;
}

interface UseAgentActionsReturn {
  handleMessageRetry: (messageId: string) => Promise<void>;
  handleMessageEdit: (messageId: string, nextContent: string) => Promise<void>;
  handleAssistantFeedback: (
    messageId: string,
    type: 'positive' | 'negative' | null,
  ) => Promise<void>;
  handleAssistantRegenerate: (messageId: string) => Promise<void>;
  handleAgentQuickAction: (actionId: string, label: string) => Promise<void>;
  appendAssistantMessage: (content: string, meta?: Record<string, unknown>) => void;
  handleActivateTrial: () => Promise<void>;
}

function normalizeMessageMeta(metadata: unknown): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  return metadata as Record<string, unknown>;
}

export function useAgentActions({
  isAuthenticated,
  activeConversationId,
  messages,
  setMessages,
  setIsTyping,
  setIsAgentThinking,
  setCurrentThought,
  setAgentThoughts,
  setPendingAgentAction,
  setShowActivationSuccess,
  setHasCard,
  refreshSubscription,
  refreshConversations,
  openAuthModal,
  setInputValue,
  handleSendMessageRef,
}: UseAgentActionsOpts): UseAgentActionsReturn {
  const appendAssistantMessage = useCallback(
    (content: string, meta?: Record<string, unknown>) => {
      const normalized = String(content || '').trim();
      if (!normalized) return;
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
          role: 'assistant',
          content: normalized,
          meta,
        },
      ]);
    },
    [setMessages],
  );

  const handleMessageRetry = useCallback(
    async (messageId: string) => {
      const sourceMessage = messages.find((m) => m.id === messageId && m.role === 'user');
      if (!sourceMessage) return;
      await handleSendMessageRef.current(sourceMessage.content);
    },
    [messages, handleSendMessageRef],
  );

  const handleMessageEdit = useCallback(
    async (messageId: string, nextContent: string) => {
      if (!activeConversationId) return;
      const updated = await updateKloelThreadMessage(messageId, nextContent);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content: updated.content, meta: normalizeMessageMeta(updated.metadata) }
            : m,
        ),
      );
      await handleSendMessageRef.current(nextContent);
    },
    [activeConversationId, setMessages, handleSendMessageRef],
  );

  const handleAssistantFeedback = useCallback(
    async (messageId: string, type: 'positive' | 'negative' | null) => {
      if (!activeConversationId) return;
      const updated = await updateKloelMessageFeedback(messageId, type);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, meta: normalizeMessageMeta(updated.metadata) } : m,
        ),
      );
    },
    [activeConversationId, setMessages],
  );

  const handleAssistantRegenerate = useCallback(
    async (messageId: string) => {
      if (!activeConversationId) return;
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
          activeConversationId,
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
        void refreshConversations();
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
    [activeConversationId, setMessages, setIsTyping, refreshConversations],
  );

  const handleAgentQuickAction = useCallback(
    async (actionId: string, label: string) => {
      setPendingAgentAction(actionId);
      setMessages((prev) => [
        ...prev.map((m) =>
          Array.isArray(m.meta?.quickActions) && m.meta.quickActions.length > 0
            ? { ...m, meta: { ...m.meta, quickActions: [] } }
            : m,
        ),
        {
          id: `owner_action_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
          role: 'user',
          content: label,
        },
      ]);
      setCurrentThought('Preparando a execução do backlog');
      setAgentThoughts((prev) => [...prev.slice(-4), 'Preparando a execução do backlog']);
      setIsAgentThinking(true);
      try {
        const response = await whatsappApi.startBacklog(actionId);
        if (response.error) throw new Error(response.error);
      } catch (error: unknown) {
        const errMsg = extractErrorMessage(error, 'erro desconhecido');
        appendAssistantMessage(`Não consegui iniciar essa ação. Motivo: ${errMsg}.`);
        setIsAgentThinking(false);
      } finally {
        setPendingAgentAction(null);
      }
    },
    [
      setMessages,
      setCurrentThought,
      setAgentThoughts,
      setIsAgentThinking,
      setPendingAgentAction,
      appendAssistantMessage,
    ],
  );

  const handleActivateTrial = useCallback(async () => {
    try {
      await billingApi.activateTrial();
      await refreshSubscription();
      setHasCard(true);
      setShowActivationSuccess(true);
    } catch (err) {
      console.error('Failed to activate trial:', err);
    }
  }, [refreshSubscription, setHasCard, setShowActivationSuccess]);

  // Attach openAuthModal to keep the hook self-contained; it's used by callers
  void isAuthenticated;
  void openAuthModal;
  void setInputValue;

  return {
    handleMessageRetry,
    handleMessageEdit,
    handleAssistantFeedback,
    handleAssistantRegenerate,
    handleAgentQuickAction,
    appendAssistantMessage,
    handleActivateTrial,
  };
}
