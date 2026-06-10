'use client';

import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { brainDecide, type BrainDecideAction } from '@/lib/api/brain';
import { api } from '@/lib/api/core';
import { KLOEL_CHAT_ROUTE } from '@/lib/kloel-dashboard-context';
import { formatAssistantTraceToolLabel } from '@/lib/kloel-message-metadata';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { DashboardMessage } from '../KloelDashboard.message';

interface UseBrainRouterDeps {
  isReplyInFlight: boolean;
  activeConversationId: string | null;
  requestedConversationId: string | null;
  router: AppRouterInstance;
  setMessages: Dispatch<SetStateAction<DashboardMessage[]>>;
  setIsThinking: Dispatch<SetStateAction<boolean>>;
  setStreamingMessageId: Dispatch<SetStateAction<string | null>>;
  setActiveConversationId: Dispatch<SetStateAction<string | null>>;
  setConversationTitle: Dispatch<SetStateAction<string>>;
  setActiveConversation: (id: string | null) => void;
  setInput: Dispatch<SetStateAction<string>>;
  clearAllAttachments: () => void;
}

type PublicBrainIntentCopy = {
  action: string;
  target: string;
};

function publicBrainIntentCopy(intent: string): PublicBrainIntentCopy {
  const target = formatAssistantTraceToolLabel(intent) || 'ação operacional';
  return { action: 'executar', target };
}

function isBrainActionSuccessful(action: BrainDecideAction): boolean {
  const result = action.result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return true;
  }
  return (result as { ok?: unknown }).ok !== false;
}

function buildBrainActionTrace(actions: BrainDecideAction[] | undefined, requestId: string) {
  const safeRequestId = requestId || `brain_${Date.now()}`;
  return (actions ?? []).flatMap((action, index) => {
    const tool = formatAssistantTraceToolLabel(action.tool) || 'ação operacional';
    const spanId = `${safeRequestId}_action_${index}`;
    const success = isBrainActionSuccessful(action);
    return [
      {
        id: `${spanId}_call`,
        kind: 'tool_call' as const,
        phase: 'tool_calling' as const,
        label: `Ação enviada para ${tool}.`,
        tool,
        spanId,
      },
      {
        id: `${spanId}_result`,
        kind: 'tool_result' as const,
        phase: 'tool_result' as const,
        label: success ? `Observação recebida de ${tool}.` : `Falha observada em ${tool}.`,
        tool,
        spanId,
        success,
      },
    ];
  });
}

function readBrainOperatorErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'erro inesperado';
}

function isAuthBoundaryError(message: string): boolean {
  return /missing authorization header|unauthorized|\b401\b|jwt|bearer/i.test(message);
}

function sanitizeBrainOperatorErrorMessage(message: string): string {
  if (isAuthBoundaryError(message)) {
    return 'sessão expirada';
  }
  return message.replace(/[_-]+/g, ' ').trim() || 'erro inesperado';
}

export function formatBrainOperatorSuccessFallback(intent: string): string {
  const copy = publicBrainIntentCopy(intent);
  return `Consegui ${copy.action} ${copy.target} e registrei a observação operacional real.`;
}

export function formatBrainOperatorErrorMessage(intent: string, error: unknown): string {
  const copy = publicBrainIntentCopy(intent);
  const rawMessage = readBrainOperatorErrorMessage(error);
  if (isAuthBoundaryError(rawMessage)) {
    return `Não consegui ${copy.action} ${copy.target} agora porque sua sessão expirou. Faça login novamente para continuar.`;
  }

  return `Não consegui ${copy.action} ${copy.target} agora: ${sanitizeBrainOperatorErrorMessage(rawMessage)}. Tente novamente.`;
}

export function useBrainRouter(deps: UseBrainRouterDeps) {
  const {
    isReplyInFlight,
    activeConversationId,
    requestedConversationId,
    router,
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
            text: output.response || formatBrainOperatorSuccessFallback(intent),
            metadata: {
              clientRequestId,
              brainOperator: true,
              brainIntent: intent,
              brainResult: resultData ?? null,
              ok: !!(resultData && resultData.ok !== false),
              processingTrace: buildBrainActionTrace(output.actions, output.requestId),
            },
          },
        ]);

        if (output.conversationId) {
          setActiveConversationId(output.conversationId);
          if (output.title) {
            setConversationTitle(output.title);
          }
          setActiveConversation(output.conversationId);
          if (requestedConversationId !== output.conversationId) {
            router.replace(
              `${KLOEL_CHAT_ROUTE}?conversationId=${encodeURIComponent(output.conversationId)}`,
              { scroll: false },
            );
          }
        }
      } catch (error: unknown) {
        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: 'assistant',
            text: formatBrainOperatorErrorMessage(intent, error),
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
      requestedConversationId,
      router,
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
