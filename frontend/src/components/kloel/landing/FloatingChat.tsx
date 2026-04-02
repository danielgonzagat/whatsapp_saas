'use client';

// PULSE:OK — Landing chat now talks to the real guest Kloel endpoint before signup.

import { useState, useEffect, useRef, useCallback } from 'react';
import { mutate } from 'swr';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/lib/http';
import { loadKloelThreadMessages, sendAuthenticatedKloelMessage } from '@/lib/kloel-conversations';
import { buildDashboardContextMetadata, buildDashboardHref } from '@/lib/kloel-dashboard-context';
import { buildAuthUrl } from '@/lib/subdomains';

interface FloatingChatProps {
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
  initialMessage?: string;
  onInitialMessageConsumed?: () => void;
}

interface Message {
  role: 'user' | 'ai';
  content: string;
}

const AUTH_STORAGE_KEY = 'kloel:floating-chat:conversation';
const GUEST_SESSION_KEY = 'kloel:floating-chat:guest-session';
const GUEST_MESSAGES_KEY = 'kloel:floating-chat:guest-messages';
const LANDING_CHAT_EVENT = 'kloel:landing-chat-open';

const LANDING_GREETING: Message = {
  role: 'ai',
  content:
    'Eu sou o Kloel. Me diz o que você vende, ticket e canal principal que eu te mostro como eu operaria essa venda sem equipe manual.',
};

const GUEST_PROMPTS = [
  'Quero vender um infoproduto de R$497 no WhatsApp.',
  'Como você recupera carrinho e faz follow-up?',
  'Vendo consultoria high-ticket. Como você qualifica o lead?',
];

function normalizeAssistantReply(payload: any) {
  return (
    payload?.response ||
    payload?.reply ||
    payload?.message ||
    payload?.content ||
    'Eu continuo aqui. Me manda de novo que eu retomo sem enrolação.'
  );
}

