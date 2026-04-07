'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { apiUrl } from '@/lib/http';
import { KloelMushroomVisual } from '@/components/kloel/KloelBrand';
import { parseKloelStreamPayload } from '@/lib/kloel-stream-events';
import { tokenStorage } from '@/lib/api/core';

interface FloatingChatProps {
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
  initialMessage?: string;
  onInitialMessageConsumed?: () => void;
}

interface Message {
  role: 'user' | 'ai';
  content: string;
  isStreaming?: boolean;
}

const GUEST_SESSION_KEY = 'kloel:floating-chat:guest-session';
const LANDING_CHAT_EVENT = 'kloel:landing-chat-open';

const S = "var(--font-sora), 'Sora', sans-serif";

export function FloatingChat({
  isOpen: controlledOpen,
  onToggle,
  initialMessage,
  onInitialMessageConsumed,
}: FloatingChatProps) {
  const { isAuthenticated } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const consumedRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const toggle = useCallback(
    (open: boolean) => {
      if (onToggle) onToggle(open);
      else setInternalOpen(open);
    },
    [onToggle],
  );

  // Restore guest session
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const sid = localStorage.getItem(GUEST_SESSION_KEY);
      if (sid) setGuestSessionId(sid);
    } catch {}
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  // Listen for landing page CTA events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      toggle(true);
      if (detail?.message) setInput(detail.message);
    };
    window.addEventListener(LANDING_CHAT_EVENT, handler);
    return () => window.removeEventListener(LANDING_CHAT_EVENT, handler);
  }, [toggle]);

  // Handle initial message from parent
  useEffect(() => {
    if (!initialMessage || !isOpen || consumedRef.current === initialMessage) return;
    consumedRef.current = initialMessage;
    onInitialMessageConsumed?.();
    void sendMessage(initialMessage);
  }, [initialMessage, isOpen]);

  const streamGuestMessage = useCallback(
    async (text: string, signal: AbortSignal) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      };
      if (guestSessionId) headers['X-Session-Id'] = guestSessionId;

      const res = await fetch(apiUrl('/chat/guest'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: text, sessionId: guestSessionId }),
        signal,
      });

      if (!res.ok || !res.body) {
        // Fallback to sync
        const syncRes = await fetch(apiUrl('/chat/guest/sync'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(guestSessionId ? { 'X-Session-Id': guestSessionId } : {}),
          },
          body: JSON.stringify({ message: text, sessionId: guestSessionId }),
          signal,
        });
        const data = await syncRes.json();
        if (data.sessionId) {
          setGuestSessionId(data.sessionId);
          try {
            localStorage.setItem(GUEST_SESSION_KEY, data.sessionId);
          } catch {}
        }
        return data.response || data.reply || data.message || data.content || '';
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.sessionId) {
              setGuestSessionId(parsed.sessionId);
              try {
                localStorage.setItem(GUEST_SESSION_KEY, parsed.sessionId);
              } catch {}
            }
            const chunk = parsed.content || parsed.chunk || parsed.delta || '';
            if (chunk) {
              full += chunk;
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'ai' && last.isStreaming) {
                  next[next.length - 1] = { ...last, content: full };
                }
                return next;
              });
            }
          } catch {}
        }
      }
      return full;
    },
    [guestSessionId],
  );

  const streamAuthMessage = useCallback(
    async (text: string, signal: AbortSignal) => {
      const res = await fetch(apiUrl('/kloel/think'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${tokenStorage.getToken() || ''}`,
          'x-workspace-id': tokenStorage.getWorkspaceId() || '',
        },
        body: JSON.stringify({
          message: text,
          conversationId: conversationId || undefined,
          mode: 'chat',
          metadata: { source: 'landing' },
        }),
        signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            const events = parseKloelStreamPayload(parsed);
            for (const event of events) {
              if (event.type === 'thread' && 'conversationId' in event && event.conversationId) {
                setConversationId(event.conversationId as string);
              }
              if (event.type === 'content' && 'text' in event && event.text) {
                full += event.text as string;
                setMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === 'ai' && last.isStreaming) {
                    next[next.length - 1] = { ...last, content: full };
                  }
                  return next;
                });
              }
            }
          } catch {}
        }
      }
      return full;
    },
    [conversationId],
  );

  const sendMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || isStreaming) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setMessages((prev) => [
        ...prev,
        { role: 'user', content: text },
        { role: 'ai', content: '', isStreaming: true },
      ]);
      setInput('');
      setIsStreaming(true);

      try {
        if (isAuthenticated) {
          await streamAuthMessage(text, controller.signal);
        } else {
          await streamGuestMessage(text, controller.signal);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'ai' && last.isStreaming) {
            next[next.length - 1] = {
              ...last,
              content: last.content || 'Algo deu errado. Tenta de novo.',
              isStreaming: false,
            };
          }
          return next;
        });
      } finally {
        setIsStreaming(false);
        setMessages((prev) => prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)));
      }
    },
    [isStreaming, isAuthenticated, streamAuthMessage, streamGuestMessage],
  );

  const handleSubmit = () => {
    if (input.trim()) void sendMessage(input);
  };

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
          {/* Header — just close button */}
          <div
            style={{
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              padding: '0 10px',
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => toggle(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#3A3A3F',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <svg
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
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
              padding: '16px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {messages.length === 0 && !isStreaming && (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  opacity: 0.5,
                }}
              >
                <span style={{ fontFamily: S, fontSize: 12, color: '#6E6E73' }}>
                  Digite sua mensagem
                </span>
              </div>
            )}

            {messages.map((msg, i) =>
              msg.role === 'user' ? (
                <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div
                    style={{
                      background: '#E85D30',
                      color: '#0A0A0C',
                      borderRadius: 6,
                      padding: '10px 14px',
                      maxWidth: '82%',
                      fontFamily: S,
                      fontSize: 14,
                      lineHeight: 1.55,
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ) : (
                <div
                  key={i}
                  style={{
                    fontFamily: S,
                    fontSize: 14,
                    color: '#E0DDD8',
                    lineHeight: 1.65,
                    wordBreak: 'break-word',
                    maxWidth: '92%',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {msg.content}
                  {msg.isStreaming && msg.content && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        background: '#E85D30',
                        marginLeft: 4,
                        opacity: 0.6,
                        verticalAlign: 'middle',
                      }}
                    />
                  )}
                </div>
              ),
            )}

            {isStreaming && messages[messages.length - 1]?.content === '' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <KloelMushroomVisual size={20} traceColor="#FFFFFF" animated spores="animated" />
                <span style={{ fontFamily: S, fontSize: 12, color: '#6E6E73' }}>
                  kloel esta pensando
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: 12, borderTop: '1px solid #19191C', flexShrink: 0 }}>
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
                  fontFamily: S,
                }}
              />
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || isStreaming}
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
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating button */}
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
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <KloelMushroomVisual size={22} traceColor="#0A0A0C" animated={false} spores="none" />
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
