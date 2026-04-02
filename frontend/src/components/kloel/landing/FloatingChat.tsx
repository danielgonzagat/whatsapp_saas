'use client';

// PULSE:OK — Landing chat now talks to the real guest Kloel endpoint before signup.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/lib/http';
import { loadKloelThreadMessages, sendAuthenticatedKloelMessage } from '@/lib/kloel-conversations';
import { buildDashboardContextMetadata, buildDashboardHref } from '@/lib/kloel-dashboard-context';

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

const LANDING_GREETING: Message = {
  role: 'ai',
  content:
    'Oi. Eu sou o Kloel. Me fala o que você quer vender, automatizar ou destravar agora que eu te mostro a jogada.',
};

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
            bottom: 84,
            right: 24,
            width: 400,
            height: 520,
            background: '#0A0A0C',
            border: '1px solid #222226',
            borderRadius: 6,
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
                  letterSpacing: '0.08em',
                }}
              >
                {isAuthenticated ? 'IA OPERACIONAL AO VIVO' : 'DEMO CONVERSANDO DE VERDADE'}
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
              <button
                onClick={() => {
                  toggle(false);
                  router.push('/register');
                }}
                style={{
                  marginTop: 10,
                  width: '100%',
                  borderRadius: 6,
                  border: '1px solid #222226',
                  background: '#111113',
                  color: '#E0DDD8',
                  padding: '10px 12px',
                  fontFamily: sora,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Criar conta e continuar com o Kloel
              </button>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => toggle(!isOpen)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
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
