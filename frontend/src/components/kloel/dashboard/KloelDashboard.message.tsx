'use client';

import { kloelT } from '@/lib/i18n/t';
import {
  AssistantProcessingTraceCard,
  AssistantVersionNavigator,
} from '@/components/kloel/AssistantResponseChrome';
import { KloelMarkdown } from '@/components/kloel/KloelMarkdown';
import { MessageActionBar } from '@/components/kloel/MessageActionBar';
import { isRecord, type JsonRecord } from './KloelDashboard.helpers';
import {
  getAssistantProcessingTrace,
  getAssistantResponseVersions,
  summarizeAssistantProcessingTrace,
} from '@/lib/kloel-message-ui';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { EMBER, F, MUTED, TEXT, SURFACE, DIVIDER, V } from './KloelDashboard.subcomponents';
import { AssistantThinkingState, AssistantAssetBlock } from './KloelDashboard.assistant';
import { useEffect, useMemo, useState } from 'react';

export type DashboardMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  metadata?: JsonRecord | null;
};

function BrainOperatorResult({ metadata }: { metadata: JsonRecord }) {
  const intent = typeof metadata.brainIntent === 'string' ? metadata.brainIntent : '';
  const result = isRecord(metadata.brainResult) ? metadata.brainResult : null;

  if (!result) {
    return null;
  }

  const data = result.data;

  if (intent === 'list_products') {
    const products = Array.isArray(data) ? data : [];
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
            {products.map((p: Record<string, unknown>, i: number) => (
              <tr key={i} style={{ borderBottom: `1px solid ${DIVIDER}` }}>
                <td style={{ padding: '8px 10px', color: TEXT }}>{String(p.name ?? '-')}</td>
                <td style={{ padding: '8px 10px', color: TEXT }}>
                  {typeof p.price === 'number' ? `R$ ${(p.price / 100).toFixed(2)}` : '-'}
                </td>
                <td style={{ padding: '8px 10px', color: p.active ? EMBER : MUTED }}>
                  {p.active ? 'Sim' : 'Nao'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (intent === 'search_contact') {
    const contacts = Array.isArray(data) ? data : [];
    if (contacts.length === 0) {
      return <p style={{ color: MUTED, fontSize: 14 }}>Nenhum contato encontrado.</p>;
    }
    return (
      <div style={{ marginTop: 12 }}>
        {contacts.map((c: Record<string, unknown>, i: number) => (
          <div
            key={i}
            style={{
              padding: '10px 14px',
              borderBottom: `1px solid ${DIVIDER}`,
              fontSize: 14,
              color: TEXT,
            }}
          >
            <strong>{String(c.name ?? '-')}</strong>
            <span style={{ color: MUTED, marginLeft: 8 }}>{String(c.phone ?? '')}</span>
            {c.email ? (
              <span style={{ color: MUTED, marginLeft: 8 }}>{String(c.email)}</span>
            ) : null}
            {c.leadScore ? (
              <span style={{ marginLeft: 8, color: EMBER, fontSize: 12 }}>
                Score: {String(c.leadScore)}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  if (intent === 'list_conversations') {
    const conversations = Array.isArray(data) ? data : [];
    if (conversations.length === 0) {
      return <p style={{ color: MUTED, fontSize: 14 }}>Nenhuma conversa recente.</p>;
    }
    return (
      <div style={{ marginTop: 12 }}>
        {conversations.map((conv: Record<string, unknown>, i: number) => {
          const contact = isRecord(conv.contact) ? conv.contact : null;
          const agent = isRecord(conv.agent) ? conv.agent : null;
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
              <strong>{contact ? String(contact.name ?? contact.phone ?? '-') : '-'}</strong>
              <span style={{ color: MUTED, marginLeft: 8, fontSize: 13 }}>
                {String(conv.lastMessagePreview ?? '').slice(0, 80)}
              </span>
              <span
                style={{
                  marginLeft: 8,
                  color: conv.status === 'closed' ? MUTED : EMBER,
                  fontSize: 12,
                }}
              >
                {String(conv.status ?? '-')}
              </span>
              {agent ? (
                <span style={{ marginLeft: 8, color: MUTED, fontSize: 12 }}>
                  {String(agent.name ?? '')}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  if (intent === 'query_revenue_summary') {
    const summary = isRecord(data) ? data : null;
    if (!summary) {
      return <p style={{ color: MUTED, fontSize: 14 }}>Dados de receita indisponiveis.</p>;
    }
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
            <tr style={{ borderBottom: `1px solid ${DIVIDER}` }}>
              <td style={{ padding: '8px 10px', color: TEXT }}>Receita Total</td>
              <td style={{ padding: '8px 10px', color: TEXT }}>
                R$ {((Number(summary.totalRevenue) || 0) / 100).toFixed(2)}
              </td>
            </tr>
            <tr style={{ borderBottom: `1px solid ${DIVIDER}` }}>
              <td style={{ padding: '8px 10px', color: TEXT }}>Ticket Medio</td>
              <td style={{ padding: '8px 10px', color: TEXT }}>
                R$ {((Number(summary.ticketMedio) || 0) / 100).toFixed(2)}
              </td>
            </tr>
            <tr style={{ borderBottom: `1px solid ${DIVIDER}` }}>
              <td style={{ padding: '8px 10px', color: TEXT }}>Total de Pedidos</td>
              <td style={{ padding: '8px 10px', color: TEXT }}>
                {String(summary.totalCount ?? 0)}
              </td>
            </tr>
            <tr style={{ borderBottom: `1px solid ${DIVIDER}` }}>
              <td style={{ padding: '8px 10px', color: TEXT }}>Pedidos Pagos</td>
              <td style={{ padding: '8px 10px', color: TEXT }}>{String(summary.paidCount ?? 0)}</td>
            </tr>
            <tr style={{ borderBottom: `1px solid ${DIVIDER}` }}>
              <td style={{ padding: '8px 10px', color: TEXT }}>Conversao</td>
              <td style={{ padding: '8px 10px', color: TEXT }}>
                {String(summary.conversao ?? 0)}%
              </td>
            </tr>
            <tr>
              <td style={{ padding: '8px 10px', color: TEXT }}>Periodo</td>
              <td style={{ padding: '8px 10px', color: TEXT }}>
                {String(summary.periodDays ?? 30)} dias
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  if (intent === 'send_message_via_channel') {
    const info = isRecord(data) ? data : null;
    return (
      <div style={{ marginTop: 12, fontSize: 14, color: TEXT }}>
        <p>
          Mensagem enviada para <strong>{String(info?.phone ?? '-')}</strong> via{' '}
          {String(info?.channel ?? 'whatsapp')}.
        </p>
        <p style={{ color: MUTED, fontSize: 13 }}>{String(info?.messagePreview ?? '')}</p>
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
  const [activeVersionIndex, setActiveVersionIndex] = useState(
    Math.max(assistantVersions.length - 1, 0),
  );

  useEffect(() => {
    if (!isEditing) {
      queueMicrotask(() => setDraftText(message.text));
    }
  }, [isEditing, message.text]);

  useEffect(() => {
    queueMicrotask(() => setActiveVersionIndex(Math.max(assistantVersions.length - 1, 0)));
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
                rows={Math.max(3, Math.min(10, draftText.split('\n').length + 1))}
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
                  disabled={isBusy || !draftText.trim() || draftText.trim() === message.text.trim()}
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
                    cursor:
                      isBusy || !draftText.trim() || draftText.trim() === message.text.trim()
                        ? 'default'
                        : 'pointer',
                    opacity:
                      isBusy || !draftText.trim() || draftText.trim() === message.text.trim()
                        ? 0.45
                        : 1,
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

  const feedbackRecord = isRecord(message.metadata?.feedback) ? message.metadata.feedback : null;
  const feedbackType =
    feedbackRecord?.type === 'positive' || feedbackRecord?.type === 'negative'
      ? (feedbackRecord.type as 'positive' | 'negative')
      : null;
  const visibleAssistantText =
    assistantVersions[Math.min(activeVersionIndex, Math.max(assistantVersions.length - 1, 0))]
      ?.content || message.text;
  const hasProcessingTrace = processingTrace.length > 0;
  const hasVisibleAssistantText = !!visibleAssistantText.trim();

  if (isThinking && !hasVisibleAssistantText) {
    if (hasProcessingTrace) {
      return (
        <AssistantProcessingTraceCard
          entries={processingTrace}
          summary={processingSummary}
          isProcessing={true}
          {...(showSlowHint !== undefined ? { showSlowHint } : {})}
          {...(onCancelProcessing !== undefined ? { onCancel: onCancelProcessing } : {})}
        />
      );
    }

    return <AssistantThinkingState label={kloelT(`Kloel está pensando`)} />;
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
      {hasProcessingTrace ? (
        <AssistantProcessingTraceCard
          entries={processingTrace}
          summary={processingSummary}
          isProcessing={isThinking}
          {...(showSlowHint !== undefined ? { showSlowHint } : {})}
          {...(onCancelProcessing !== undefined ? { onCancel: onCancelProcessing } : {})}
        />
      ) : null}

      <AssistantVersionNavigator
        total={assistantVersions.length}
        activeIndex={Math.min(activeVersionIndex, Math.max(assistantVersions.length - 1, 0))}
        onChange={setActiveVersionIndex}
      />

      <AssistantAssetBlock
        {...(message.metadata !== undefined ? { metadata: message.metadata } : {})}
      />
      {message.metadata?.brainOperator ? <BrainOperatorResult metadata={message.metadata} /> : null}
      {message.metadata?.brainFallback ? <BrainFallbackMessage /> : null}
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
      {!isThinking && hasVisibleAssistantText ? (
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
