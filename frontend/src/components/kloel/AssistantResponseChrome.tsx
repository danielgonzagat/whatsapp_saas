'use client';

import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { useEffect, useState } from 'react';
import { KloelMushroomVisual } from './KloelBrand';
/** Assistant chrome theme shape. */
export interface AssistantChromeTheme {
  /** Border color property. */
  borderColor?: string;
  /** Surface color property. */
  surfaceColor?: string;
  /** Nested surface color property. */
  nestedSurfaceColor?: string;
  /** Nested border color property. */
  nestedBorderColor?: string;
  /** Text color property. */
  textColor?: string;
  /** Muted color property. */
  mutedColor?: string;
  /** Subtle text color property. */
  subtleTextColor?: string;
  /** Icon trace color property. */
  iconTraceColor?: string;
}

/** Assistant process entry shape. */
export interface AssistantProcessEntry {
  /** Id property. */
  id: string;
  /** Label property. */
  label: string;
  /** Phase property. */
  phase: string;
  /** Kind property. */
  kind?: 'status' | 'tool_call' | 'tool_result' | 'system' | undefined;
  /** Span id property. */
  spanId?: string | undefined;
  /** Artifact id property. */
  artifactId?: string | undefined;
  /** Success property. */
  success?: boolean | undefined;
  /** Duration ms property. */
  durationMs?: number | undefined;
}

const DEFAULT_THEME: Required<AssistantChromeTheme> = {
  borderColor: 'var(--app-border-primary, colors.border.space)',
  surfaceColor: 'var(--app-bg-card, colors.background.surface)',
  nestedSurfaceColor: 'var(--app-bg-secondary, colors.background.void)',
  nestedBorderColor: 'var(--app-border-subtle, colors.background.elevated)',
  textColor: 'var(--app-text-primary, colors.text.silver)',
  mutedColor: `var(--app-text-secondary, ${colors.text.secondary})`,
  subtleTextColor: 'var(--app-text-tertiary, colors.text.muted)',
  iconTraceColor: 'var(--app-text-primary, colors.text.silver)',
};

function resolveTheme(theme?: AssistantChromeTheme) {
  return {
    ...DEFAULT_THEME,
    ...(theme || {}),
  };
}

function countTraceActions(entries: AssistantProcessEntry[]): number {
  return entries.filter((entry) => entry.kind === 'tool_call' || entry.phase === 'tool_calling')
    .length;
}

function countTraceObservations(entries: AssistantProcessEntry[]): number {
  return entries.filter((entry) => entry.kind === 'tool_result' || entry.phase === 'tool_result')
    .length;
}

function countTraceSpans(entries: AssistantProcessEntry[]): number {
  return new Set(entries.map((entry) => entry.spanId).filter(Boolean)).size;
}

function buildTraceConceptLabels(
  entries: AssistantProcessEntry[],
  isProcessing: boolean,
): string[] {
  const actionCount = countTraceActions(entries);
  const observationCount = countTraceObservations(entries);
  const spanCount = countTraceSpans(entries);
  const labels = ['Reasoning summary', 'Agent trace'];

  if (entries.length > 0 || isProcessing) {
    labels.push('CoT privado', 'Scratchpad privado');
  }
  if (actionCount > 0 || observationCount > 0) {
    labels.push('ReAct trajectory', 'Tool/function calling');
  }
  if (spanCount > 0 || actionCount > 0 || observationCount > 0) {
    labels.push('Traces + spans');
  }

  return labels;
}

/** Assistant version navigator. */
export function AssistantVersionNavigator({
  total,
  activeIndex,
  onChange,
  theme,
  marginTop = 10,
  marginBottom = 6,
}: {
  total: number;
  activeIndex: number;
  onChange: (nextIndex: number) => void;
  theme?: AssistantChromeTheme;
  marginTop?: number;
  marginBottom?: number;
}) {
  if (total < 2) {
    return null;
  }

  const resolvedTheme = resolveTheme(theme);
  const canGoPrevious = activeIndex > 0;
  const canGoNext = activeIndex < total - 1;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        marginTop,
        marginBottom,
      }}
    >
      <button
        type="button"
        aria-label="Versão anterior"
        disabled={!canGoPrevious}
        onClick={() => onChange(activeIndex - 1)}
        style={navigatorButtonStyle(resolvedTheme, canGoPrevious)}
      >
        <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>
          ←
        </span>
      </button>

      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: resolvedTheme.mutedColor,
          minWidth: 58,
          textAlign: 'center',
        }}
      >
        {activeIndex + 1} / {total}
      </span>

      <button
        type="button"
        aria-label="Próxima versão"
        disabled={!canGoNext}
        onClick={() => onChange(activeIndex + 1)}
        style={navigatorButtonStyle(resolvedTheme, canGoNext)}
      >
        <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>
          →
        </span>
      </button>
    </div>
  );
}

