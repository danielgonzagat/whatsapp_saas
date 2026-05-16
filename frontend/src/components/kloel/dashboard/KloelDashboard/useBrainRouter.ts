'use client';

import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { brainDecide } from '@/lib/api/brain';
import { api } from '@/lib/api/core';
import type { DashboardMessage } from '../KloelDashboard.message';

interface UseBrainRouterDeps {
  isReplyInFlight: boolean;
  activeConversationId: string | null;
  setMessages: Dispatch<SetStateAction<DashboardMessage[]>>;
  setIsThinking: Dispatch<SetStateAction<boolean>>;
  setStreamingMessageId: Dispatch<SetStateAction<string | null>>;
  setActiveConversationId: Dispatch<SetStateAction<string | null>>;
  setConversationTitle: Dispatch<SetStateAction<string>>;
  setActiveConversation: (id: string | null) => void;
  setInput: Dispatch<SetStateAction<string>>;
  clearAllAttachments: () => void;
}

export function useBrainRouter(deps: UseBrainRouterDeps) {
  const {
    isReplyInFlight,
    activeConversationId,
    setMessages,
    setIsThinking,
    setStreamingMessageId,
    setActiveConversationId,
    setConversationTitle,
    setActiveConversation,
    setInput,
    clearAllAttachments,
  } = deps;

  const handleOperatorDispatch = useCallback(
    async (text: string, intent: string) => {
      if (isReplyInFlight) {
        return;
      }
      const clientRequestId = `brain_${Date.now()}`;
      const userId = `user_${Date.now()}`;

      setMessages((current) => [
        ...current,
        { id: userId, role: 'user', text, metadata: { clientRequestId, brainIntent: intent } },
      ]);
      setInput('');
      clearAllAttachments();
      setIsThinking(true);

      const assistantId = `assistant_${Date.now()}`;

      try {
        const output = await brainDecide({
          intent,
          source: 'chat',
          messages: [{ role: 'user', content: text }],
          context: activeConversationId ? { conversationId: activeConversationId } : undefined,
        });

        const action = output.actions?.[0];
        const resultData = action?.result as Record<string, unknown> | undefined;

        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: 'assistant',
            text: output.response || `Acao "${intent}" executada.`,
            metadata: {
              clientRequestId,
              brainOperator: true,
              brainIntent: intent,
              brainResult: resultData ?? null,
              ok: !!(resultData && resultData.ok !== false),
            },
          },
        ]);

        if (output.conversationId) {
          setActiveConversationId(output.conversationId);
          if (output.title) {
            setConversationTitle(output.title);
          }
          setActiveConversation(output.conversationId);
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'brain_failed';
        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: 'assistant',
            text: `Falha ao executar "${intent}": ${msg}. Tente novamente.`,
            metadata: { clientRequestId, brainOperator: true, brainIntent: intent, ok: false },
          },
        ]);
      } finally {
        setIsThinking(false);
        setStreamingMessageId(null);
      }
    },
    [
      isReplyInFlight,
      clearAllAttachments,
      activeConversationId,
      setActiveConversation,
      setInput,
      setMessages,
      setIsThinking,
      setStreamingMessageId,
      setActiveConversationId,
      setConversationTitle,
    ],
  );

  const handleUnsupportedFallback = useCallback(
    async (text: string) => {
      const userId = `user_${Date.now()}`;
      setMessages((current) => [...current, { id: userId, role: 'user', text }]);
      setInput('');

      try {
        await api
          .post('/admin/lacunas-suggest', { intent: 'unsupported', userMessage: text })
          .catch(() => {});
      } catch {
        /* best-effort audit */
      }

      const fallbackId = `assistant_${Date.now()}`;
      setMessages((current) => [
        ...current,
        {
          id: fallbackId,
          role: 'assistant',
          text: 'Ainda nao consigo executar isso. Esta acao sera registrada para analise futura.',
          metadata: { brainFallback: true },
        },
      ]);
    },
    [setInput, setMessages],
  );

  return { handleOperatorDispatch, handleUnsupportedFallback };
}
