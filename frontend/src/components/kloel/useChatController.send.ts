'use client';

import { tokenStorage } from '@/lib/api';
import { useCallback, useEffect, useRef } from 'react';
import { createClientRequestId } from './chat-container.helpers';
import {
  runGuestChat,
  runAuthedChat,
  extractErrorMessage,
  type AuthedChatDeps,
} from './chat-container.message-sender';
import type { Message } from './chat-message.types';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

type SendMessageRef = MutableRefObject<(content: string) => Promise<void>>;

interface UseChatControllerSendMessageParams
  extends Pick<
    AuthedChatDeps,
    | 'activeConversationId'
    | 'authedChatStreamRef'
    | 'conversations'
    | 'loadConversation'
    | 'loadedConversationIdRef'
    | 'refreshConversations'
    | 'setActiveConversation'
    | 'upsertConversation'
  > {
  guestSessionId: string | null;
  isAuthenticated: boolean;
  setActiveConversationId: Dispatch<SetStateAction<string | null>>;
  setInputValue: Dispatch<SetStateAction<string>>;
  setIsCancelableReply: Dispatch<SetStateAction<boolean>>;
  setIsTyping: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setShowSlowHint: Dispatch<SetStateAction<boolean>>;
  showToast: (message: string, type: 'error') => void;
}

export function useChatControllerSendMessage({
  activeConversationId,
  authedChatStreamRef,
  conversations,
  guestSessionId,
  isAuthenticated,
  loadConversation,
  loadedConversationIdRef,
  refreshConversations,
  setActiveConversation,
  setActiveConversationId,
  setInputValue,
  setIsCancelableReply,
  setIsTyping,
  setMessages,
  setShowSlowHint,
  showToast,
  upsertConversation,
}: UseChatControllerSendMessageParams): {
  handleSendMessage: (content: string) => Promise<void>;
  handleSendMessageRef: SendMessageRef;
} {
  const handleSendMessageRef = useRef<(content: string) => Promise<void>>(async () => {});

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) {
        return;
      }
      const clientRequestId = createClientRequestId();
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'user',
          content: content.trim(),
          meta: { clientRequestId },
        },
      ]);
      setInputValue('');
      setIsTyping(true);
      setShowSlowHint(false);
      setIsCancelableReply(false);
      const assistantId = (Date.now() + 1).toString();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          isStreaming: true,
          meta: { clientRequestId },
        },
      ]);
      const workspaceId = tokenStorage.getWorkspaceId();
      if (!isAuthenticated || !workspaceId) {
        await runGuestChat({ content, assistantId, guestSessionId, setMessages, setIsTyping });
        return;
      }
      try {
        runAuthedChat({
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
        });
      } catch (error: unknown) {
        setIsCancelableReply(false);
        setShowSlowHint(false);
        const errMsg = extractErrorMessage(
          error,
          'Desculpe, ocorreu um erro ao continuar sua conversa.',
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: errMsg, isStreaming: false } : m,
          ),
        );
        setIsTyping(false);
        showToast(errMsg, 'error');
      }
    },
    [
      activeConversationId,
      authedChatStreamRef,
      conversations,
      guestSessionId,
      isAuthenticated,
      loadConversation,
      loadedConversationIdRef,
      refreshConversations,
      setActiveConversation,
      setActiveConversationId,
      setInputValue,
      setIsCancelableReply,
      setIsTyping,
      setMessages,
      setShowSlowHint,
      showToast,
      upsertConversation,
    ],
  );

  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  return { handleSendMessage, handleSendMessageRef };
}
