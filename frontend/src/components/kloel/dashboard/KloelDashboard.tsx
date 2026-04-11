'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { KloelMushroomVisual } from '@/components/kloel/KloelBrand';
import { KloelMarkdown } from '@/components/kloel/KloelMarkdown';
import { MessageActionBar } from '@/components/kloel/MessageActionBar';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { openCookiePreferences } from '@/components/kloel/cookies/CookieProvider';
import { useConversationHistory } from '@/hooks/useConversationHistory';
import { KLOEL_CHAT_ROUTE } from '@/lib/kloel-dashboard-context';
import {
  loadKloelThreadMessages,
  regenerateKloelConversationMessage,
  streamAuthenticatedKloelMessage,
  updateKloelMessageFeedback,
  updateKloelThreadMessage,
} from '@/lib/kloel-conversations';
import { KLOEL_THEME } from '@/lib/kloel-theme';

const F = "'Sora', sans-serif";
const E = KLOEL_THEME.accent;
const EMBER = KLOEL_THEME.accent;
const V = KLOEL_THEME.bgPrimary;
const TEXT = KLOEL_THEME.textPrimary;
const MUTED = KLOEL_THEME.textSecondary;
const MUTED_2 = KLOEL_THEME.textTertiary;
const SURFACE = KLOEL_THEME.bgCard;
const DIVIDER = KLOEL_THEME.borderPrimary;
const CHAT_MAX_WIDTH = 760;
const CHAT_INLINE_PADDING = 'clamp(16px, 3vw, 24px)';
const CHAT_SAFE_BOTTOM = 'max(20px, env(safe-area-inset-bottom, 0px))';

type DashboardMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  metadata?: Record<string, any> | null;
};

function InputBar({
  input,
  setInput,
  onSend,
  disabled,
  placeholder,
  inputRef,
}: {
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder: string;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const canSend = input.trim().length > 0 && !disabled;

  return (
    <div
      style={{
        background: SURFACE,
        border: `1px solid ${DIVIDER}`,
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '18px 20px 12px' }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder={placeholder}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: TEXT,
            fontSize: 17,
            fontFamily: F,
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px 12px',
        }}
      >
        <button
          type="button"
          aria-label="Anexar"
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            color: MUTED,
            fontSize: 22,
            fontWeight: 300,
            fontFamily: F,
            borderRadius: 6,
            cursor: 'default',
          }}
        >
          +
        </button>

        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Enviar mensagem"
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: canSend ? E : KLOEL_THEME.bgSecondary,
            border: 'none',
            borderRadius: 6,
            cursor: canSend ? 'pointer' : 'default',
            color: canSend ? KLOEL_THEME.textOnAccent : MUTED,
            transition: 'all 150ms ease',
          }}
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  if (hour >= 18) return 'Boa noite';
  return 'Boa madrugada';
}

function AssistantThinkingState({ label }: { label: 'Kloel está pensando' }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 28,
        color: MUTED,
      }}
    >
      <KloelMushroomVisual size={18} animated spores="animated" traceColor={E} ariaHidden />
      <span style={{ fontSize: 13, color: MUTED }}>{label}</span>
    </div>
  );
}

