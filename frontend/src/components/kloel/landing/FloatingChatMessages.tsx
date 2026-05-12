'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { KloelMushroomVisual } from '@/components/kloel/KloelBrand';
import { UserMessageRow, AssistantMessageRow } from './FloatingChat';
import type { Message } from './FloatingChat';
import type { RefObject } from 'react';

const S = "var(--font-sora), 'Sora', sans-serif";

interface FloatingChatMessagesProps {
  messages: Message[];
  isStreaming: boolean;
  thinkingLabel: string;
  hoveredMessageId: string | null;
  onHoverEnter: (id: string) => void;
  onHoverLeave: (id: string) => void;
  onEdit: (id: string) => void;
  onRetry: (id: string) => Promise<void>;
  onFeedback: (id: string, type: 'positive' | 'negative' | null) => void;
  onRegenerate: (id: string) => Promise<void>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
}

export function FloatingChatMessages({
  messages,
  isStreaming,
  thinkingLabel,
  hoveredMessageId,
  onHoverEnter,
  onHoverLeave,
  onEdit,
  onRetry,
  onFeedback,
  onRegenerate,
  messagesEndRef,
}: FloatingChatMessagesProps) {
  return (
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
          <span style={{ fontFamily: S, fontSize: 16, color: colors.text.muted }}>
            {kloelT(`Digite sua mensagem`)}
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
            onHoverEnter={onHoverEnter}
            onHoverLeave={onHoverLeave}
            onEdit={onEdit}
            onRetry={onRetry}
          />
        ) : (
          <AssistantMessageRow
            key={msg.id}
            msg={msg}
            isStreaming={isStreaming}
            onFeedback={onFeedback}
            onRegenerate={onRegenerate}
          />
        ),
      )}

      {isStreaming && messages[messages.length - 1]?.content === '' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <KloelMushroomVisual
            size={18}
            traceColor={colors.text.silver}
            animated
            spores="animated"
          />
          <span style={{ fontFamily: S, fontSize: 16, color: colors.text.muted }}>
            {thinkingLabel}
          </span>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
