'use client';

import { kloelT } from '@/lib/i18n/t';
import {
  getAssistantProcessingTrace,
  getAssistantResponseVersions,
  summarizeAssistantProcessingTrace,
} from '@/lib/kloel-message-ui';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { AssistantProcessingTraceCard, AssistantVersionNavigator } from './AssistantResponseChrome';
import { KloelMarkdown } from './KloelMarkdown';
import { MessageActionBar } from './MessageActionBar';
import type { Message } from './chat-container';

const FONT_FAMILY = "'Sora', sans-serif";
const CHAT_THEME = {
  borderColor: KLOEL_THEME.borderPrimary,
  surfaceColor: KLOEL_THEME.bgCard,
  nestedSurfaceColor: KLOEL_THEME.bgPrimary,
  nestedBorderColor: KLOEL_THEME.borderSubtle,
  textColor: KLOEL_THEME.textPrimary,
  mutedColor: KLOEL_THEME.textSecondary,
  subtleTextColor: KLOEL_THEME.textTertiary,
  iconTraceColor: KLOEL_THEME.textPrimary,
} as const;

interface MessageBubbleProps {
  message: Message;
  onQuickAction?: (actionId: string, label: string) => void;
  pendingActionId?: string | null;
  isBusy?: boolean;
  showSlowHint?: boolean;
  onCancelProcessing?: () => void;
  onMessageEdit?: (messageId: string, nextContent: string) => Promise<void>;
  onMessageRetry?: (messageId: string) => Promise<void>;
  onAssistantFeedback?: (messageId: string, type: 'positive' | 'negative' | null) => Promise<void>;
  onAssistantRegenerate?: (messageId: string) => Promise<void>;
}

