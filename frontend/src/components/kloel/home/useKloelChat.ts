import { kloelError } from '@/lib/i18n/t';
import { useConversationHistory } from '@/hooks/useConversationHistory';
import { tokenStorage } from '@/lib/api';
import { apiUrl } from '@/lib/http';
import { readStreamSequential } from '@/lib/async-sequence';
import { loadKloelThreadMessages, sendAuthenticatedKloelMessage } from '@/lib/kloel-conversations';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mutate } from 'swr';
import { parseKloelChatStreamLine } from './HomeScreen.helpers';
import { secureRandomFloat } from '@/lib/secure-random';
import { useTypingSimulation } from './useTypingSimulation';
import type { Phase, ChatMessage, UseKloelChatOptions, UseKloelChatReturn } from './HomeScreen.types';

const IS_DEV = process.env.NODE_ENV === 'development';

const DEV_FALLBACK_MESSAGE =
  'Desculpe, nao consegui processar sua mensagem. Tente novamente em alguns instantes.';

const ERROR_MESSAGE = 'Nao foi possivel conectar ao servidor. Tente novamente.';

export type { Phase, ChatMessage, UseKloelChatOptions, UseKloelChatReturn } from './HomeScreen.types';

export function useKloelChat({ onSendMessage }: UseKloelChatOptions): UseKloelChatReturn {
  const { conversations, setActiveConversation, upsertConversation, refreshConversations } =
    useConversationHistory();

  const [phase, setPhase] = useState<Phase>('home');
  const [homeInput, setHomeInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [thinkingText, setThinkingText] = useState('Analisando...');
  const [chatTitle, setChatTitle] = useState('Nova conversa');
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const {
    displayedText,
    isTyping,
    isDone,
    startTyping,
    cancel: cancelTyping,
  } = useTypingSimulation();
  const typingMessageIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isTyping && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayedText, isTyping]);

  useEffect(() => {
    if (!typingMessageIdRef.current) {
      return;
    }
    if (isTyping || isDone) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === typingMessageIdRef.current
            ? {
                ...msg,
                displayedContent: displayedText,
                isTyping: isTyping && !isDone,
                isThinking: false,
              }
            : msg,
        ),
      );
    }
  }, [displayedText, isTyping, isDone]);

  useEffect(() => {
    if (isDone) {
      setIsWaitingForResponse(false);
      typingMessageIdRef.current = null;
    }
  }, [isDone]);

  const conversationTitleMap = useMemo(() => {
    return new Map(conversations.map((conversation) => [conversation.id, conversation.title]));
  }, [conversations]);

  const generateId = useCallback(() => {
    return `msg_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;
  }, []);

  const sendToApi = useCallback(
    async (messageText: string) => {
      const token = tokenStorage.getToken();
      const workspaceId = tokenStorage.getWorkspaceId();
      const isGuest = !token || !workspaceId;

      const assistantId = generateId();
      typingMessageIdRef.current = assistantId;

      setMessages((prev) => [
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
      setThinkingText('Analisando...');

      try {
        abortControllerRef.current?.abort();
        const ac = new AbortController();
        abortControllerRef.current = ac;
        let fullContent = '';
        let nextConversationId = activeConversationId;
        let nextTitle = chatTitle;

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
                  setThinkingText(update.thinkingText);
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
            conversationId: activeConversationId,
            mode: 'chat',
          });
          fullContent = String(response.response || '').trim();
          nextConversationId = response.conversationId || activeConversationId;
          nextTitle =
            response.title || conversationTitleMap.get(nextConversationId || '') || chatTitle;
        }

        if (!fullContent.trim()) {
          throw new Error('empty_response');
        }

        setTimeout(() => {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantId ? { ...msg, content: fullContent } : msg)),
          );
          startTyping(fullContent);
        }, thinkDuration);

        if (!isGuest && nextConversationId) {
          setActiveConversationId(nextConversationId);
          setActiveConversation(nextConversationId);
          setChatTitle(nextTitle || 'Nova conversa');
          upsertConversation({
            id: nextConversationId,
            title: nextTitle || 'Nova conversa',
            updatedAt: new Date().toISOString(),
          });
          void refreshConversations();
        }
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') {
          return;
        }
        if (IS_DEV) {
          const fallbackText = DEV_FALLBACK_MESSAGE;

          setTimeout(() => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId ? { ...msg, content: fallbackText } : msg,
              ),
            );
            startTyping(fallbackText);
          }, thinkDuration);
        } else {
          setTimeout(() => {
            setMessages((prev) =>
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
            setIsWaitingForResponse(false);
            typingMessageIdRef.current = null;
          }, thinkDuration);
        }
      }
    },
    [
      activeConversationId,
      chatTitle,
      conversationTitleMap,
      generateId,
      refreshConversations,
      setActiveConversation,
      startTyping,
      upsertConversation,
    ],
  );

  const handleHomeSubmit = useCallback(() => {
    if (!homeInput.trim()) {
      return;
    }
    const text = homeInput.trim();
    setHomeInput('');

    setChatTitle('Nova conversa');
    setActiveConversationId(null);

    setPhase('transitioning');

    setTimeout(() => {
      setPhase('chat');

      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: text,
        timestamp: new Date(),
      };
      setMessages([userMsg]);
      setIsWaitingForResponse(true);

      sendToApi(text);
      onSendMessage?.(text);
    }, 800);
  }, [homeInput, generateId, sendToApi, onSendMessage]);

  const handleChatSubmit = useCallback(() => {
    if (!chatInput.trim() || isWaitingForResponse) {
      return;
    }
    const text = chatInput.trim();
    setChatInput('');

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsWaitingForResponse(true);
    sendToApi(text);
    onSendMessage?.(text);
  }, [chatInput, isWaitingForResponse, generateId, sendToApi, onSendMessage]);

  const handleNewChat = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    cancelTyping();
    setPhase('home');
    setMessages([]);
    setChatInput('');
    setHomeInput('');
    setChatTitle('Nova conversa');
    setActiveConversationId(null);
    setActiveConversation(null);
    setIsWaitingForResponse(false);
    typingMessageIdRef.current = null;
  }, [cancelTyping, setActiveConversation]);

  const handleStopResponse = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    cancelTyping();
    setIsWaitingForResponse(false);
    if (typingMessageIdRef.current) {
      setMessages((prev) =>
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
  }, [cancelTyping]);

  const handleCopyMessage = useCallback((msgId: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(msgId);
      setTimeout(() => setCopiedId((prev) => (prev === msgId ? null : prev)), 2000);
    });
  }, []);

  const handleEditMessage = useCallback((content: string) => {
    setChatInput(content);
    setTimeout(() => chatInputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    const handler = () => handleNewChat();
    window.addEventListener('kloel:new-chat', handler);
    return () => window.removeEventListener('kloel:new-chat', handler);
  }, [handleNewChat]);

  useEffect(() => {
    const handler = async (e: Event) => {
      const convId = (e as CustomEvent).detail?.conversationId;
      if (convId != null) {
        setActiveConversation(convId);
        setActiveConversationId(convId);
        setPhase('chat');
        try {
          const res = await loadKloelThreadMessages(String(convId));
          if (res.length > 0) {
            setMessages(
              res.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                displayedContent: m.content,
                isThinking: false,
                isTyping: false,
                timestamp: new Date(m.createdAt ?? Date.now()),
              })),
            );
          }
          setChatTitle(conversationTitleMap.get(String(convId)) || 'Nova conversa');
        } catch {
          /* offline fallback */
        }
      }
    };
    window.addEventListener('kloel:load-chat', handler);
    return () => window.removeEventListener('kloel:load-chat', handler);
  }, [conversationTitleMap, setActiveConversation]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  useEffect(() => {
    if (phase === 'chat') {
      const focusTimer = setTimeout(() => {
        chatInputRef.current?.focus();
      }, 600);
      return () => clearTimeout(focusTimer);
    }
    return undefined;
  }, [phase]);

  return {
    phase,
    homeInput,
    chatInput,
    messages,
    activeConversationId,
    thinkingText,
    chatTitle,
    isWaitingForResponse,
    copiedId,
    setHomeInput,
    setChatInput,
    handleHomeSubmit,
    handleChatSubmit,
    handleNewChat,
    handleStopResponse,
    handleCopyMessage,
    handleEditMessage,
    messagesEndRef,
    chatContainerRef,
    chatInputRef,
    ERROR_MESSAGE,
  };
}
