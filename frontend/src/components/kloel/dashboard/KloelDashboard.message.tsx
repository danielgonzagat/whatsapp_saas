'use client';

import { kloelT } from '@/lib/i18n/t';
import { AssistantVersionNavigator } from '@/components/kloel/AssistantResponseChrome';
import { ReasoningTimeline } from './ReasoningTimeline';
import { KloelMarkdown } from '@/components/kloel/KloelMarkdown';
import { MessageActionBar } from '@/components/kloel/MessageActionBar';
import {
  clampVersionIndex,
  formatBrlCents,
  pickAssistantFeedbackType,
  pickContactDisplayName,
  type JsonRecord,
} from './KloelDashboard.helpers';
import {
  buildRevenueSummaryRows,
  canSubmitUserEdit,
  computeEditTextareaRows,
  getBrainIntent,
  getBrainResult,
  hasBrainFallback,
  hasBrainOperator,
  isConversationStatusClosed,
  mapContactRow,
  mapConversationRow,
  mapProductRow,
  readSendMessageInfo,
  resolveVisibleAssistantText,
  shouldShowAssistantActions,
  shouldShowThinkingPlaceholder,
  toRecordArray,
} from './KloelDashboard.message.helpers';
import {
  getAssistantReasoning,
  getAssistantProcessingTrace,
  getAssistantResponseVersions,
  summarizeAssistantProcessingTrace,
} from '@/lib/kloel-message-ui';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { EMBER, F, MUTED, TEXT, SURFACE, DIVIDER, V } from './KloelDashboard.subcomponents';
import { AssistantAssetBlock } from './KloelDashboard.assistant';
import { useEffect, useMemo, useState } from 'react';

export type DashboardMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  metadata?: JsonRecord | null;
};

