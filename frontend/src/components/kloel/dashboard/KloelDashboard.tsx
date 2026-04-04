'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { KloelMushroomVisual } from '@/components/kloel/KloelBrand';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { useConversationHistory } from '@/hooks/useConversationHistory';
import { loadKloelThreadMessages, sendAuthenticatedKloelMessage } from '@/lib/kloel-conversations';

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

function MessageBlock({ role, text }: { role: 'user' | 'assistant'; text: string }) {
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

  return (
    <div
      style={{
        fontSize: 15,
        color: TEXT,
        lineHeight: 1.78,
        fontFamily: F,
        whiteSpace: 'pre-wrap',
      }}
    >
      {text}
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
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState('Nova conversa');

  const loadedConversationIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversationTitleMap = useMemo(
    () => new Map(conversations.map((conversation) => [conversation.id, conversation.title])),
    [conversations],
  );

  const firstName = String(userName || '')
    .trim()
    .split(/\s+/)[0];
  const greetingLine = firstName ? `${getGreeting()}, ${firstName}.` : `${getGreeting()}.`;

  const resetToNewChat = useCallback(
    (replaceUrl = false) => {
      loadedConversationIdRef.current = null;
      setActiveConversationId(null);
      setConversationTitle('Nova conversa');
      setMessages([]);
      setInput('');
      setIsThinking(false);
      setActiveConversation(null);

      if (replaceUrl) {
        router.replace('/dashboard', { scroll: false });
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
      resetToNewChat(false);
      return;
    }

    if (loadedConversationIdRef.current === requestedConversationId) {
      return;
    }

    void loadConversation(requestedConversationId);
  }, [loadConversation, requestedConversationId, resetToNewChat]);

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
  }, [messages, isThinking]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isThinking) return;

    const userMessage = {
      id: `user_${Date.now()}`,
      role: 'user' as const,
      text,
    };

    setMessages((current) => [...current, userMessage]);
    setInput('');
    setIsThinking(true);

    try {
      const responsePayload = await sendAuthenticatedKloelMessage({
        message: text,
        conversationId: activeConversationId || undefined,
        mode: 'chat',
      });

      const reply =
        responsePayload?.response ||
        responsePayload?.reply ||
        responsePayload?.message ||
        responsePayload?.content ||
        'Desculpe, não consegui processar sua mensagem agora.';

      setMessages((current) => [
        ...current,
        {
          id: `assistant_${Date.now()}`,
          role: 'assistant',
          text: reply,
        },
      ]);

      const nextConversationId = responsePayload?.conversationId || activeConversationId || null;
      const nextTitle =
        responsePayload?.title ||
        (nextConversationId ? conversationTitleMap.get(nextConversationId) : null) ||
        conversationTitle;

      if (nextConversationId) {
        loadedConversationIdRef.current = nextConversationId;
        setActiveConversationId(nextConversationId);
        setConversationTitle(nextTitle || 'Nova conversa');
        setActiveConversation(nextConversationId);
        upsertConversation({
          id: nextConversationId,
          title: nextTitle || 'Nova conversa',
          updatedAt: new Date().toISOString(),
          lastMessagePreview: reply,
        });
        void refreshConversations();

        if (requestedConversationId !== nextConversationId) {
          router.replace(`/dashboard?conversationId=${encodeURIComponent(nextConversationId)}`, {
            scroll: false,
          });
        }
      }
    } catch (error: any) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant_error_${Date.now()}`,
          role: 'assistant',
          text: error?.message || 'Desculpe, ocorreu uma instabilidade ao continuar sua conversa.',
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  }, [
    activeConversationId,
    conversationTitle,
    conversationTitleMap,
    input,
    isThinking,
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
                disabled={isThinking}
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
                  <MessageBlock key={message.id} role={message.role} text={message.text} />
                ))}

                {isThinking && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      color: MUTED,
                      fontSize: 13,
                    }}
                  >
                    <KloelMushroomVisual
                      size={18}
                      animated
                      spores="animated"
                      traceColor="#FFFFFF"
                      ariaHidden
                    />
                    <span style={{ color: MUTED }}>Kloel está pensando</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            <div style={{ paddingBottom: 28, paddingTop: 12, flexShrink: 0 }}>
              <InputBar
                input={input}
                setInput={setInput}
                onSend={handleSend}
                disabled={isThinking}
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