export function FloatingChat({
  isOpen: controlledOpen,
  onToggle,
  initialMessage,
  onInitialMessageConsumed,
}: FloatingChatProps) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const consumedInitialMessageRef = useRef<string | null>(null);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const toggle = useCallback(
    (open: boolean) => {
      if (onToggle) {
        onToggle(open);
      } else {
        setInternalOpen(open);
      }
    },
    [onToggle],
  );

  const persistGuestState = useCallback(
    (nextMessages: Message[], nextSessionId?: string | null) => {
      if (typeof window === 'undefined') return;
      try {
        localStorage.setItem(GUEST_MESSAGES_KEY, JSON.stringify(nextMessages));
        if (nextSessionId) {
          localStorage.setItem(GUEST_SESSION_KEY, nextSessionId);
        }
      } catch {
        // ignore persistence failures
      }
    },
    [],
  );

  const appendMessage = useCallback(
    (message: Message, nextSessionId?: string | null) => {
      setMessages((prev) => {
        const nextMessages = [...prev, message];
        if (!isAuthenticated) {
          persistGuestState(nextMessages, nextSessionId ?? guestSessionId);
        }
        return nextMessages;
      });
    },
    [guestSessionId, isAuthenticated, persistGuestState],
  );

  const sendMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || isLoading) return;

      const userMessage: Message = { role: 'user', content: text };
      appendMessage(userMessage);
      setInput('');
      setIsLoading(true);

      try {
        if (isAuthenticated) {
          const data = await sendAuthenticatedKloelMessage({
            message: text,
            conversationId,
            mode: 'chat',
            metadata: buildDashboardContextMetadata({
              source: 'landing',
            }),
          });

          if (data.conversationId) {
            setConversationId(data.conversationId);
            try {
              sessionStorage.setItem(AUTH_STORAGE_KEY, data.conversationId);
            } catch {
              // ignore
            }
          }

          appendMessage({ role: 'ai', content: normalizeAssistantReply(data) });
          return;
        }

        const response = await fetch(apiUrl('/chat/guest/sync'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(guestSessionId ? { 'X-Session-Id': guestSessionId } : {}),
          },
          body: JSON.stringify({
            message: text,
            sessionId: guestSessionId || undefined,
          }),
        });

        if (!response.ok) {
          throw new Error(`guest_chat_failed:${response.status}`);
        }

        const payload = await response.json();
        mutate((key: unknown) => typeof key === 'string' && key.startsWith('/chat'));
        const nextSessionId = payload?.sessionId || guestSessionId || null;
        if (nextSessionId) {
          setGuestSessionId(nextSessionId);
        }

        appendMessage(
          {
            role: 'ai',
            content: normalizeAssistantReply(payload),
          },
          nextSessionId,
        );
      } catch {
        appendMessage({
          role: 'ai',
          content:
            'Eu continuo aqui, mas essa resposta falhou agora. Me manda de novo que eu sigo de onde parei.',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [appendMessage, conversationId, guestSessionId, isAuthenticated, isLoading],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 180);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleLandingOpen = (event: Event) => {
      const customEvent = event as CustomEvent<{ message?: string }>;
      const nextMessage = customEvent.detail?.message?.trim();
      toggle(true);
      if (nextMessage) {
        setPendingPrompt(nextMessage);
        setInput(nextMessage);
      }
    };

    window.addEventListener(LANDING_CHAT_EVENT, handleLandingOpen as EventListener);
    return () => {
      window.removeEventListener(LANDING_CHAT_EVENT, handleLandingOpen as EventListener);
    };
  }, [toggle]);

  useEffect(() => {
    if (!isOpen) return;

    if (isAuthenticated) {
      try {
        const storedConversationId = sessionStorage.getItem(AUTH_STORAGE_KEY);
        if (storedConversationId) {
          setConversationId(storedConversationId);
        }
      } catch {
        // ignore
      }

      setMessages((prev) => (prev.length > 0 ? prev : [LANDING_GREETING]));
      return;
    }

    try {
      const storedGuestSessionId = localStorage.getItem(GUEST_SESSION_KEY);
      const storedMessages = localStorage.getItem(GUEST_MESSAGES_KEY);
      setGuestSessionId(storedGuestSessionId || null);

      if (storedMessages) {
        const parsed = JSON.parse(storedMessages);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }

    setMessages([LANDING_GREETING]);
  }, [isAuthenticated, isOpen]);

  useEffect(() => {
    if (!isAuthenticated || !isOpen || !conversationId || messages.length > 1) return;

    let cancelled = false;

    void loadKloelThreadMessages(conversationId)
      .then((threadMessages) => {
        if (cancelled || threadMessages.length === 0) return;
        setMessages(
          threadMessages.map((message) => ({
            role: message.role === 'assistant' ? 'ai' : 'user',
            content: message.content,
          })),
        );
      })
      .catch(() => {
        // ignore
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, isAuthenticated, isOpen, messages.length]);

  useEffect(() => {
    if (!initialMessage || !isOpen) return;
    if (consumedInitialMessageRef.current === initialMessage) return;
    consumedInitialMessageRef.current = initialMessage;
    void sendMessage(initialMessage);
    onInitialMessageConsumed?.();
  }, [initialMessage, isOpen, onInitialMessageConsumed, sendMessage]);

  useEffect(() => {
    if (!isOpen || !pendingPrompt || isLoading) return;
    const prompt = pendingPrompt.trim();
    if (!prompt) {
      setPendingPrompt(null);
      return;
    }
    setPendingPrompt(null);
    void sendMessage(prompt);
  }, [isLoading, isOpen, pendingPrompt, sendMessage]);

  const handleSubmit = () => {
    if (input.trim()) {
      void sendMessage(input);
    }
  };

  const dashboardHref = buildDashboardHref({
    conversationId,
    source: 'landing',
    draft: !conversationId ? input : undefined,
  });

  const sora = "var(--font-sora), 'Sora', sans-serif";
  const jetbrains = "var(--font-jetbrains), 'JetBrains Mono', monospace";

  return (
    <>
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 'clamp(72px, 8vh, 84px)',
            right: 'clamp(12px, 2vw, 24px)',
            width: 'min(400px, calc(100vw - 24px))',
            height: 'min(560px, calc(100dvh - 108px))',
            maxHeight: 'calc(100dvh - 108px)',
            background: '#0A0A0C',
            border: '1px solid #222226',
            borderRadius: 12,
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 9999,
            animation: 'floatingChatFadeIn 150ms ease',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: 48,
              borderBottom: '1px solid #19191C',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span
                style={{
                  fontFamily: sora,
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#E0DDD8',
                }}
              >
                Kloel
              </span>
              <span
                style={{
                  fontFamily: jetbrains,
                  fontSize: 10,
                  color: '#6E6E73',
                  letterSpacing: '0.12em',
                }}
              >
                {isAuthenticated ? 'IA OPERACIONAL AO VIVO' : 'PROVA DE PRODUTO AO VIVO'}
              </span>
            </div>
            <button
              onClick={() => toggle(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#3A3A3F',
                fontSize: 18,
                lineHeight: 1,
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {!isAuthenticated && messages.length <= 1 && (
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  padding: '2px 0 4px',
                }}
              >
                <div
                  style={{
                    background: 'linear-gradient(180deg, rgba(232,93,48,.08), rgba(232,93,48,0))',
                    border: '1px solid rgba(232,93,48,.18)',
                    borderRadius: 10,
                    padding: '12px 14px',
                  }}
                >
                  <div
                    style={{
                      fontFamily: jetbrains,
                      fontSize: 10,
                      color: '#E85D30',
                      letterSpacing: '0.12em',
                      marginBottom: 6,
                    }}
                  >
                    TESTE O KLOEL
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: sora,
                      fontSize: 13,
                      color: '#A9A9AE',
                      lineHeight: 1.6,
                    }}
                  >
                    Me passa uma oferta, um canal ou uma objeção real. Eu respondo como venderia
                    isso na operação.
                  </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {GUEST_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => {
                        setPendingPrompt(prompt);
                        setInput(prompt);
                      }}
                      style={{
                        border: '1px solid #222226',
                        background: '#111113',
                        borderRadius: 999,
                        padding: '9px 12px',
                        fontFamily: sora,
                        fontSize: 12,
                        color: '#E0DDD8',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) =>
              msg.role === 'user' ? (
                <div
                  key={`${msg.role}-${i}`}
                  style={{ display: 'flex', justifyContent: 'flex-end' }}
                >
                  <div
                    style={{
                      background: '#E85D30',
                      color: '#0A0A0C',
                      borderRadius: 6,
                      padding: '10px 14px',
                      maxWidth: '80%',
                      fontFamily: sora,
                      fontSize: 14,
                      lineHeight: 1.5,
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ) : (
                <div
                  key={`${msg.role}-${i}`}
                  style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '86%' }}
                >
                  <span
                    style={{
                      fontFamily: jetbrains,
                      fontSize: 10,
                      fontWeight: 600,
                      color: '#E85D30',
                      letterSpacing: '0.05em',
                    }}
                  >
                    KLOEL
                  </span>
                  <div
                    style={{
                      background: '#111113',
                      border: '1px solid #222226',
                      borderRadius: 6,
                      padding: '10px 14px',
                      fontFamily: sora,
                      fontSize: 14,
                      color: '#E0DDD8',
                      lineHeight: 1.6,
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ),
            )}

            {isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '80%' }}>
                <span
                  style={{
                    fontFamily: jetbrains,
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#E85D30',
                    letterSpacing: '0.05em',
                  }}
                >
                  KLOEL
                </span>
                <div
                  style={{
                    background: '#111113',
                    border: '1px solid #222226',
                    borderRadius: 6,
                    padding: '10px 14px',
                    fontFamily: sora,
                    fontSize: 14,
                    color: '#6E6E73',
                  }}
                >
                  Pensando...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div
            style={{
              padding: 12,
              borderTop: '1px solid #19191C',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: '#111113',
                border: '1px solid #222226',
                borderRadius: 6,
                padding: '8px 12px',
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="Digite sua mensagem..."
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: '#E0DDD8',
                  fontSize: 14,
                  fontFamily: sora,
                }}
              />
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || isLoading}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: input.trim() ? '#E85D30' : '#19191C',
                  border: 'none',
                  cursor: input.trim() ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: input.trim() ? '#0A0A0C' : '#3A3A3F',
                  transition: 'all 150ms ease',
                  flexShrink: 0,
                }}
              >
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>

            {isAuthenticated ? (
              <button
                onClick={() => {
                  toggle(false);
                  router.push(dashboardHref);
                }}
                style={{
                  marginTop: 10,
                  width: '100%',
                  borderRadius: 6,
                  border: '1px solid #222226',
                  background: '#0A0A0C',
                  color: '#E0DDD8',
                  padding: '9px 12px',
                  fontFamily: sora,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {conversationId ? 'Continuar no dashboard' : 'Abrir IA no dashboard'}
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    toggle(false);
                    if (typeof window === 'undefined') return;
                    window.location.assign(buildAuthUrl('/register', window.location.host));
                  }}
                  style={{
                    marginTop: 10,
                    width: '100%',
                    borderRadius: 6,
                    border: 'none',
                    background: '#E85D30',
                    color: '#0A0A0C',
                    padding: '11px 12px',
                    fontFamily: sora,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Criar conta e ligar minha IA
                </button>
                <p
                  style={{
                    margin: '8px 0 0',
                    fontFamily: jetbrains,
                    fontSize: 10,
                    color: '#6E6E73',
                    letterSpacing: '0.08em',
                    textAlign: 'center',
                  }}
                >
                  SEM CARTÃO · TAXA SÓ QUANDO VENDER
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => toggle(!isOpen)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 'clamp(12px, 2vw, 24px)',
          width: 48,
          height: 48,
          borderRadius: 6,
          background: '#E85D30',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(232,93,48,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          transition: 'opacity 150ms ease',
        }}
      >
        {isOpen ? (
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0A0A0C"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0A0A0C"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      <style>{`
        @keyframes floatingChatFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
