'use client';

import { KloelMushroomVisual } from '@/components/kloel/KloelBrand';
import { MessageActionBar } from '@/components/kloel/MessageActionBar';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { tokenStorage } from '@/lib/api/core';
import { apiUrl } from '@/lib/http';
import { parseKloelStreamPayload } from '@/lib/kloel-stream-events';
import { useCallback, useEffect, useRef, useState } from 'react';

interface FloatingChatProps {
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
  initialMessage?: string;
  onInitialMessageConsumed?: () => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  feedback?: 'positive' | 'negative' | null;
  sourceUserId?: string | null;
}

const VISITOR_SESSION_KEY = 'kloel:floating-chat:visitor-session';
const LEGACY_GUEST_SESSION_KEY = 'kloel:floating-chat:guest-session';
const LANDING_CHAT_EVENT = 'kloel:landing-chat-open';

const S = "var(--font-sora), 'Sora', sans-serif";

const THINKING_LABELS = ['Pensando', 'Analisando', 'Raciocinando'];

const USER_BUBBLE_STYLE: React.CSSProperties = {
  background: '#E85D30',
  color: '#0A0A0C',
  borderRadius: 6,
  padding: '10px 14px',
  fontFamily: S,
  fontSize: 14,
  lineHeight: 1.55,
  wordBreak: 'break-word',
};

const ASSISTANT_BUBBLE_STYLE: React.CSSProperties = {
  fontFamily: S,
  fontSize: 14,
  color: '#E0DDD8',
  lineHeight: 1.65,
  wordBreak: 'break-word',
  whiteSpace: 'pre-wrap',
};

function useRotatingLabel(labels: string[], intervalMs = 2500) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % labels.length), intervalMs);
    return () => clearInterval(timer);
  }, [labels.length, intervalMs]);
  return labels[index];
}

function UserMessageRow({
  msg,
  isStreaming,
  hoveredMessageId,
  onHoverEnter,
  onHoverLeave,
  onEdit,
  onRetry,
}: {
  msg: Message;
  isStreaming: boolean;
  hoveredMessageId: string | null;
  onHoverEnter: (id: string) => void;
  onHoverLeave: (id: string) => void;
  onEdit: (id: string) => void;
  onRetry: (id: string) => Promise<void>;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: no native element groups block-level chat bubble + action affordances; role="group" is the correct ARIA mapping
    <div
      role="group"
      style={{ display: 'flex', justifyContent: 'flex-end' }}
      onMouseEnter={() => onHoverEnter(msg.id)}
      onMouseLeave={() => onHoverLeave(msg.id)}
    >
      <div style={{ maxWidth: '82%' }}>
        <div style={USER_BUBBLE_STYLE}>{msg.content}</div>
        <MessageActionBar
          content={msg.content}
          align="right"
          visible={hoveredMessageId === msg.id}
          actions={[
            {
              id: 'edit',
              label: 'Editar',
              icon: 'edit',
              disabled: isStreaming,
              onClick: () => onEdit(msg.id),
            },
            {
              id: 'retry',
              label: 'Reenviar',
              icon: 'retry',
              disabled: isStreaming,
              onClick: async () => {
                await onRetry(msg.id);
              },
            },
          ]}
        />
      </div>
    </div>
  );
}

