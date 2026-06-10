'use client';

import { useState } from 'react';
import { ChevronDown, Clock, Download, FileText } from 'lucide-react';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { StepDot, ThinkingDots, formatDuration } from './ReasoningTimeline.parts';
import { kloelT } from '@/lib/i18n/t';
import { E, F, TEXT, MUTED, SURFACE, DIVIDER } from './KloelDashboard.subcomponents';
import {
  formatAssistantTraceToolLabel,
  sanitizeAssistantReasoningTextForDisplay,
} from '@/lib/kloel-message-ui';
import type { AssistantProcessingTraceEntry, AssistantReasoning } from '@/lib/kloel-message-ui';

/**
 * Real pre-response execution timeline for the Kloel chat.
 *
 * Visible values are public, sanitized model/agent execution context:
 * - reasoning.text       — provider-emitted reasoning detail, sanitized for secrets
 * - reasoning.summary    — optional public summary (collapses the header)
 * - reasoning.durationMs — measured thinking time
 * - steps                — real tool_call/tool_result events (entry.tool + durationMs)
 * - reasoning.files      — real delivered artifacts
 *
 * When there is no reasoning text, summary, tool activity, file, or duration,
 * the block does not render (honest empty state, never a fabricated thinking line).
 */
interface ReasoningTimelineProps {
  reasoning: AssistantReasoning;
  steps: AssistantProcessingTraceEntry[];
  fallbackSummary: string;
  isProcessing: boolean;
  isComplete: boolean;
  showSlowHint?: boolean;
  onCancel?: () => void;
}

const TERTIARY = KLOEL_THEME.textTertiary;
const NESTED = KLOEL_THEME.bgSecondary;

/**
 * First sentence of the REAL reasoning emitted this turn, flattened and
 * truncated for the collapsed header. Empty when no reasoning text exists —
 * never fabricated.
 */
