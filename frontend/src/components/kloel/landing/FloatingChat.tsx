'use client';

// PULSE:OK — Guest chat uses one-shot POST to /chat/guest. No SWR caches to invalidate; manual state for messages.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/lib/http';
import {
  loadKloelThreadMessages,
  sendAuthenticatedKloelMessage,
} from '@/lib/kloel-conversations';
import {
  buildDashboardContextMetadata,
  buildDashboardHref,
} from '@/lib/kloel-dashboard-context';

interface FloatingChatProps {
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
  initialMessage?: string;
  onInitialMessageConsumed?: () => void;
}

interface Message {
  role: 'user' | 'ai' | 'system';
  content: string;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const storageKey = 'kloel:floating-chat:conversation';

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const toggle = useCallback(
    (open: boolean) => {
      if (onToggle) {
        onToggle(open);
      } else {
        setInternalOpen(open);
      }
    },
    [onToggle]
  );

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Handle initial message
  useEffect(() => {
    if (initialMessage && isOpen && isAuthenticated) {
      void sendMessage(initialMessage);
      onInitialMessageConsumed?.();
    }
  }, [initialMessage, isOpen]);

  useEffect(() => {
    if (!isAuthenticated) {
      setConversationId(null);
      setMessages([]);
      return;
    }

    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        setConversationId(stored);
      }
    } catch {
      // ignore
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !isOpen || !conversationId || messages.length > 0) return;

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

  // Show unauthenticated message
  useEffect(() => {
    if (isOpen && !isAuthenticated && messages.length === 0) {
      setMessages([
        {
          role: 'system',
          content: 'Crie sua conta gratuita para conversar com o Kloel',
        },
      ]);
    }
  }, [isOpen, isAuthenticated, messages.length]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || !isAuthenticated) return;

    const userMsg: Message = { role: 'user', content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const data = await sendAuthenticatedKloelMessage({
        message: text.trim(),
        conversationId,
        mode: 'chat',
        metadata: buildDashboardContextMetadata({
          source: 'landing',
        }),
      });

      if (data.conversationId) {
        setConversationId(data.conversationId);
        try {
          sessionStorage.setItem(storageKey, data.conversationId);
        } catch {
          // ignore
        }
      }
      const aiContent =
        data?.response || data?.reply || data?.message || 'Estou processando sua solicitacao.';

      setMessages((prev) => [...prev, { role: 'ai', content: aiContent }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'ai', content: 'Desculpe, ocorreu um erro. Tente novamente.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

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
      {/* Chat Panel */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 84,
            right: 24,
            width: 400,
            height: 500,
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
          {/* Header */}
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
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
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
            {messages.map((msg, i) => {
              if (msg.role === 'system') {
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 12,
                      padding: '24px 16px',
                    }}
                  >
                    <p
                      style={{
                        fontFamily: sora,
                        fontSize: 13,
                        color: '#6E6E73',
                        textAlign: 'center',
                        lineHeight: 1.5,
                      }}
                    >
                      {msg.content}
                    </p>
                    <button
                      onClick={() => router.push('/register')}
                      style={{
                        fontFamily: sora,
                        fontSize: 13,
                        fontWeight: 600,
                        background: '#E0DDD8',
                        color: '#0A0A0C',
                        border: 'none',
                        borderRadius: 6,
                        padding: '10px 20px',
                        cursor: 'pointer',
                        transition: 'opacity 150ms ease',
                      }}
                    >
                      Criar conta gratuita
                    </button>
                  </div>
                );
              }

              if (msg.role === 'user') {
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
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
                );
              }

              // AI message
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '80%' }}>
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
                      lineHeight: 1.5,
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            })}

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
                    color: '#3A3A3F',
                  }}
                >
                  Pensando...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          {isAuthenticated && (
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
            </div>
          )}
        </div>
      )}

      {/* FAB Button */}
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
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#0A0A0C" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#0A0A0C" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* Inline animation keyframe */}
      <style>{`
        @keyframes floatingChatFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
