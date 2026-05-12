'use client';

import { MessageActionBar } from '@/components/kloel/MessageActionBar';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { tokenStorage } from '@/lib/api/core';
import { apiUrl } from '@/lib/http';
import { parseKloelStreamPayload } from '@/lib/kloel-stream-events';
import { useCallback, useEffect, useRef, useState } from 'react';
import { colors } from '@/lib/design-tokens';
import {
  appendAssistantContent,
  buildPreparedMessages,
  markAssistantEnded,
  markAssistantError,
  parseGuestSseLine,
  persistGuestSession,
  pickGuestChunk,
} from './FloatingChat.helpers';
import { FloatingChatHeader } from './FloatingChatHeader';
import { FloatingChatInput } from './FloatingChatInput';
import { FloatingChatMessages } from './FloatingChatMessages';
import { FloatingChatButton } from './FloatingChatButton';

interface FloatingChatProps {
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
  initialMessage?: string;
  onInitialMessageConsumed?: () => void;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  feedback?: 'positive' | 'negative' | null;
  sourceUserId?: string | null;
}

const GUEST_SESSION_SLOT = 'kloel:floating-chat:guest-session';
const LANDING_CHAT_EVENT = 'kloel:landing-chat-open';

const S = "var(--font-sora), 'Sora', sans-serif";

const THINKING_LABELS = ['Pensando', 'Analisando', 'Raciocinando'];

const USER_BUBBLE_STYLE: React.CSSProperties = {
  background: colors.ember.primary,
  color: colors.background.void,
  borderRadius: 6,
  padding: '10px 14px',
  fontFamily: S,
  fontSize: 16,
  lineHeight: 1.55,
  wordBreak: 'break-word',
};

