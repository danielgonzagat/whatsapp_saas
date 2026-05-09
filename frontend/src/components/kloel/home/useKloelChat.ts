import { useConversationHistory } from '@/hooks/useConversationHistory';
import { loadKloelThreadMessages } from '@/lib/kloel-conversations';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTypingSimulation } from './useTypingSimulation';
import { useKloelSendMessage } from './useKloelSendMessage';
import type { Phase, ChatMessage, UseKloelChatOptions, UseKloelChatReturn } from './HomeScreen.types';

export type { Phase, ChatMessage, UseKloelChatOptions, UseKloelChatReturn } from './HomeScreen.types';

const ERROR_MESSAGE = 'Nao foi possivel conectar ao servidor. Tente novamente.';

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

  const conversationTitleMap = useMemo(() => {
    return new Map(conversations.map((conversation) => [conversation.id, conversation.title]));
  }, [conversations]);

  const generateId = useCallback(() => {
    return `msg_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;
  }, []);

  const { sendToApi, handleStopResponse: stopResponse, typingMessageIdRef, abortControllerRef } =
    useKloelSendMessage({
      activeConversationId,
      chatTitle,
      conversationTitleMap,
      generateId,
      startTyping,
      setMessages,
      setThinkingText,
      setActiveConversationId,
      setChatTitle,
      setIsWaitingForResponse,
      setActiveConversation,
      upsertConversation,
      refreshConversations,
    });

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
  }, [cancelTyping, setActiveConversation, abortControllerRef, typingMessageIdRef]);

  const handleStopResponse = useCallback(() => {
    cancelTyping();
    stopResponse();
  }, [cancelTyping, stopResponse]);

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