function BrainOperatorResult({ metadata }: { metadata: JsonRecord }) {
  const intent = getBrainIntent(metadata);
  const result = getBrainResult(metadata);

  if (!result) {
    return null;
  }

  const data = result.data;

  if (intent === 'list_products') {
    const products = toRecordArray(data);
    if (products.length === 0) {
      return <p style={{ color: MUTED, fontSize: 14 }}>Nenhum produto encontrado no workspace.</p>;
    }
    return (
      <div style={{ marginTop: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: F }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${DIVIDER}`, textAlign: 'left' }}>
              <th style={{ padding: '8px 10px', color: MUTED, fontWeight: 600 }}>Nome</th>
              <th style={{ padding: '8px 10px', color: MUTED, fontWeight: 600 }}>Preco</th>
              <th style={{ padding: '8px 10px', color: MUTED, fontWeight: 600 }}>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => {
              const row = mapProductRow(p);
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${DIVIDER}` }}>
                  <td style={{ padding: '8px 10px', color: TEXT }}>{row.name}</td>
                  <td style={{ padding: '8px 10px', color: TEXT }}>{formatBrlCents(row.price)}</td>
                  <td style={{ padding: '8px 10px', color: row.active ? EMBER : MUTED }}>
                    {row.active ? 'Sim' : 'Nao'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (intent === 'search_contact') {
    const contacts = toRecordArray(data);
    if (contacts.length === 0) {
      return <p style={{ color: MUTED, fontSize: 14 }}>Nenhum contato encontrado.</p>;
    }
    return (
      <div style={{ marginTop: 12 }}>
        {contacts.map((c, i) => {
          const row = mapContactRow(c);
          return (
            <div
              key={i}
              style={{
                padding: '10px 14px',
                borderBottom: `1px solid ${DIVIDER}`,
                fontSize: 14,
                color: TEXT,
              }}
            >
              <strong>{row.name}</strong>
              <span style={{ color: MUTED, marginLeft: 8 }}>{row.phone}</span>
              {row.email ? (
                <span style={{ color: MUTED, marginLeft: 8 }}>{row.email}</span>
              ) : null}
              {row.leadScore ? (
                <span style={{ marginLeft: 8, color: EMBER, fontSize: 12 }}>
                  Score: {row.leadScore}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  if (intent === 'list_conversations') {
    const conversations = toRecordArray(data);
    if (conversations.length === 0) {
      return <p style={{ color: MUTED, fontSize: 14 }}>Nenhuma conversa recente.</p>;
    }
    return (
      <div style={{ marginTop: 12 }}>
        {conversations.map((conv, i) => {
          const row = mapConversationRow(conv);
          return (
            <div
              key={i}
              style={{
                padding: '10px 14px',
                borderBottom: `1px solid ${DIVIDER}`,
                fontSize: 14,
                color: TEXT,
              }}
            >
              <strong>{pickContactDisplayName(row.contact)}</strong>
              <span style={{ color: MUTED, marginLeft: 8, fontSize: 13 }}>
                {row.preview}
              </span>
              <span
                style={{
                  marginLeft: 8,
                  color: isConversationStatusClosed(row.status) ? MUTED : EMBER,
                  fontSize: 12,
                }}
              >
                {row.status}
              </span>
              {row.agentName ? (
                <span style={{ marginLeft: 8, color: MUTED, fontSize: 12 }}>
                  {row.agentName}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  if (intent === 'query_revenue_summary') {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return <p style={{ color: MUTED, fontSize: 14 }}>Dados de receita indisponiveis.</p>;
    }
    const rows = buildRevenueSummaryRows(data as JsonRecord, formatBrlCents);
    const lastIndex = rows.length - 1;
    return (
      <div style={{ marginTop: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: F }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${DIVIDER}`, textAlign: 'left' }}>
              <th style={{ padding: '8px 10px', color: MUTED, fontWeight: 600 }}>Metrica</th>
              <th style={{ padding: '8px 10px', color: MUTED, fontWeight: 600 }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.label}
                style={i < lastIndex ? { borderBottom: `1px solid ${DIVIDER}` } : undefined}
              >
                <td style={{ padding: '8px 10px', color: TEXT }}>{row.label}</td>
                <td style={{ padding: '8px 10px', color: TEXT }}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (intent === 'send_message_via_channel') {
    const info = readSendMessageInfo(data);
    return (
      <div style={{ marginTop: 12, fontSize: 14, color: TEXT }}>
        <p>
          Mensagem enviada para <strong>{info.phone}</strong> via{' '}
          {info.channel}.
        </p>
        <p style={{ color: MUTED, fontSize: 13 }}>{info.preview}</p>
      </div>
    );
  }

  return null;
}

function BrainFallbackMessage() {
  return (
    <div
      style={{
        marginTop: 12,
        padding: '10px 14px',
        background: 'rgba(232,93,48,0.08)',
        borderRadius: 6,
        fontSize: 14,
        color: EMBER,
      }}
    >
      Ainda nao consigo executar isso. Esta sugestao foi registrada para analise futura.
    </div>
  );
}

export function MessageBlock({
  message,
  isStreaming = false,
  isThinking = false,
  isBusy = false,
  showSlowHint = false,
  onUserEdit,
  onUserRetry,
  onAssistantFeedback,
  onAssistantRegenerate,
  onCancelProcessing,
}: {
  message: DashboardMessage;
  isStreaming?: boolean;
  isThinking?: boolean;
  isBusy?: boolean;
  showSlowHint?: boolean;
  onUserEdit?: (messageId: string, nextText: string) => Promise<void>;
  onUserRetry?: (messageId: string) => Promise<void>;
  onAssistantFeedback?: (messageId: string, type: 'positive' | 'negative' | null) => Promise<void>;
  onAssistantRegenerate?: (messageId: string) => Promise<void>;
  onCancelProcessing?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(message.text);
  const assistantVersions = useMemo(
    () => getAssistantResponseVersions(message.metadata, message.text, message.id),
    [message.id, message.metadata, message.text],
  );
  const processingTrace = useMemo(
    () => getAssistantProcessingTrace(message.metadata),
    [message.metadata],
  );
  const processingSummary = useMemo(
    () =>
      summarizeAssistantProcessingTrace(
        processingTrace,
        typeof message.metadata?.processingSummary === 'string'
          ? message.metadata.processingSummary
          : undefined,
      ),
    [message.metadata, processingTrace],
  );
  const reasoning = useMemo(() => getAssistantReasoning(message.metadata), [message.metadata]);
  const [activeVersionIndex, setActiveVersionIndex] = useState(
    clampVersionIndex(assistantVersions.length - 1, assistantVersions.length),
  );

  useEffect(() => {
    if (!isEditing) {
      queueMicrotask(() => setDraftText(message.text));
    }
  }, [isEditing, message.text]);

  useEffect(() => {
    queueMicrotask(() =>
      setActiveVersionIndex(clampVersionIndex(assistantVersions.length - 1, assistantVersions.length)),
    );
  }, [assistantVersions.length]);

  if (message.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: 'min(78%, 680px)' }}>
          {isEditing ? (
            <div
              style={{
                background: SURFACE,
                border: `1px solid ${DIVIDER}`,
                borderRadius: 6,
                padding: 14,
              }}
            >
              <textarea
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                rows={computeEditTextareaRows(draftText)}
                style={{
                  width: '100%',
                  minHeight: 84,
                  resize: 'vertical',
                  border: `1px solid ${DIVIDER}`,
                  borderRadius: 6,
                  background: V,
                  color: TEXT,
                  fontFamily: F,
                  fontSize: 15,
                  lineHeight: 1.7,
                  padding: '12px 14px',
                  outline: 'none',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setDraftText(message.text);
                    setIsEditing(false);
                  }}
                  style={{
                    border: `1px solid ${DIVIDER}`,
                    borderRadius: 6,
                    background: 'transparent',
                    color: MUTED,
                    fontFamily: F,
                    fontSize: 13,
                    fontWeight: 600,
                    padding: '8px 12px',
                    cursor: 'pointer',
                  }}
                >
                  {kloelT(`Cancelar`)}
                </button>
                <button
                  type="button"
                  disabled={!canSubmitUserEdit(isBusy, draftText, message.text)}
                  onClick={async () => {
                    await onUserEdit?.(message.id, draftText.trim());
                    setIsEditing(false);
                  }}
                  style={{
                    border: 'none',
                    borderRadius: 6,
                    background: EMBER,
                    color: KLOEL_THEME.textOnAccent,
                    fontFamily: F,
                    fontSize: 13,
                    fontWeight: 700,
                    padding: '8px 12px',
                    cursor: canSubmitUserEdit(isBusy, draftText, message.text)
                      ? 'pointer'
                      : 'default',
                    opacity: canSubmitUserEdit(isBusy, draftText, message.text) ? 1 : 0.45,
                  }}
                >
                  {kloelT(`Salvar`)}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  background: `color-mix(in srgb, ${KLOEL_THEME.accent} 6%, ${KLOEL_THEME.bgSecondary})`,
                  border: `1px solid color-mix(in srgb, ${KLOEL_THEME.accent} 22%, ${KLOEL_THEME.borderPrimary})`,
                  borderRadius: 6,
                  padding: '14px 18px',
                  fontSize: 15,
                  color: KLOEL_THEME.textPrimary,
                  lineHeight: 1.7,
                  fontFamily: F,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {message.text}
              </div>
              <MessageActionBar
                content={message.text}
                align="right"
                visible
                actions={[
                  {
                    id: 'edit',
                    label: 'Editar',
                    icon: 'edit',
                    disabled: isBusy,
                    onClick: () => setIsEditing(true),
                  },
                  {
                    id: 'retry',
                    label: 'Reenviar',
                    icon: 'retry',
                    disabled: isBusy,
                    onClick: async () => {
                      await onUserRetry?.(message.id);
                    },
                  },
                ]}
              />
            </>
          )}
        </div>
      </div>
    );
  }

  const feedbackType = pickAssistantFeedbackType(message.metadata);
  const visibleAssistantText = resolveVisibleAssistantText(
    assistantVersions,
    clampVersionIndex(activeVersionIndex, assistantVersions.length),
    message.text,
  );
  const hasVisibleAssistantText = !!visibleAssistantText.trim();

  if (shouldShowThinkingPlaceholder(isThinking, hasVisibleAssistantText)) {
    return (
      <ReasoningTimeline
        reasoning={reasoning}
        steps={processingTrace}
        fallbackSummary={processingSummary}
        isProcessing
        isComplete={false}
        {...(showSlowHint !== undefined ? { showSlowHint } : {})}
        {...(onCancelProcessing !== undefined ? { onCancel: onCancelProcessing } : {})}
      />
    );
  }

  return (
    <div
      style={{
        fontSize: 15,
        color: TEXT,
        lineHeight: 1.78,
        fontFamily: F,
      }}
    >
      <ReasoningTimeline
        reasoning={reasoning}
        steps={processingTrace}
        fallbackSummary={processingSummary}
        isProcessing={isThinking}
        isComplete={!isThinking && hasVisibleAssistantText}
        {...(showSlowHint !== undefined ? { showSlowHint } : {})}
        {...(onCancelProcessing !== undefined ? { onCancel: onCancelProcessing } : {})}
      />

      <AssistantVersionNavigator
        total={assistantVersions.length}
        activeIndex={clampVersionIndex(activeVersionIndex, assistantVersions.length)}
        onChange={setActiveVersionIndex}
      />

      <AssistantAssetBlock
        {...(message.metadata !== undefined ? { metadata: message.metadata } : {})}
      />
      {message.metadata && hasBrainOperator(message.metadata) ? (
        <BrainOperatorResult metadata={message.metadata} />
      ) : null}
      {message.metadata && hasBrainFallback(message.metadata) ? <BrainFallbackMessage /> : null}
      <KloelMarkdown content={visibleAssistantText} />
      {isStreaming ? (
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 8,
            height: '1.1em',
            marginLeft: 6,
            borderRadius: 14,
            verticalAlign: 'text-bottom',
            background: KLOEL_THEME.accent,
            animation: 'kloel-stream-caret 1s steps(1, end) infinite',
          }}
        />
      ) : null}
      {shouldShowAssistantActions(isThinking, hasVisibleAssistantText) ? (
        <MessageActionBar
          content={visibleAssistantText}
          align="left"
          visible={true}
          actions={[
            {
              id: 'thumbs-up',
              label: 'Gostei',
              icon: 'thumbsUp',
              active: feedbackType === 'positive',
              disabled: isBusy,
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
              disabled: isBusy,
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
              disabled: isBusy || isStreaming,
              onClick: async () => {
                await onAssistantRegenerate?.(message.id);
              },
            },
          ]}
        />
      ) : null}
    </div>
  );
}