function AssistantMessageRow({
  msg,
  isStreaming,
  onFeedback,
  onRegenerate,
}: {
  msg: Message;
  isStreaming: boolean;
  onFeedback: (id: string, type: 'positive' | 'negative' | null) => void;
  onRegenerate: (id: string) => Promise<void>;
}) {
  return (
    <div style={{ maxWidth: '92%' }}>
      <div style={ASSISTANT_BUBBLE_STYLE}>{msg.content}</div>
      {!msg.isStreaming && msg.content ? (
        <MessageActionBar
          content={msg.content}
          align="left"
          visible={true}
          actions={[
            {
              id: 'thumbs-up',
              label: 'Gostei',
              icon: 'thumbsUp',
              active: msg.feedback === 'positive',
              disabled: isStreaming,
              onClick: () => onFeedback(msg.id, msg.feedback === 'positive' ? null : 'positive'),
            },
            {
              id: 'thumbs-down',
              label: 'Não Gostei',
              icon: 'thumbsDown',
              active: msg.feedback === 'negative',
              disabled: isStreaming,
              onClick: () => onFeedback(msg.id, msg.feedback === 'negative' ? null : 'negative'),
            },
            {
              id: 'retry',
              label: 'Tentar novamente',
              icon: 'retry',
              disabled: isStreaming,
              onClick: async () => {
                await onRegenerate(msg.id);
              },
            },
          ]}
        />
      ) : null}
    </div>
  );
}

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
  const [visitorSessionId, setVisitorSessionId] = useState<string | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const consumedRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const thinkingLabel = useRotatingLabel(THINKING_LABELS);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const toggle = useCallback(
    (open: boolean) => {
      if (onToggle) onToggle(open);
      else setInternalOpen(open);
    },
    [onToggle],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const sid = localStorage.getItem(VISITOR_SESSION_KEY);
      if (sid) {
        localStorage.removeItem(LEGACY_GUEST_SESSION_KEY);
        setVisitorSessionId(sid);
        return;
      }

      const legacySessionId = localStorage.getItem(LEGACY_GUEST_SESSION_KEY);
      if (legacySessionId) {
        localStorage.setItem(VISITOR_SESSION_KEY, legacySessionId);
        localStorage.removeItem(LEGACY_GUEST_SESSION_KEY);
        setVisitorSessionId(legacySessionId);
        return;
      }

      const generatedSessionId = `visitor_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      localStorage.setItem(VISITOR_SESSION_KEY, generatedSessionId);
      setVisitorSessionId(generatedSessionId);
    } catch {}
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: messages and isStreaming changes are the intentional triggers to auto-scroll; ref is read imperatively
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      toggle(true);
      if (detail?.message) setInput(detail.message);
    };
    window.addEventListener(LANDING_CHAT_EVENT, handler);
    return () => window.removeEventListener(LANDING_CHAT_EVENT, handler);
  }, [toggle]);

  const streamVisitorMessage = useCallback(
    async (text: string, signal: AbortSignal, assistantMessageId: string) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      };
      if (visitorSessionId) headers['X-Session-Id'] = visitorSessionId;

      const res = await fetch(apiUrl('/chat/visitor'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: text, sessionId: visitorSessionId }),
        signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Streaming failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';

      // biome-ignore lint/performance/noAwaitInLoops: sequential processing required
      for (;;) {
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
              setVisitorSessionId(parsed.sessionId);
              try {
                localStorage.setItem(VISITOR_SESSION_KEY, parsed.sessionId);
                localStorage.removeItem(LEGACY_GUEST_SESSION_KEY);
              } catch {}
            }
            const chunk = parsed.content || parsed.chunk || parsed.delta || '';
            if (chunk) {
              full += chunk;
              setMessages((prev) => {
                return prev.map((message) =>
                  message.id === assistantMessageId && message.role === 'assistant'
                    ? { ...message, content: full }
                    : message,
                );
              });
            }
          } catch {}
        }
      }
      return full;
    },
    [visitorSessionId],
  );

  const streamAuthMessage = useCallback(
    async (text: string, signal: AbortSignal, assistantMessageId: string) => {
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

      // biome-ignore lint/performance/noAwaitInLoops: SSE auth-chat stream from /kloel/think — each reader.read() must decode into the shared buffer and split on '\n' before the next read so data: frames stay intact across chunk boundaries
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
                  return prev.map((message) =>
                    message.id === assistantMessageId && message.role === 'assistant'
                      ? { ...message, content: full }
                      : message,
                  );
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
    async (
      rawText: string,
      options?: {
        appendUserMessage?: boolean;
        replaceAssistantId?: string | null;
        sourceUserId?: string | null;
      },
    ) => {
      const text = rawText.trim();
      if (!text || isStreaming) return;
      const appendUserMessage = options?.appendUserMessage !== false;
      const sourceUserId = options?.sourceUserId || `floating_user_${crypto.randomUUID()}`;
      const assistantId =
        options?.replaceAssistantId || `floating_assistant_${crypto.randomUUID()}`;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setMessages((prev) => {
        const next = [...prev];

        if (appendUserMessage) {
          next.push({
            id: sourceUserId,
            role: 'user',
            content: text,
          });
        }

        if (options?.replaceAssistantId) {
          return next.map((message) =>
            message.id === options.replaceAssistantId
              ? {
                  ...message,
                  role: 'assistant',
                  content: '',
                  isStreaming: true,
                  feedback: null,
                  sourceUserId,
                }
              : message,
          );
        }

        next.push({
          id: assistantId,
          role: 'assistant',
          content: '',
          isStreaming: true,
          feedback: null,
          sourceUserId,
        });
        return next;
      });
      setInput('');
      setIsStreaming(true);

      try {
        if (isAuthenticated) {
          await streamAuthMessage(text, controller.signal, assistantId);
        } else {
          await streamVisitorMessage(text, controller.signal, assistantId);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setMessages((prev) => {
          return prev.map((message) =>
            message.id === assistantId && message.role === 'assistant'
              ? {
                  ...message,
                  content: message.content || 'Algo deu errado. Tenta de novo.',
                  isStreaming: false,
                }
              : message,
          );
        });
      } finally {
        setIsStreaming(false);
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId ? { ...message, isStreaming: false } : message,
          ),
        );
      }
    },
    [isStreaming, isAuthenticated, streamAuthMessage, streamVisitorMessage],
  );

  useEffect(() => {
    if (!initialMessage || !isOpen || consumedRef.current === initialMessage) return;
    consumedRef.current = initialMessage;
    onInitialMessageConsumed?.();
    void sendMessage(initialMessage);
  }, [initialMessage, isOpen, onInitialMessageConsumed, sendMessage]);

  const handleUserEdit = useCallback(
    (messageId: string) => {
      const targetMessage = messages.find(
        (message) => message.id === messageId && message.role === 'user',
      );
      if (!targetMessage) return;

      setInput(targetMessage.content);
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    [messages],
  );

  const handleUserRetry = useCallback(
    async (messageId: string) => {
      const targetMessage = messages.find(
        (message) => message.id === messageId && message.role === 'user',
      );
      if (!targetMessage) return;

      await sendMessage(targetMessage.content);
    },
    [messages, sendMessage],
  );

  const handleAssistantFeedback = useCallback(
    (messageId: string, type: 'positive' | 'negative' | null) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId
            ? {
                ...message,
                feedback: type,
              }
            : message,
        ),
      );
    },
    [],
  );

  const handleAssistantRegenerate = useCallback(
    async (messageId: string) => {
      const assistantIndex = messages.findIndex(
        (message) => message.id === messageId && message.role === 'assistant',
      );
      if (assistantIndex === -1) return;

      const assistantMessage = messages[assistantIndex];
      const sourceUser =
        messages.find(
          (message) => message.id === assistantMessage.sourceUserId && message.role === 'user',
        ) ||
        [...messages.slice(0, assistantIndex)].reverse().find((message) => message.role === 'user');

      if (!sourceUser) return;

      await sendMessage(sourceUser.content, {
        appendUserMessage: false,
        replaceAssistantId: messageId,
        sourceUserId: sourceUser.id,
      });
    },
    [messages, sendMessage],
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
          {/* Header — close only */}
          <div
            style={{
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              padding: '0 8px',
              flexShrink: 0,
            }}
          >
            <button
              type="button"
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
                aria-hidden="true"
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
              padding: '4px 14px 16px',
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
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.3,
                }}
              >
                <span style={{ fontFamily: S, fontSize: 12, color: '#6E6E73' }}>
                  Digite sua mensagem
                </span>
              </div>
            )}

            {messages.map((msg) =>
              msg.role === 'user' ? (
                <UserMessageRow
                  key={msg.id}
                  msg={msg}
                  isStreaming={isStreaming}
                  hoveredMessageId={hoveredMessageId}
                  onHoverEnter={setHoveredMessageId}
                  onHoverLeave={(id) =>
                    setHoveredMessageId((current) => (current === id ? null : current))
                  }
                  onEdit={handleUserEdit}
                  onRetry={handleUserRetry}
                />
              ) : (
                <AssistantMessageRow
                  key={msg.id}
                  msg={msg}
                  isStreaming={isStreaming}
                  onFeedback={handleAssistantFeedback}
                  onRegenerate={handleAssistantRegenerate}
                />
              ),
            )}

            {isStreaming && messages[messages.length - 1]?.content === '' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <KloelMushroomVisual size={18} traceColor="#FFFFFF" animated spores="animated" />
                <span style={{ fontFamily: S, fontSize: 12, color: '#6E6E73' }}>
                  {thinkingLabel}
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
                type="button"
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
                  aria-hidden="true"
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
          </div>
        </div>
      )}

      {/* Floating button — chat bubble SVG */}
      <button
        type="button"
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
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg
            width={22}
            height={22}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0A0A0C"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
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
