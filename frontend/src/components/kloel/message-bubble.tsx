'use client';

import { KloelMarkdown } from './KloelMarkdown';
import type { Message } from './chat-container';

interface MessageBubbleProps {
  message: Message;
  onQuickAction?: (actionId: string, label: string) => void;
  pendingActionId?: string | null;
}

export function MessageBubble({ message, onQuickAction, pendingActionId }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isToolEvent = message.eventType === 'tool_call' || message.eventType === 'tool_result';
  const quickActions = Array.isArray(message.meta?.quickActions) ? message.meta.quickActions : [];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      {/* Kloel label above AI messages — Ember color */}
      {!isUser && !isToolEvent && (
        <span
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 10,
            fontWeight: 600,
            color: '#E85D30',
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            marginBottom: 4,
          }}
        >
          Kloel
        </span>
      )}

      {/* Tool event label */}
      {isToolEvent && !isUser && (
        <span
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 10,
            fontWeight: 600,
            color: '#6E6E73',
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            marginBottom: 4,
          }}
        >
          {message.eventType === 'tool_call' ? 'TOOL' : 'RESULTADO'}
        </span>
      )}

      {/* Message Bubble */}
      <div
        style={{
          maxWidth: '85%',
          padding: '12px 16px',
          borderRadius: 6,
          background: isUser ? '#E85D30' : '#111113',
          border: isUser ? 'none' : '1px solid #222226',
          color: isUser ? '#0A0A0C' : '#E0DDD8',
          fontSize: 14,
          lineHeight: 1.6,
          fontFamily: "'Sora', sans-serif",
        }}
      >
        {isUser ? (
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{message.content}</p>
        ) : (
          <KloelMarkdown content={message.content} />
        )}

        {/* Quick Actions */}
        {!isUser && quickActions.length > 0 && onQuickAction ? (
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {quickActions.map((action: any) => {
              const actionId = String(action?.id || '');
              const label = String(action?.label || actionId);
              const isPending = pendingActionId === actionId;

              return (
                <button
                  key={actionId}
                  type="button"
                  onClick={() => onQuickAction(actionId, label)}
                  disabled={!!pendingActionId}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: `1px solid ${pendingActionId ? '#19191C' : '#222226'}`,
                    background: pendingActionId ? '#19191C' : '#111113',
                    color: pendingActionId ? '#3A3A3F' : '#6E6E73',
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: "'Sora', sans-serif",
                    cursor: pendingActionId ? 'not-allowed' : 'pointer',
                    transition: 'all 150ms ease',
                  }}
                >
                  {isPending ? 'Executando...' : label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