function MessageBlock({
  message,
  isStreaming = false,
  isThinking = false,
  isBusy = false,
  onUserEdit,
  onUserRetry,
  onAssistantFeedback,
  onAssistantRegenerate,
}: {
  message: DashboardMessage;
  isStreaming?: boolean;
  isThinking?: boolean;
  isBusy?: boolean;
  onUserEdit?: (messageId: string, nextText: string) => Promise<void>;
  onUserRetry?: (messageId: string) => Promise<void>;
  onAssistantFeedback?: (messageId: string, type: 'positive' | 'negative' | null) => Promise<void>;
  onAssistantRegenerate?: (messageId: string) => Promise<void>;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(message.text);

  useEffect(() => {
    if (!isEditing) {
      setDraftText(message.text);
    }
  }, [isEditing, message.text]);

  if (message.role === 'user') {
    return (
      <div
        style={{ display: 'flex', justifyContent: 'flex-end' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div style={{ width: 'min(78%, 680px)' }}>
          {isEditing ? (
            <div
              style={{
                background: SURFACE,
                border: `1px solid ${DIVIDER}`,
                borderRadius: 6,
                padding: 14,
              }}
            >
              <textarea
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                rows={Math.max(3, Math.min(10, draftText.split('\n').length + 1))}
                style={{
                  width: '100%',
                  minHeight: 84,
                  resize: 'vertical',
                  border: `1px solid ${DIVIDER}`,
                  borderRadius: 6,
                  background: V,
                  color: TEXT,
                  fontFamily: F,
                  fontSize: 15,
                  lineHeight: 1.7,
                  padding: '12px 14px',
                  outline: 'none',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setDraftText(message.text);
                    setIsEditing(false);
                  }}
                  style={{
                    border: `1px solid ${DIVIDER}`,
                    borderRadius: 6,
                    background: 'transparent',
                    color: MUTED,
                    fontFamily: F,
                    fontSize: 13,
                    fontWeight: 600,
                    padding: '8px 12px',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isBusy || !draftText.trim() || draftText.trim() === message.text.trim()}
                  onClick={async () => {
                    await onUserEdit?.(message.id, draftText.trim());
                    setIsEditing(false);
                  }}
                  style={{
                    border: 'none',
                    borderRadius: 6,
                    background: EMBER,
                    color: KLOEL_THEME.textOnAccent,
                    fontFamily: F,
                    fontSize: 13,
                    fontWeight: 700,
                    padding: '8px 12px',
                    cursor:
                      isBusy || !draftText.trim() || draftText.trim() === message.text.trim()
                        ? 'default'
                        : 'pointer',
                    opacity:
                      isBusy || !draftText.trim() || draftText.trim() === message.text.trim()
                        ? 0.45
                        : 1,
                  }}
                >
                  Salvar
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  background: `color-mix(in srgb, ${KLOEL_THEME.accent} 6%, ${KLOEL_THEME.bgSecondary})`,
                  border: `1px solid color-mix(in srgb, ${KLOEL_THEME.accent} 22%, ${KLOEL_THEME.borderPrimary})`,
                  borderRadius: 6,
                  padding: '14px 18px',
                  fontSize: 15,
                  color: KLOEL_THEME.textPrimary,
                  lineHeight: 1.7,
                  fontFamily: F,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {message.text}
              </div>
              <MessageActionBar
                content={message.text}
                align="right"
                visible={isHovered}
                actions={[
                  {
                    id: 'edit',
                    label: 'Editar',
                    icon: 'edit',
                    disabled: isBusy,
                    onClick: () => setIsEditing(true),
                  },
                  {
                    id: 'retry',
                    label: 'Reenviar',
                    icon: 'retry',
                    disabled: isBusy,
                    onClick: async () => {
                      await onUserRetry?.(message.id);
                    },
                  },
                ]}
              />
            </>
          )}
        </div>
      </div>
    );
  }

  if (isThinking && !message.text.trim()) {
    return <AssistantThinkingState label="Kloel está pensando" />;
  }

  const feedbackType =
    message.metadata?.feedback?.type === 'positive' ||
    message.metadata?.feedback?.type === 'negative'
      ? (message.metadata.feedback.type as 'positive' | 'negative')
      : null;

  return (
    <div
      style={{
        fontSize: 15,
        color: TEXT,
        lineHeight: 1.78,
        fontFamily: F,
      }}
    >
      <KloelMarkdown content={message.text} />
      {isStreaming ? (
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 8,
            height: '1.1em',
            marginLeft: 6,
            borderRadius: 999,
            verticalAlign: 'text-bottom',
            background: KLOEL_THEME.accent,
            animation: 'kloel-stream-caret 1s steps(1, end) infinite',
          }}
        />
      ) : null}
      {!isThinking && message.text.trim() ? (
        <MessageActionBar
          content={message.text}
          align="left"
          visible={true}
          showLabels={true}
          actions={[
            {
              id: 'thumbs-up',
              label: 'Gostei',
              icon: 'thumbsUp',
              active: feedbackType === 'positive',
              disabled: isBusy,
              onClick: async () => {
                await onAssistantFeedback?.(
                  message.id,
                  feedbackType === 'positive' ? null : 'positive',
                );
              },
            },
            {
              id: 'thumbs-down',
              label: 'Não Gostei',
              icon: 'thumbsDown',
              active: feedbackType === 'negative',
              disabled: isBusy,
              onClick: async () => {
                await onAssistantFeedback?.(
                  message.id,
                  feedbackType === 'negative' ? null : 'negative',
                );
              },
            },
            {
              id: 'retry',
              label: 'Tentar novamente',
              icon: 'retry',
              disabled: isBusy || isStreaming,
              onClick: async () => {
                await onAssistantRegenerate?.(message.id);
              },
            },
          ]}
        />
      ) : null}
    </div>
  );
}

export default function KloelDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userName } = useAuth();
  const { conversations, setActiveConversation, upsertConversation, refreshConversations } =
    useConversationHistory();

  const requestedConversationId = searchParams.get('conversationId');
  const draft = searchParams.get('draft') || '';

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<DashboardMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState('Nova conversa');
  const [hasMounted, setHasMounted] = useState(false);

  const loadedConversationIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeStreamRef = useRef<{ abort: () => void } | null>(null);
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const conversationTitleMap = useMemo(
    () => new Map(conversations.map((conversation) => [conversation.id, conversation.title])),
    [conversations],
  );

  const firstName = String(userName || '')
    .trim()
    .split(/\s+/)[0];
  const greetingLine = useMemo(() => {
    const greeting = hasMounted ? getGreeting() : 'Bem-vindo';
    const hydratedFirstName = hasMounted ? firstName : '';
    return hydratedFirstName ? `${greeting}, ${hydratedFirstName}.` : `${greeting}.`;
  }, [firstName, hasMounted]);
  const isReplyInFlight = isThinking || Boolean(streamingMessageId);

  const resetToNewChat = useCallback(
    (replaceUrl = false) => {
      activeStreamRef.current?.abort();
      activeStreamRef.current = null;
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
      loadedConversationIdRef.current = null;
      setActiveConversationId(null);
      setConversationTitle('Nova conversa');
      setMessages([]);
      setInput('');
      setIsThinking(false);
      setStreamingMessageId(null);
      setActiveConversation(null);

      if (replaceUrl) {
        router.replace(KLOEL_CHAT_ROUTE, { scroll: false });
      }
    },
    [router, setActiveConversation],
  );

  const loadConversation = useCallback(
    async (conversationId: string) => {
      if (!conversationId) return;

      try {
        const payload = await loadKloelThreadMessages(conversationId);
        setMessages(
          payload
            .filter((message) => String(message?.content || '').trim())
            .map((message) => ({
              id: message.id,
              role: message.role,
              text: message.content,
              metadata:
                message.metadata &&
                typeof message.metadata === 'object' &&
                !Array.isArray(message.metadata)
                  ? (message.metadata as Record<string, any>)
                  : null,
            })),
        );
        loadedConversationIdRef.current = conversationId;
        setActiveConversationId(conversationId);
        setConversationTitle(conversationTitleMap.get(conversationId) || 'Nova conversa');
        setActiveConversation(conversationId);
      } catch (error) {
        console.error('Failed to load conversation in dashboard:', error);
      }
    },
    [conversationTitleMap, setActiveConversation],
  );

  useEffect(() => {
    if (!requestedConversationId) {
      if (messages.length > 0 || isThinking || activeConversationId) {
        return;
      }
      resetToNewChat(false);
      return;
    }

    if (loadedConversationIdRef.current === requestedConversationId) {
      return;
    }

    void loadConversation(requestedConversationId);
  }, [
    activeConversationId,
    isThinking,
    loadConversation,
    messages.length,
    requestedConversationId,
    resetToNewChat,
  ]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!draft.trim()) return;
    setInput(draft);
  }, [draft]);

  useEffect(() => {
    const handler = () => {
      resetToNewChat(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    window.addEventListener('kloel:new-chat', handler);
    return () => window.removeEventListener('kloel:new-chat', handler);
  }, [resetToNewChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isThinking, streamingMessageId]);

  useEffect(() => {
    return () => {
      activeStreamRef.current?.abort();
      activeStreamRef.current = null;
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
  }, []);

  const handleSendMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || isReplyInFlight) return;

      const userMessage: DashboardMessage = {
        id: `user_${Date.now()}`,
        role: 'user',
        text,
      };

      setMessages((current) => [...current, userMessage]);
      setInput('');
      setIsThinking(true);

      try {
        const assistantId = `assistant_${Date.now()}`;
        let streamedReply = '';
        let renderBuffer = '';
        let nextConversationId = activeConversationId || null;
        let nextTitle = conversationTitle;
        let streamEnded = false;
        let finalized = false;
        let finalError: string | null = null;
        let hasExitedThinking = false;
        const thinkingStartedAt = Date.now();
        const minimumThinkingMs = 420;

        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: 'assistant',
            text: '',
            metadata: null,
          },
        ]);
        setStreamingMessageId(assistantId);

        const syncAssistantText = (nextText: string) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, text: nextText } : message,
            ),
          );
        };

        const clearPlaybackTimer = () => {
          if (playbackTimerRef.current) {
            clearTimeout(playbackTimerRef.current);
            playbackTimerRef.current = null;
          }
        };

        const finalizeStream = () => {
          if (finalized) return;
          finalized = true;
          clearPlaybackTimer();
          activeStreamRef.current = null;
          setIsThinking(false);
          setStreamingMessageId(null);

          if (nextConversationId) {
            upsertConversation({
              id: nextConversationId,
              title: nextTitle || 'Nova conversa',
              updatedAt: new Date().toISOString(),
              lastMessagePreview: streamedReply.trim() || 'Resposta gerada pelo Kloel',
            });
            void refreshConversations();
            void loadConversation(nextConversationId);
          }
        };

        const drainBufferedReply = () => {
          playbackTimerRef.current = null;

          if (finalized) {
            return;
          }

          if (!hasExitedThinking && renderBuffer.length > 0) {
            const remainingThinking = minimumThinkingMs - (Date.now() - thinkingStartedAt);
            if (remainingThinking > 0) {
              playbackTimerRef.current = setTimeout(drainBufferedReply, remainingThinking);
              return;
            }

            hasExitedThinking = true;
            setIsThinking(false);
          }

          if (renderBuffer.length > 0) {
            const step =
              renderBuffer.length > 280
                ? 28
                : renderBuffer.length > 120
                  ? 18
                  : renderBuffer.length > 48
                    ? 10
                    : 5;
            const nextSlice = renderBuffer.slice(0, step);
            renderBuffer = renderBuffer.slice(step);
            streamedReply += nextSlice;
            syncAssistantText(streamedReply);
            playbackTimerRef.current = setTimeout(drainBufferedReply, 20);
            return;
          }

          if (streamEnded) {
            if (finalError && !streamedReply.trim()) {
              streamedReply = finalError;
              syncAssistantText(streamedReply);
            }
            finalizeStream();
          }
        };

        const scheduleDrain = () => {
          if (playbackTimerRef.current) {
            return;
          }
          playbackTimerRef.current = setTimeout(drainBufferedReply, 0);
        };

        activeStreamRef.current = streamAuthenticatedKloelMessage(
          {
            message: text,
            conversationId: activeConversationId || undefined,
            mode: 'chat',
          },
          {
            onEvent: (event) => {
              if (event.type !== 'status') {
                return;
              }

              if (
                event.phase === 'thinking' ||
                event.phase === 'tool_calling' ||
                event.phase === 'tool_result'
              ) {
                setIsThinking(true);
              }
            },
            onChunk: (chunk) => {
              renderBuffer += chunk;
              scheduleDrain();
            },
            onThread: (thread) => {
              nextConversationId = thread.conversationId;
              nextTitle =
                thread.title ||
                (thread.conversationId ? conversationTitleMap.get(thread.conversationId) : null) ||
                nextTitle ||
                'Nova conversa';

              loadedConversationIdRef.current = thread.conversationId;
              setActiveConversationId(thread.conversationId);
              setConversationTitle(nextTitle || 'Nova conversa');
              setActiveConversation(thread.conversationId);

              if (requestedConversationId !== thread.conversationId) {
                router.replace(
                  `${KLOEL_CHAT_ROUTE}?conversationId=${encodeURIComponent(thread.conversationId)}`,
                  {
                    scroll: false,
                  },
                );
              }
            },
            onDone: () => {
              streamEnded = true;
              scheduleDrain();
            },
            onError: (error) => {
              finalError =
                error || 'Desculpe, ocorreu uma instabilidade ao continuar sua conversa.';
              if (!streamedReply.trim() && !renderBuffer.trim()) {
                renderBuffer = finalError;
              }
              streamEnded = true;
              scheduleDrain();
            },
          },
        );
      } catch (error: any) {
        if (playbackTimerRef.current) {
          clearTimeout(playbackTimerRef.current);
          playbackTimerRef.current = null;
        }
        setIsThinking(false);
        setStreamingMessageId(null);
        setMessages((current) => [
          ...current,
          {
            id: `assistant_error_${Date.now()}`,
            role: 'assistant',
            text:
              error?.message || 'Desculpe, ocorreu uma instabilidade ao continuar sua conversa.',
            metadata: null,
          },
        ]);
      }
    },
    [
      activeConversationId,
      conversationTitle,
      conversationTitleMap,
      isReplyInFlight,
      refreshConversations,
      loadConversation,
      requestedConversationId,
      router,
      setActiveConversation,
      upsertConversation,
    ],
  );

  const handleSend = useCallback(() => {
    void handleSendMessage(input);
  }, [handleSendMessage, input]);

  const handleUserRetry = useCallback(
    async (messageId: string) => {
      const sourceMessage = messages.find(
        (message) => message.id === messageId && message.role === 'user',
      );
      if (!sourceMessage) return;

      await handleSendMessage(sourceMessage.text);
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
                metadata:
                  updatedMessage.metadata &&
                  typeof updatedMessage.metadata === 'object' &&
                  !Array.isArray(updatedMessage.metadata)
                    ? (updatedMessage.metadata as Record<string, any>)
                    : null,
              }
            : message,
        ),
      );

      await handleSendMessage(nextText);
    },
    [handleSendMessage],
  );

  const handleAssistantFeedback = useCallback(
    async (messageId: string, type: 'positive' | 'negative' | null) => {
      const updatedMessage = await updateKloelMessageFeedback(messageId, type);

      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                metadata:
                  updatedMessage.metadata &&
                  typeof updatedMessage.metadata === 'object' &&
                  !Array.isArray(updatedMessage.metadata)
                    ? (updatedMessage.metadata as Record<string, any>)
                    : null,
              }
            : message,
        ),
      );
    },
    [],
  );

  const handleAssistantRegenerate = useCallback(
    async (messageId: string) => {
      if (!activeConversationId) return;

      const regenerated = await regenerateKloelConversationMessage(activeConversationId, messageId);
      setMessages((current) => {
        const targetIndex = current.findIndex((message) => message.id === messageId);
        if (targetIndex === -1) {
          return current;
        }

        return [
          ...current.slice(0, targetIndex),
          {
            id: regenerated.id,
            role: 'assistant',
            text: regenerated.content,
            metadata:
              regenerated.metadata &&
              typeof regenerated.metadata === 'object' &&
              !Array.isArray(regenerated.metadata)
                ? (regenerated.metadata as Record<string, any>)
                : null,
          },
        ];
      });
      void refreshConversations();
    },
    [activeConversationId, refreshConversations],
  );

  const hasMessages = messages.length > 0;

  return (
    <div
      style={{
        background: V,
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: F,
        color: TEXT,
      }}
    >
      <style>{`
        @keyframes kloel-stream-caret {
          0%, 49% {
            opacity: 1;
          }

          50%, 100% {
            opacity: 0.18;
          }
        }

        input::placeholder {
          color: ${MUTED} !important;
        }

        ::-webkit-scrollbar {
          width: 4px;
        }

        ::-webkit-scrollbar-thumb {
          background: ${DIVIDER};
          border-radius: 999px;
        }
      `}</style>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          maxWidth: CHAT_MAX_WIDTH,
          width: '100%',
          margin: '0 auto',
          padding: `0 ${CHAT_INLINE_PADDING}`,
          minHeight: '100%',
        }}
      >
        {!hasMessages ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '32px 0 24px',
            }}
          >
            <div style={{ marginBottom: 20 }}>
              <KloelMushroomVisual
                size={56}
                traceColor={KLOEL_THEME.accent}
                spores="none"
                ariaHidden
              />
            </div>

            <h1
              suppressHydrationWarning
              style={{
                fontSize: 'clamp(28px, 5vw, 40px)',
                fontWeight: 700,
                letterSpacing: '-0.025em',
                margin: '0 0 44px',
                color: TEXT,
              }}
            >
              {greetingLine}
            </h1>
          </div>
        ) : (
          <>
            <div
              style={{
                minHeight: 52,
                display: 'flex',
                alignItems: 'center',
                borderBottom: '1px solid var(--app-border-subtle)',
                flexShrink: 0,
                paddingTop: 8,
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: TEXT,
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {conversationTitle}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 28,
                paddingTop: 28,
                paddingBottom: 24,
              }}
            >
              {messages.map((message) => (
                <MessageBlock
                  key={message.id}
                  message={message}
                  isStreaming={message.id === streamingMessageId && !isThinking}
                  isThinking={message.id === streamingMessageId && isThinking}
                  isBusy={isReplyInFlight}
                  onUserEdit={handleUserEdit}
                  onUserRetry={handleUserRetry}
                  onAssistantFeedback={handleAssistantFeedback}
                  onAssistantRegenerate={handleAssistantRegenerate}
                />
              ))}

              <div ref={messagesEndRef} style={{ scrollMarginBottom: 220 }} />
            </div>
          </>
        )}

        <div
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 12,
            marginTop: 'auto',
            paddingTop: 16,
            paddingBottom: CHAT_SAFE_BOTTOM,
            background: 'transparent',
            backdropFilter: 'none',
          }}
        >
          <InputBar
            input={input}
            setInput={setInput}
            onSend={handleSend}
            disabled={isReplyInFlight}
            placeholder={hasMessages ? 'Responder...' : 'Como posso ajudar você hoje?'}
            inputRef={inputRef}
          />
          <p
            style={{
              margin: '12px auto 0',
              width: '100%',
              fontSize: 'clamp(5px, 1.45vw + 0.5px, 11px)',
              color: MUTED_2,
              lineHeight: 1.2,
              textAlign: 'center',
              maxWidth: '100%',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: '-0.02em',
            }}
          >
            Kloel é uma IA e pode cometer erros. Confira informações importantes. Consulte as{' '}
            <button
              type="button"
              onClick={openCookiePreferences}
              style={{
                border: 'none',
                padding: 0,
                margin: 0,
                background: 'transparent',
                color: KLOEL_THEME.accent,
                fontSize: 'inherit',
                fontFamily: F,
                fontWeight: 600,
                textDecoration: 'underline',
                textUnderlineOffset: 3,
                cursor: 'pointer',
              }}
            >
              Preferências de Cookies
            </button>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
