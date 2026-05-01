'use client';

import { kloelT } from '@/lib/i18n/t';
import { KloelMushroomVisual } from '@/components/kloel/KloelBrand';
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

const GUEST_SESSION_SLOT = 'kloel:floating-chat:guest-session';
const LANDING_CHAT_EVENT = 'kloel:landing-chat-open';

const S = "var(--font-sora), 'Sora', sans-serif";

const THINKING_LABELS = ['Pensando', 'Analisando', 'Raciocinando'];

const USER_BUBBLE_STYLE: React.CSSProperties = {
  background: 'colors.ember.primary',
  color: 'colors.background.void',
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
  color: 'colors.text.silver',
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

/** Floating chat. */
import { FloatingChat } from "./FloatingChat";