/** Assistant processing trace card. */
export function AssistantProcessingTraceCard({
  entries,
  summary,
  isProcessing,
  showSlowHint = false,
  onCancel,
  theme,
  marginBottom = 14,
}: {
  entries: AssistantProcessEntry[];
  summary: string;
  isProcessing: boolean;
  showSlowHint?: boolean;
  onCancel?: () => void;
  theme?: AssistantChromeTheme;
  marginBottom?: number;
}) {
  const resolvedTheme = resolveTheme(theme);
  const [expanded, setExpanded] = useState(isProcessing);
  const conceptLabels = buildTraceConceptLabels(entries, isProcessing);

  useEffect(() => {
    if (isProcessing) {
      queueMicrotask(() => setExpanded(true));
    }
  }, [isProcessing]);

  if (entries.length === 0 && !isProcessing) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
        marginBottom,
        padding: '11px 12px',
        borderRadius: 8,
        background: resolvedTheme.surfaceColor,
        border: `1px solid ${resolvedTheme.borderColor}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            minWidth: 0,
            flex: 1,
          }}
        >
          <KloelMushroomVisual
            size={16}
            traceColor={resolvedTheme.iconTraceColor}
            animated={isProcessing}
            spores={isProcessing ? 'animated' : 'none'}
            ariaHidden
          />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                marginBottom: 3,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: resolvedTheme.mutedColor,
              }}
            >
              Pré-resposta executável
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 12.25,
                lineHeight: 1.42,
                color: isProcessing ? resolvedTheme.textColor : resolvedTheme.mutedColor,
              }}
            >
              {summary}
            </p>
            {conceptLabels.length > 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 5,
                  marginTop: 8,
                }}
              >
                {conceptLabels.map((label) => (
                  <span
                    key={label}
                    style={{
                      borderRadius: 6,
                      border: `1px solid ${resolvedTheme.nestedBorderColor}`,
                      background: resolvedTheme.nestedSurfaceColor,
                      color: resolvedTheme.subtleTextColor,
                      fontSize: 8.5,
                      fontWeight: 500,
                      letterSpacing: '0.04em',
                      lineHeight: 1,
                      padding: '4px 6px',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {entries.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            style={{
              border: `1px solid ${resolvedTheme.borderColor}`,
              borderRadius: 6,
              background: 'transparent',
              color: resolvedTheme.mutedColor,
              fontSize: 11,
              fontWeight: 600,
              padding: '5px 8px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {expanded ? 'Ocultar' : 'Expandir'}
          </button>
        ) : null}
      </div>

      {showSlowHint ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '8px 10px',
            borderRadius: 6,
            background: resolvedTheme.nestedSurfaceColor,
            border: `1px solid ${resolvedTheme.nestedBorderColor}`,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 12.5,
              lineHeight: 1.42,
              color: resolvedTheme.mutedColor,
            }}
          >
            {kloelT(`Essa resposta está demorando mais do que o normal. Você pode aguardar mais um pouco ou
            cancelar a tentativa atual.`)}
          </p>

          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              style={{
                border: `1px solid ${resolvedTheme.borderColor}`,
                borderRadius: 6,
                background: 'transparent',
                color: resolvedTheme.textColor,
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

      {expanded && entries.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entries.map((entry, index) => (
            <div
              key={`${entry.id}:${entry.phase}:${index}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 9,
                padding: '8px 10px',
                borderRadius: 6,
                background: resolvedTheme.nestedSurfaceColor,
                border: `1px solid ${resolvedTheme.nestedBorderColor}`,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 5,
                  height: 5,
                  marginTop: 7,
                  borderRadius: 6,
                  background: resolvedTheme.mutedColor,
                  opacity: 0.72,
                  flexShrink: 0,
                }}
              />
              <p
                style={{
                  minWidth: 0,
                  margin: 0,
                  fontSize: 12.5,
                  lineHeight: 1.48,
                  color: resolvedTheme.textColor,
                }}
              >
                {entry.label}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function navigatorButtonStyle(theme: Required<AssistantChromeTheme>, enabled: boolean) {
  return {
    width: 28,
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    border: `1px solid ${theme.borderColor}`,
    background: 'transparent',
    color: enabled ? theme.textColor : theme.subtleTextColor,
    opacity: enabled ? 1 : 0.42,
    cursor: enabled ? 'pointer' : 'default',
  } as const;
}
