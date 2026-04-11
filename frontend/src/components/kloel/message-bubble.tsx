'use client';

import { useEffect, useState } from 'react';
import { MessageActionBar } from './MessageActionBar';
import { KloelMarkdown } from './KloelMarkdown';
import type { Message } from './chat-container';

interface MessageBubbleProps {
  message: Message;
  onQuickAction?: (actionId: string, label: string) => void;
  pendingActionId?: string | null;
  isBusy?: boolean;
  onMessageEdit?: (messageId: string, nextContent: string) => Promise<void>;
  onMessageRetry?: (messageId: string) => Promise<void>;
  onAssistantFeedback?: (messageId: string, type: 'positive' | 'negative' | null) => Promise<void>;
  onAssistantRegenerate?: (messageId: string) => Promise<void>;
}

export function MessageBubble({
  message,
  onQuickAction,
  pendingActionId,
  isBusy = false,
  onMessageEdit,
  onMessageRetry,
  onAssistantFeedback,
  onAssistantRegenerate,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isToolEvent = message.eventType === 'tool_call' || message.eventType === 'tool_result';
  const quickActions = Array.isArray(message.meta?.quickActions) ? message.meta.quickActions : [];
  const feedbackType =
    message.meta?.feedback?.type === 'positive' || message.meta?.feedback?.type === 'negative'
      ? (message.meta.feedback.type as 'positive' | 'negative')
      : null;
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(message.content);

  useEffect(() => {
    if (!isEditing) {
      setDraftContent(message.content);
    }
  }, [isEditing, message.content]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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
            color: 'var(--app-text-secondary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            marginBottom: 4,
          }}
        >
          {message.eventType === 'tool_call' ? 'TOOL' : 'RESULTADO'}
        </span>
      )}

      {/* Message Bubble */}
      <div style={{ maxWidth: '85%' }}>
        {isEditing ? (
          <div
            style={{
              padding: 12,
              borderRadius: 6,
              background: '#111113',
              border: '1px solid #222226',
            }}
          >
            <textarea
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
              rows={Math.max(3, Math.min(8, draftContent.split('\n').length + 1))}
              style={{
                width: '100%',
                minHeight: 84,
                resize: 'vertical',
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid #222226',
                background: '#0A0A0C',
                color: '#FFFFFF',
                fontSize: 14,
                lineHeight: 1.6,
                fontFamily: "'Sora', sans-serif",
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => {
                  setDraftContent(message.content);
                  setIsEditing(false);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #222226',
                  background: 'transparent',
                  color: '#8A8A8E',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "'Sora', sans-serif",
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  isBusy ||
                  !draftContent.trim() ||
                  draftContent.trim() === message.content.trim() ||
                  !onMessageEdit
                }
                onClick={async () => {
                  await onMessageEdit?.(message.id, draftContent.trim());
                  setIsEditing(false);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#E85D30',
                  color: '#0A0A0C',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "'Sora', sans-serif",
                  cursor:
                    isBusy ||
                    !draftContent.trim() ||
                    draftContent.trim() === message.content.trim() ||
                    !onMessageEdit
                      ? 'default'
                      : 'pointer',
                  opacity:
                    isBusy ||
                    !draftContent.trim() ||
                    draftContent.trim() === message.content.trim() ||
                    !onMessageEdit
                      ? 0.45
                      : 1,
                }}
              >
                Salvar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
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

            {!isToolEvent ? (
              <MessageActionBar
                content={message.content}
                align={isUser ? 'right' : 'left'}
                visible={isUser ? isHovered : true}
                actions={
                  isUser
                    ? [
                        {
                          id: 'edit',
                          label: 'Editar',
                          icon: 'edit',
                          disabled: isBusy || !onMessageEdit,
                          onClick: () => setIsEditing(true),
                        },
                        {
                          id: 'retry',
                          label: 'Reenviar',
                          icon: 'retry',
                          disabled: isBusy || !onMessageRetry,
                          onClick: async () => {
                            await onMessageRetry?.(message.id);
                          },
                        },
                      ]
                    : [
                        {
                          id: 'thumbs-up',
                          label: 'Gostei',
                          icon: 'thumbsUp',
                          active: feedbackType === 'positive',
                          disabled: isBusy || !onAssistantFeedback,
                          onClick: async () => {
                            await onAssistantFeedback?.(
                              message.id,
                              feedbackType === 'positive' ? null : 'positive',
                            );
                          },
                        },
                        {
                          id: 'thumbs-down',
                          label: 'Não Gostei',
                          icon: 'thumbsDown',
                          active: feedbackType === 'negative',
                          disabled: isBusy || !onAssistantFeedback,
                          onClick: async () => {
                            await onAssistantFeedback?.(
                              message.id,
                              feedbackType === 'negative' ? null : 'negative',
                            );
                          },
                        },
                        {
                          id: 'retry',
                          label: 'Tentar novamente',
                          icon: 'retry',
                          disabled: isBusy || !onAssistantRegenerate,
                          onClick: async () => {
                            await onAssistantRegenerate?.(message.id);
                          },
                        },
                      ]
                }
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
