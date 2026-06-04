'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronDown, Clock, Download, FileText } from 'lucide-react';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { kloelT } from '@/lib/i18n/t';
import { E, F, TEXT, MUTED, SURFACE, DIVIDER } from './KloelDashboard.subcomponents';
import type { AssistantProcessingTraceEntry, AssistantReasoning } from '@/lib/kloel-message-ui';

/**
 * Real pre-response execution timeline for the Kloel chat.
 *
 * Every visible reasoning value comes from props (the live model/agent stream):
 * - reasoning.text     — the model's real reasoning_content, token by token
 * - reasoning.summary  — a real header summary (only when the provider/derivation produced one)
 * - reasoning.durationMs — measured reasoning time (reasoning_done event)
 * - steps              — real tool_call/tool_result events (entry.tool + durationMs)
 * - reasoning.files    — real delivered artifacts
 *
 * There is NO hardcoded reasoning text and NO array of pre-written phrases here. When the
 * model emits no reasoning and runs no tools, the reasoning block does not render at all.
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

function formatDuration(ms: number): string {
  if (ms < 950) {
    return `${Math.max(1, Math.round(ms / 100) * 100 === 0 ? ms : ms)}ms`;
  }
  const seconds = ms / 1000;
  return seconds >= 10 ? `${Math.round(seconds)}s` : `${seconds.toFixed(1)}s`;
}

function StepDot({ kind }: { kind: 'thinking' | 'tool' | 'done' }) {
  const base = {
    position: 'absolute' as const,
    left: 0,
    top: 1,
    width: 21,
    height: 21,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: KLOEL_THEME.bgPrimary,
    color: kind === 'done' ? E : TERTIARY,
  };
  if (kind === 'tool') {
    return (
      <span style={{ ...base, borderRadius: 6, background: NESTED, border: `1px solid ${DIVIDER}` }}>
        <FileText size={11} strokeWidth={1.9} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span style={base}>
      {kind === 'done' ? (
        <Check size={13} strokeWidth={2} aria-hidden="true" />
      ) : (
        <Clock size={13} strokeWidth={1.9} aria-hidden="true" />
      )}
    </span>
  );
}

function ThinkingDots() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          style={{
            width: 5,
            height: 5,
            borderRadius: 6,
            background: TERTIARY,
            animation: `rtl-bounce 1.2s ${dot * 0.16}s infinite`,
          }}
        />
      ))}
    </span>
  );
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
  const toolSteps = steps.filter(
    (step) => step.kind === 'tool_call' || step.kind === 'tool_result',
  );
  const hasReasoningText = reasoning.text.trim().length > 0;
  const hasContent = hasReasoningText || toolSteps.length > 0;

  const [collapsed, setCollapsed] = useState(false);
  const [autoCollapsed, setAutoCollapsed] = useState(false);
  useEffect(() => {
    if (isComplete && !autoCollapsed) {
      setCollapsed(true);
      setAutoCollapsed(true);
    }
  }, [isComplete, autoCollapsed]);

  // Honest empty state: if the model emitted no reasoning and ran no tools and is not
  // working, there is nothing real to show — render nothing rather than fabricate.
  if (!hasContent && !isProcessing) {
    return null;
  }

  const reasoningGist =
    reasoning.text.trim().split(/(?<=[.!?])\s/)[0]?.trim().slice(0, 96) || '';
  const visibleFallbackSummary = fallbackSummary.trim();
  const headerSummary = reasoning.summary.trim() || visibleFallbackSummary || reasoningGist;
  const durationLabel =
    reasoning.durationMs && reasoning.durationMs > 0
      ? `${kloelT(`Pensou por`)} ${formatDuration(reasoning.durationMs)}`
      : '';
  const shouldShowFallbackSummary =
    visibleFallbackSummary.length > 0 &&
    visibleFallbackSummary !== reasoning.text.trim() &&
    visibleFallbackSummary !== reasoning.summary.trim() &&
    visibleFallbackSummary !== headerSummary;


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
        onClick={() => setCollapsed((value) => !value)}
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
          {headerSummary ? (
            headerSummary
          ) : isProcessing ? (
            <ThinkingDots />
          ) : (
            kloelT(`Raciocínio`)
          )}
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

            {hasReasoningText || isProcessing ? (
              <div style={{ position: 'relative', padding: '3px 0 14px 34px', minHeight: 21 }}>
                <StepDot kind="thinking" />
                <div
                  style={{
                    fontSize: 14.5,
                    lineHeight: 1.7,
                    color: KLOEL_THEME.textSecondary,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {reasoning.text}
                  {isProcessing ? (
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-block',
                        width: 2,
                        height: 15,
                        marginLeft: 2,
                        transform: 'translateY(2px)',
                        background: TERTIARY,
                        animation: 'rtl-blink 1.05s steps(1) infinite',
                      }}
                    />
                  ) : null}
                  {shouldShowFallbackSummary ? (
                    <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.6, color: MUTED }}>
                      {visibleFallbackSummary}
                    </div>
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
                  {step.kind === 'tool_result' ? kloelT(`Resultado`) : kloelT(`Ação`)}
                  {step.tool ? (
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
                      {step.tool}
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
                {kloelT(`Essa resposta está demorando mais do que o normal. Você pode aguardar mais um pouco ou cancelar a tentativa atual.`)}
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
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
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
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