function deriveReasoningGist(text: string): string {
  const flattened = text.replace(/\s+/g, ' ').trim();
  if (!flattened) {
    return '';
  }
  // A list-enumeration period ("três coisas: 1. uma tabela") is not a sentence
  // boundary: require a non-digit before the punctuation and an uppercase
  // letter after the space, so the gist never collapses to "...: 1.".
  const sentenceEnd = flattened.search(/(?<=[^\s0-9][.!?…])\s+(?=\p{Lu})/u);
  const sentence = sentenceEnd > 0 ? flattened.slice(0, sentenceEnd) : flattened;
  if (sentence.length <= 96) {
    return sentence;
  }
  const cut = sentence.slice(0, 96);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : 96).trimEnd()}…`;
}

/** Real pre-response execution timeline (props-driven, theme-aware). */
export function ReasoningTimeline({
  reasoning,
  steps,
  fallbackSummary,
  isProcessing,
  isComplete,
  showSlowHint = false,
  onCancel,
}: ReasoningTimelineProps) {
  const toolSteps = steps;
  const publicReasoningDetail = sanitizeAssistantReasoningTextForDisplay(reasoning.text);
  const hasPublicReasoningDetail = publicReasoningDetail.trim().length > 0;
  const safeReasoningSummary = reasoning.summary.trim();
  const visibleFallbackSummary = fallbackSummary.trim();
  // Collapsed-header gist priority: provider summary > first sentence of the
  // REAL reasoning emitted this turn > operational-trace summary.
  const publicReasoningText =
    safeReasoningSummary || deriveReasoningGist(publicReasoningDetail) || visibleFallbackSummary;
  const hasPublicReasoningText = publicReasoningText.length > 0;
  const hasReasoningDuration = Boolean(reasoning.durationMs && reasoning.durationMs > 0);
  const hasRealReasoningSignal =
    hasPublicReasoningDetail || safeReasoningSummary.length > 0 || hasReasoningDuration;
  const hasOperationalTrace = toolSteps.length > 0 || reasoning.files.length > 0;
  const hasContent =
    hasPublicReasoningDetail ||
    hasPublicReasoningText ||
    hasReasoningDuration ||
    hasOperationalTrace;

  const [collapseOverride, setCollapseOverride] = useState<boolean | null>(null);
  const collapsed = collapseOverride ?? isComplete;

  // Honest empty state: if the model emitted no reasoning and the agent produced no
  // operational trace, there is nothing real to show — even while the turn is pending.
  if (!hasContent) {
    return null;
  }

  const headerFallbackLabel = hasRealReasoningSignal
    ? kloelT(`Raciocínio`)
    : hasOperationalTrace
      ? kloelT(`Execução`)
      : '';
  const headerSummary = publicReasoningText || headerFallbackLabel;
  const durationLabel =
    reasoning.durationMs && reasoning.durationMs > 0
      ? `${kloelT(`Pensou por`)} ${formatDuration(reasoning.durationMs)}`
      : '';
  // Render a thinking step only when the provider exposed public reasoning text.
  // Operational trace without reasoning stays under execution steps.
  const shouldRenderThinkingStep = hasPublicReasoningDetail;

  return (
    <div style={{ marginBottom: 14, fontFamily: F }}>
      <style>{`
        @keyframes rtl-blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        @keyframes rtl-bounce { 0%,60%,100%{opacity:.3;transform:translateY(0)} 30%{opacity:1;transform:translateY(-3px)} }
        .rtl-wrap { display:grid; grid-template-rows:1fr; transition:grid-template-rows .32s cubic-bezier(.4,0,.2,1); }
        .rtl-wrap.rtl-collapsed { grid-template-rows:0fr; }
        .rtl-inner { overflow:hidden; }
      `}</style>

      <button
        type="button"
        onClick={() => setCollapseOverride((value) => !(value ?? isComplete))}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          border: 'none',
          background: 'transparent',
          padding: '2px 0',
          fontFamily: F,
          fontSize: 13.5,
          color: MUTED,
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            color: TERTIARY,
            transition: 'transform .2s ease',
            transform: collapsed ? 'rotate(-90deg)' : 'none',
          }}
        >
          <ChevronDown size={14} strokeWidth={2} />
        </span>
        <span>
          {headerSummary ? headerSummary : isProcessing ? <ThinkingDots /> : kloelT(`Raciocínio`)}
        </span>
        {durationLabel ? (
          <span style={{ color: TERTIARY, fontSize: 12.5 }}>· {durationLabel}</span>
        ) : null}
      </button>

      <div className={`rtl-wrap${collapsed ? ' rtl-collapsed' : ''}`}>
        <div className="rtl-inner">
          <div style={{ position: 'relative', padding: '10px 0 2px' }}>
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: 10,
                top: 18,
                bottom: 16,
                width: 1.5,
                background: DIVIDER,
              }}
            />

            {shouldRenderThinkingStep ? (
              <div style={{ position: 'relative', padding: '3px 0 14px 34px', minHeight: 21 }}>
                <StepDot kind="thinking" />
                <div
                  style={{
                    fontSize: 14.5,
                    lineHeight: 1.7,
                    color: KLOEL_THEME.textSecondary,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {hasPublicReasoningDetail ? publicReasoningDetail : null}
                  {isProcessing ? (
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-block',
                        width: 2,
                        height: 15,
                        marginLeft: hasPublicReasoningDetail ? 1 : 2,
                        transform: 'translateY(2px)',
                        background: TERTIARY,
                        animation: 'rtl-blink 1.05s steps(1) infinite',
                      }}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}

            {toolSteps.map((step, index) => (
              <div
                key={`${step.id}:${index}`}
                style={{ position: 'relative', padding: '3px 0 14px 34px', minHeight: 21 }}
              >
                <StepDot kind="tool" />
                <div style={{ fontSize: 14, lineHeight: 1.55, color: TEXT }}>
                  {step.kind === 'tool_result'
                    ? kloelT(`Resultado`)
                    : step.kind === 'tool_call'
                      ? kloelT(`Ação`)
                      : step.label}
                  {formatAssistantTraceToolLabel(step.tool) ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        marginLeft: 8,
                        background: NESTED,
                        border: `1px solid ${DIVIDER}`,
                        borderRadius: 6,
                        padding: '2px 8px',
                        fontSize: 12,
                        color: MUTED,
                      }}
                    >
                      <FileText size={11} strokeWidth={1.9} aria-hidden="true" />
                      {formatAssistantTraceToolLabel(step.tool)}
                    </span>
                  ) : null}
                  {step.riskLabel ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        marginLeft: 8,
                        background: NESTED,
                        border: `1px solid ${DIVIDER}`,
                        borderRadius: 999,
                        padding: '2px 8px',
                        fontSize: 12,
                        color: step.riskLevel === 'high' ? E : MUTED,
                      }}
                    >
                      {step.riskLabel}
                    </span>
                  ) : null}
                  {typeof step.durationMs === 'number' && step.durationMs > 0 ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        marginLeft: 8,
                        color: TERTIARY,
                        fontSize: 12,
                      }}
                    >
                      <Clock size={11} strokeWidth={1.9} aria-hidden="true" />
                      {formatDuration(step.durationMs)}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}

            {isComplete ? (
              <div style={{ position: 'relative', padding: '3px 0 2px 34px', minHeight: 21 }}>
                <StepDot kind="done" />
                <div style={{ fontSize: 14, lineHeight: 1.55, color: TEXT }}>
                  {kloelT(`Concluído`)}
                </div>
              </div>
            ) : null}
          </div>

          {showSlowHint ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                marginTop: 6,
                padding: '8px 10px',
                borderRadius: 6,
                background: NESTED,
                border: `1px solid ${DIVIDER}`,
              }}
            >
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.42, color: MUTED }}>
                {kloelT(
                  `Essa resposta está demorando mais do que o normal. Você pode aguardar mais um pouco ou cancelar a tentativa atual.`,
                )}
              </p>
              {onCancel ? (
                <button
                  type="button"
                  onClick={onCancel}
                  style={{
                    border: `1px solid ${DIVIDER}`,
                    borderRadius: 6,
                    background: 'transparent',
                    color: TEXT,
                    fontFamily: F,
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '5px 8px',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  {kloelT(`Cancelar`)}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {reasoning.files.map((file, index) => {
        const href = file.downloadUrl || file.url || '';
        return (
          <div
            key={`${file.name}:${index}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginTop: 12,
              background: SURFACE,
              border: `1px solid ${DIVIDER}`,
              borderRadius: 12,
              padding: '12px 14px',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: NESTED,
                border: `1px solid ${DIVIDER}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: MUTED,
                flex: 'none',
              }}
            >
              <FileText size={18} strokeWidth={1.7} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14.5,
                  fontWeight: 600,
                  color: TEXT,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {file.name}
              </div>
              {file.meta ? (
                <div style={{ fontSize: 12.5, color: TERTIARY, marginTop: 1 }}>{file.meta}</div>
              ) : null}
            </div>
            {href ? (
              <>
                <a
                  href={href}
                  download={file.name}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Baixar ${file.name}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    border: `1px solid color-mix(in srgb, ${E} 22%, ${DIVIDER})`,
                    background: `color-mix(in srgb, ${E} 10%, ${SURFACE})`,
                    color: E,
                    borderRadius: 8,
                    padding: '8px 14px',
                    fontFamily: F,
                    fontSize: 13,
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  <Download size={15} strokeWidth={1.9} aria-hidden="true" />
                  {kloelT(`Baixar`)}
                </a>
                <a
                  href={`https://drive.google.com/save?url=${encodeURIComponent(href)}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Salvar no Drive ${file.name}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    border: `1px solid ${DIVIDER}`,
                    background: 'transparent',
                    color: MUTED,
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontFamily: F,
                    fontSize: 13,
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  Drive
                </a>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