const ASSISTANT_BUBBLE_STYLE: React.CSSProperties = {
  fontFamily: S,
  fontSize: 16,
  color: colors.text.silver,
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

export function UserMessageRow({
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
    <section
      aria-label="Mensagem enviada"
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
    </section>
  );
}

export function AssistantMessageRow({
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
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const consumedRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const thinkingLabel = useRotatingLabel(THINKING_LABELS);

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const sid = localStorage.getItem(GUEST_SESSION_SLOT);
      if (sid) {
        setGuestSessionId(sid);
      }
    } catch {}
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  useEffect(() => {
    if (isOpen) {
      const focusTimer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(focusTimer);
    }
    return undefined;
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      toggle(true);
      if (detail?.message) {
        setInput(detail.message);
      }
    };
    window.addEventListener(LANDING_CHAT_EVENT, handler);
    return () => window.removeEventListener(LANDING_CHAT_EVENT, handler);
  }, [toggle]);

  const streamGuestMessage = useCallback(
    async (text: string, signal: AbortSignal, assistantMessageId: string) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      };
      if (guestSessionId) {
        headers['X-Session-Id'] = guestSessionId;
      }

      const res = await fetch(apiUrl('/chat/guest'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: text, sessionId: guestSessionId }),
        signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Streaming failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';

      const readGuestStream = async (): Promise<void> => {
        const { done, value } = await reader.read();
        if (done) {
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const payload = parseGuestSseLine(line);
          if (!payload) {
            continue;
          }
          if (payload.sessionId) {
            setGuestSessionId(payload.sessionId);
            persistGuestSession(GUEST_SESSION_SLOT, payload.sessionId);
          }
          const chunk = pickGuestChunk(payload);
          if (chunk) {
            full += chunk;
            setMessages((prev) => appendAssistantContent(prev, assistantMessageId, full));
          }
        }
        await readGuestStream();
      };

      await readGuestStream();
      return full;
    },
    [guestSessionId],
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

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';

      const processAuthLine = (line: string) => {
        if (!line.startsWith('data: ')) {
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(line.slice(6));
        } catch {
          return;
        }
        const events = parseKloelStreamPayload(parsed);
        for (const event of events) {
          if (event.type === 'thread' && 'conversationId' in event && event.conversationId) {
            setConversationId(event.conversationId as string);
          }
          if (event.type === 'content' && 'text' in event && event.text) {
            full += event.text as string;
            setMessages((prev) => appendAssistantContent(prev, assistantMessageId, full));
          }
        }
      };

      const readAuthStream = async (): Promise<void> => {
        const { done, value } = await reader.read();
        if (done) {
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          processAuthLine(line);
        }
        await readAuthStream();
      };

      await readAuthStream();
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
      if (!text || isStreaming) {
        return;
      }
      const appendUserMessage = options?.appendUserMessage !== false;
      const sourceUserId = options?.sourceUserId || `floating_user_${crypto.randomUUID()}`;
      const assistantId =
        options?.replaceAssistantId || `floating_assistant_${crypto.randomUUID()}`;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const preparedPayload = {
        text,
        assistantId,
        sourceUserId,
        replaceAssistantId: options?.replaceAssistantId ?? null,
        appendUserMessage,
      };
      setMessages((prev) => buildPreparedMessages(prev, preparedPayload));
      setInput('');
      setIsStreaming(true);

      try {
        if (isAuthenticated) {
          await streamAuthMessage(text, controller.signal, assistantId);
        } else {
          await streamGuestMessage(text, controller.signal, assistantId);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        setMessages((prev) =>
          markAssistantError(prev, assistantId, 'Algo deu errado. Tenta de novo.'),
        );
      } finally {
        setIsStreaming(false);
        setMessages((prev) => markAssistantEnded(prev, assistantId));
      }
    },
    [isStreaming, isAuthenticated, streamAuthMessage, streamGuestMessage],
  );

  useEffect(() => {
    if (!initialMessage || !isOpen || consumedRef.current === initialMessage) {
      return;
    }
    consumedRef.current = initialMessage;
    onInitialMessageConsumed?.();
    void sendMessage(initialMessage);
  }, [initialMessage, isOpen, onInitialMessageConsumed, sendMessage]);

  const handleUserEdit = useCallback(
    (messageId: string) => {
      const targetMessage = messages.find(
        (message) => message.id === messageId && message.role === 'user',
      );
      if (!targetMessage) {
        return;
      }

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
      if (!targetMessage) {
        return;
      }

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
      if (assistantIndex === -1) {
        return;
      }

      const assistantMessage = messages[assistantIndex];
      const sourceUser =
        messages.find(
          (message) => message.id === assistantMessage.sourceUserId && message.role === 'user',
        ) ||
        [...messages.slice(0, assistantIndex)].reverse().find((message) => message.role === 'user');

      if (!sourceUser) {
        return;
      }

      await sendMessage(sourceUser.content, {
        appendUserMessage: false,
        replaceAssistantId: messageId,
        sourceUserId: sourceUser.id,
      });
    },
    [messages, sendMessage],
  );

  const handleSubmit = () => {
    if (input.trim()) {
      void sendMessage(input);
    }
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
            background: colors.background.void,
            border: `1px solid ${colors.border.space}`,
            borderRadius: 12,
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 9999,
            animation: 'floatingChatFadeIn 150ms ease',
            overflow: 'hidden',
          }}
        >
          <FloatingChatHeader onClose={() => toggle(false)} />
          <FloatingChatMessages
            messages={messages}
            isStreaming={isStreaming}
            thinkingLabel={thinkingLabel}
            hoveredMessageId={hoveredMessageId}
            onHoverEnter={setHoveredMessageId}
            onHoverLeave={(id) =>
              setHoveredMessageId((current) => (current === id ? null : current))
            }
            onEdit={handleUserEdit}
            onRetry={handleUserRetry}
            onFeedback={handleAssistantFeedback}
            onRegenerate={handleAssistantRegenerate}
            messagesEndRef={messagesEndRef}
          />
          <FloatingChatInput
            inputRef={inputRef}
            input={input}
            onInputChange={(e) => setInput(e.target.value)}
            onSubmit={handleSubmit}
            isStreaming={isStreaming}
          />
        </div>
      )}

      <FloatingChatButton isOpen={isOpen} onToggle={() => toggle(!isOpen)} />

      <style>{`
        @keyframes floatingChatFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
