import { kloelError } from '@/lib/i18n/t';
import { tokenStorage } from '@/lib/api';
import { apiUrl } from '@/lib/http';
import { readStreamSequential } from '@/lib/async-sequence';
import { sendAuthenticatedKloelMessage } from '@/lib/kloel-conversations';
import { useCallback, useRef } from 'react';
import { mutate } from 'swr';
import { parseKloelChatStreamLine } from './HomeScreen.helpers';
import { secureRandomFloat } from '@/lib/secure-random';
import type { ChatMessage, Phase } from './HomeScreen.types';

const IS_DEV = process.env.NODE_ENV === 'development';

const DEV_FALLBACK_MESSAGE =
  'Desculpe, nao consegui processar sua mensagem. Tente novamente em alguns instantes.';

const ERROR_MESSAGE = 'Nao foi possivel conectar ao servidor. Tente novamente.';

interface UseKloelSendMessageDeps {
  activeConversationId: string | null;
  chatTitle: string;
  conversationTitleMap: Map<string, string>;
  generateId: () => string;
  startTyping: (text: string, onComplete?: () => void) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setThinkingText: React.Dispatch<React.SetStateAction<string>>;
  setActiveConversationId: React.Dispatch<React.SetStateAction<string | null>>;
  setChatTitle: React.Dispatch<React.SetStateAction<string>>;
  setIsWaitingForResponse: React.Dispatch<React.SetStateAction<boolean>>;
  setPhase: React.Dispatch<React.SetStateAction<Phase>>;
  setActiveConversation: (id: string) => void;
  upsertConversation: (conv: { id: string; title: string; updatedAt: string }) => void;
  refreshConversations: () => Promise<void>;
}

export function useKloelSendMessage(deps: UseKloelSendMessageDeps) {
  const typingMessageIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendToApi = useCallback(
    async (messageText: string) => {
      const token = tokenStorage.getToken();
      const workspaceId = tokenStorage.getWorkspaceId();
      const isGuest = !token || !workspaceId;

      const assistantId = deps.generateId();
      typingMessageIdRef.current = assistantId;

      deps.setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          displayedContent: '',
          isThinking: true,
          isTyping: false,
          timestamp: new Date(),
        },
      ]);

      const thinkDuration = 800 + secureRandomFloat() * 1200;
      deps.setThinkingText('Analisando...');

      try {
        abortControllerRef.current?.abort();
        const ac = new AbortController();
        abortControllerRef.current = ac;
        let fullContent = '';
        let nextConversationId = deps.activeConversationId;
        let nextTitle = deps.chatTitle;

        if (isGuest) {
          const response = await fetch(apiUrl('/chat/guest'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
            },
            body: JSON.stringify({ message: messageText }),
            signal: ac.signal,
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          mutate((key: unknown) => typeof key === 'string' && key.startsWith('/chat'));

          const reader = response.body?.getReader();
          if (!reader) {
            throw kloelError('No reader');
          }

          const decoder = new TextDecoder();

          await readStreamSequential(
            () => reader.read(),
            async ({ value }) => {
              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n');

              for (const line of lines) {
                const update = parseKloelChatStreamLine(line);
                if (!update) {
                  continue;
                }
                if (update.errorContent !== undefined) {
                  fullContent = update.errorContent;
                  break;
                }
                if (update.thinkingText) {
                  deps.setThinkingText(update.thinkingText);
                }
                if (update.contentDelta) {
                  fullContent += update.contentDelta;
                }
              }
              return false;
            },
          );
        } else {
          const response = await sendAuthenticatedKloelMessage({
            message: messageText,
            conversationId: deps.activeConversationId,
            mode: 'chat',
          });
          fullContent = String(response.response || '').trim();
          nextConversationId = response.conversationId || deps.activeConversationId;
          nextTitle =
            response.title ||
            deps.conversationTitleMap.get(nextConversationId || '') ||
            deps.chatTitle;
        }

        if (!fullContent.trim()) {
          throw new Error('empty_response');
        }

        setTimeout(() => {
          deps.setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? { ...msg, content: fullContent } : msg,
            ),
          );
          deps.startTyping(fullContent);
        }, thinkDuration);

        if (!isGuest && nextConversationId) {
          deps.setActiveConversationId(nextConversationId);
          deps.setActiveConversation(nextConversationId);
          deps.setChatTitle(nextTitle || 'Nova conversa');
          deps.upsertConversation({
            id: nextConversationId,
            title: nextTitle || 'Nova conversa',
            updatedAt: new Date().toISOString(),
          });
          void deps.refreshConversations();
        }
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') {
          return;
        }
        if (IS_DEV) {
          const fallbackText = DEV_FALLBACK_MESSAGE;

          setTimeout(() => {
            deps.setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId ? { ...msg, content: fallbackText } : msg,
              ),
            );
            deps.startTyping(fallbackText);
          }, thinkDuration);
        } else {
          setTimeout(() => {
            deps.setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? {
                      ...msg,
                      content: ERROR_MESSAGE,
                      isThinking: false,
                      isTyping: false,
                      displayedContent: ERROR_MESSAGE,
                    }
                  : msg,
              ),
            );
            deps.setIsWaitingForResponse(false);
            typingMessageIdRef.current = null;
          }, thinkDuration);
        }
      }
    },
    [
      deps.activeConversationId,
      deps.chatTitle,
      deps.conversationTitleMap,
      deps.generateId,
      deps.startTyping,
      deps.setMessages,
      deps.setThinkingText,
      deps.setActiveConversationId,
      deps.setChatTitle,
      deps.setIsWaitingForResponse,
      deps.setActiveConversation,
      deps.upsertConversation,
      deps.refreshConversations,
    ],
  );

  const handleStopResponse = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    if (typingMessageIdRef.current) {
      deps.setMessages((prev) =>
        prev.map((msg) =>
          msg.id === typingMessageIdRef.current
            ? {
                ...msg,
                isThinking: false,
                isTyping: false,
                displayedContent: msg.content || msg.displayedContent || '',
              }
            : msg,
        ),
      );
    }
    typingMessageIdRef.current = null;
    deps.setIsWaitingForResponse(false);
    deps.startTyping('', () => {}); // cancel typing
  }, [deps]);

  return { sendToApi, handleStopResponse, typingMessageIdRef, abortControllerRef };
}