/** Message bubble. */
export function MessageBubble({
  message,
  onQuickAction,
  pendingActionId,
  isBusy = false,
  showSlowHint = false,
  onCancelProcessing,
  onMessageEdit,
  onMessageRetry,
  onAssistantFeedback,
  onAssistantRegenerate,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isToolEvent = message.eventType === 'tool_call' || message.eventType === 'tool_result';
  const quickActions = Array.isArray(message.meta?.quickActions) ? message.meta.quickActions : [];
  const feedbackObj = message.meta?.feedback as { type?: string } | undefined;
  const feedbackType =
    feedbackObj?.type === 'positive' || feedbackObj?.type === 'negative'
      ? (feedbackObj.type as 'positive' | 'negative')
      : null;
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(message.content);
  const assistantVersions = useMemo(
    () => getAssistantResponseVersions(message.meta, message.content, message.id),
    [message.content, message.id, message.meta],
  );
  const processingTrace = useMemo(() => getAssistantProcessingTrace(message.meta), [message.meta]);
  const processingSummary = useMemo(
    () =>
      summarizeAssistantProcessingTrace(
        processingTrace,
        typeof message.meta?.processingSummary === 'string'
          ? message.meta.processingSummary
          : undefined,
      ),
    [message.meta, processingTrace],
  );
  const latestVersionId = assistantVersions[assistantVersions.length - 1]?.id || message.id;
  const [activeVersionIndex, setActiveVersionIndex] = useState(
    Math.max(assistantVersions.length - 1, 0),
  );

  useEffect(() => {
    if (!isEditing) {
      setDraftContent(message.content);
    }
  }, [isEditing, message.content]);

  useEffect(() => {
    setActiveVersionIndex(Math.max(assistantVersions.length - 1, 0));
  }, [assistantVersions.length, latestVersionId, message.id]);

  const visibleAssistantContent =
    assistantVersions[Math.min(activeVersionIndex, Math.max(assistantVersions.length - 1, 0))]
      ?.content || message.content;
  const hasVisibleAssistantContent = !!visibleAssistantContent.trim();
  const isAssistantProcessing = Boolean(message.isStreaming && !hasVisibleAssistantContent);
  const shouldShowTrace =
    !isUser && !isToolEvent && (processingTrace.length > 0 || isAssistantProcessing);

  return (
    <section
      aria-label={isUser ? 'Mensagem do usuario' : 'Mensagem da Kloel'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {!isUser && !isToolEvent ? (
        <span
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 10,
            fontWeight: 600,
            color: KLOEL_THEME.accent,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          
          {kloelT(`Kloel`)}
        </span>
      ) : null}

      {isToolEvent && !isUser ? (
        <span
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 10,
            fontWeight: 600,
            color: KLOEL_THEME.textSecondary,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          {message.eventType === 'tool_call' ? 'Tool' : 'Resultado'}
        </span>
      ) : null}

      <div style={{ maxWidth: '85%' }}>
        {isEditing ? (
          <div
            style={{
              padding: 12,
              borderRadius: 6,
              background: KLOEL_THEME.bgCard,
              border: `1px solid ${KLOEL_THEME.borderPrimary}`,
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
                border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                background: KLOEL_THEME.bgPrimary,
                color: KLOEL_THEME.textPrimary,
                fontSize: 14,
                lineHeight: 1.6,
                fontFamily: FONT_FAMILY,
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
                style={secondaryButtonStyle()}
              >
                
                {kloelT(`Cancelar`)}
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
                style={primaryButtonStyle(
                  !(
                    isBusy ||
                    !draftContent.trim() ||
                    draftContent.trim() === message.content.trim() ||
                    !onMessageEdit
                  ),
                )}
              >
                
                {kloelT(`Salvar`)}
              </button>
            </div>
          </div>
        ) : (
          <>
            {shouldShowTrace ? (
              <AssistantProcessingTraceCard
                entries={processingTrace}
                summary={processingSummary}
                isProcessing={isAssistantProcessing}
                showSlowHint={showSlowHint}
                onCancel={onCancelProcessing}
                theme={CHAT_THEME}
              />
            ) : null}

            {!isUser && !isToolEvent ? (
              <AssistantVersionNavigator
                total={assistantVersions.length}
                activeIndex={Math.min(
                  activeVersionIndex,
                  Math.max(assistantVersions.length - 1, 0),
                )}
                onChange={setActiveVersionIndex}
                theme={CHAT_THEME}
                marginTop={0}
                marginBottom={8}
              />
            ) : null}

            <div
              style={{
                padding: '12px 16px',
                borderRadius: 6,
                background: isUser ? KLOEL_THEME.accent : KLOEL_THEME.bgCard,
                border: isUser ? 'none' : `1px solid ${KLOEL_THEME.borderPrimary}`,
                color: isUser ? KLOEL_THEME.textOnAccent : KLOEL_THEME.textPrimary,
                fontSize: 14,
                lineHeight: 1.6,
                fontFamily: FONT_FAMILY,
              }}
            >
              {isUser ? (
                <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{message.content}</p>
              ) : isAssistantProcessing ? (
                <span style={{ color: KLOEL_THEME.textSecondary, fontSize: 13 }}>
                  
                  {kloelT(`Processando resposta...`)}
                </span>
              ) : (
                <KloelMarkdown content={visibleAssistantContent} />
              )}

              {!isUser && quickActions.length > 0 && onQuickAction ? (
                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {quickActions.map((action: unknown) => {
                    const actionObj = (action ?? {}) as { id?: unknown; label?: unknown };
                    const actionId = String(actionObj.id || '');
                    const label = String(actionObj.label || actionId);
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
                          border: `1px solid ${
                            pendingActionId ? KLOEL_THEME.borderSubtle : KLOEL_THEME.borderPrimary
                          }`,
                          background: pendingActionId ? KLOEL_THEME.bgTertiary : KLOEL_THEME.bgCard,
                          color: pendingActionId
                            ? KLOEL_THEME.textTertiary
                            : KLOEL_THEME.textSecondary,
                          fontSize: 13,
                          fontWeight: 500,
                          fontFamily: FONT_FAMILY,
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

            {!isToolEvent && (isUser || hasVisibleAssistantContent) ? (
              <MessageActionBar
                content={isUser ? message.content : visibleAssistantContent}
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
                          disabled: isBusy || message.isStreaming || !onAssistantRegenerate,
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
    </section>
  );
}

function secondaryButtonStyle() {
  return {
    padding: '8px 12px',
    borderRadius: 6,
    border: `1px solid ${KLOEL_THEME.borderPrimary}`,
    background: 'transparent',
    color: KLOEL_THEME.textSecondary,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: FONT_FAMILY,
    cursor: 'pointer',
  } satisfies CSSProperties;
}

function primaryButtonStyle(enabled: boolean) {
  return {
    padding: '8px 12px',
    borderRadius: 6,
    border: 'none',
    background: KLOEL_THEME.accent,
    color: KLOEL_THEME.textOnAccent,
    fontSize: 13,
    fontWeight: 700,
    fontFamily: FONT_FAMILY,
    cursor: enabled ? 'pointer' : 'default',
    opacity: enabled ? 1 : 0.45,
  } satisfies CSSProperties;
}
