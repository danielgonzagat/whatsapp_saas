'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { KloelMushroomVisual } from '@/components/kloel/KloelBrand';
import { KloelMarkdown } from '@/components/kloel/KloelMarkdown';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { useConversationHistory } from '@/hooks/useConversationHistory';
import {
  loadKloelThreadMessages,
  streamAuthenticatedKloelMessage,
} from '@/lib/kloel-conversations';

const F = "'Sora', sans-serif";
const E = '#E85D30';
const V = '#0A0A0C';
const TEXT = '#E0DDD8';
const MUTED = '#6E6E73';
const MUTED_2 = '#3A3A3F';
const SURFACE = '#111113';
const DIVIDER = '#222226';

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
  inputRef: React.RefObject<HTMLInputElement | null>;
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
            background: canSend ? E : '#19191C',
            border: 'none',
            borderRadius: 6,
            cursor: canSend ? 'pointer' : 'default',
            color: canSend ? V : MUTED,
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
      <KloelMushroomVisual size={18} animated spores="animated" traceColor="#FFFFFF" ariaHidden />
      <span style={{ fontSize: 13, color: MUTED }}>{label}</span>
    </div>
  );
}

function MessageBlock({
  role,
  text,
  isStreaming = false,
  isThinking = false,
}: {
  role: 'user' | 'assistant';
  text: string;
  isStreaming?: boolean;
  isThinking?: boolean;
}) {
  if (role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          style={{
            background: '#19191C',
            border: '1px solid #26262A',
            borderRadius: 6,
            padding: '14px 18px',
            maxWidth: '78%',
            fontSize: 15,
            color: TEXT,
            lineHeight: 1.7,
            fontFamily: F,
            whiteSpace: 'pre-wrap',
          }}
        >
          {text}
        </div>
      </div>
    );
  }

  if (isThinking && !text.trim()) {
    return <AssistantThinkingState label="Kloel está pensando" />;
  }

  return (
    <div
      style={{
        fontSize: 15,
        color: TEXT,
        lineHeight: 1.78,
        fontFamily: F,
      }}
    >
      <KloelMarkdown content={text} />
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
            background: 'rgba(224, 221, 216, 0.82)',
            animation: 'kloel-stream-caret 1s steps(1, end) infinite',
          }}
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
  const [messages, setMessages] = useState<
    { id: string; role: 'user' | 'assistant'; text: string }[]
  >([]);
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
        router.replace('/', { scroll: false });
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isReplyInFlight) return;

    const userMessage = {
      id: `user_${Date.now()}`,
      role: 'user' as const,
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
              router.replace(`/?conversationId=${encodeURIComponent(thread.conversationId)}`, {
                scroll: false,
              });
            }
          },
          onDone: () => {
            streamEnded = true;
            scheduleDrain();
          },
          onError: (error) => {
            finalError = error || 'Desculpe, ocorreu uma instabilidade ao continuar sua conversa.';
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
          text: error?.message || 'Desculpe, ocorreu uma instabilidade ao continuar sua conversa.',
        },
      ]);
    }
  }, [
    activeConversationId,
    conversationTitle,
    conversationTitleMap,
    input,
    isReplyInFlight,
    refreshConversations,
    requestedConversationId,
    router,
    setActiveConversation,
    upsertConversation,
  ]);

  const hasMessages = messages.length > 0;

  return (
    <div
      style={{
        background: V,
        minHeight: '100vh',
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
          maxWidth: 760,
          width: '100%',
          margin: '0 auto',
          padding: '0 24px',
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
            }}
          >
            <div style={{ marginBottom: 20 }}>
              <KloelMushroomVisual size={56} traceColor="#FFFFFF" spores="none" ariaHidden />
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

            <div style={{ width: '100%', maxWidth: 680 }}>
              <InputBar
                input={input}
                setInput={setInput}
                onSend={handleSend}
                disabled={isReplyInFlight}
                placeholder="Como posso ajudar você hoje?"
                inputRef={inputRef}
              />
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                height: 52,
                display: 'flex',
                alignItems: 'center',
                borderBottom: '1px solid #19191C',
                flexShrink: 0,
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

            <div style={{ flex: 1, overflowY: 'auto', paddingTop: 28, paddingBottom: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                {messages.map((message) => (
                  <MessageBlock
                    key={message.id}
                    role={message.role}
                    text={message.text}
                    isStreaming={message.id === streamingMessageId && !isThinking}
                    isThinking={message.id === streamingMessageId && isThinking}
                  />
                ))}

                <div ref={messagesEndRef} />
              </div>
            </div>

            <div style={{ paddingBottom: 28, paddingTop: 12, flexShrink: 0 }}>
              <InputBar
                input={input}
                setInput={setInput}
                onSend={handleSend}
                disabled={isReplyInFlight}
                placeholder="Responder..."
                inputRef={inputRef}
              />
              <p
                style={{
                  margin: '12px 4px 0',
                  fontSize: 11,
                  color: MUTED_2,
                  lineHeight: 1.5,
                }}
              >
                Novo chat abre em branco. Conversas existentes ficam em{' '}
                <span style={{ color: TEXT }}>Conversas</span>.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
