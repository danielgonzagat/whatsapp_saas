'use client';

import { kloelT } from '@/lib/i18n/t';
import { useEffect, useState } from 'react';
import { KloelMushroomVisual } from './KloelBrand';
import { colors } from '@/lib/design-tokens';

const PATTERN_RE = /_/g;

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
}

const DEFAULT_THEME: Required<AssistantChromeTheme> = {
  borderColor: 'var(--app-border-primary, colors.border.space)',
  surfaceColor: 'var(--app-bg-card, colors.background.surface)',
  nestedSurfaceColor: 'var(--app-bg-secondary, colors.background.void)',
  nestedBorderColor: 'var(--app-border-subtle, colors.background.elevated)',
  textColor: 'var(--app-text-primary, colors.text.silver)',
  mutedColor: 'var(--app-text-secondary, #8A8A8E)',
  subtleTextColor: 'var(--app-text-tertiary, colors.text.muted)',
  iconTraceColor: 'var(--app-text-primary, colors.text.silver)',
};

function resolveTheme(theme?: AssistantChromeTheme) {
  return {
    ...DEFAULT_THEME,
    ...(theme || {}),
  };
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
        <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>
          ←
        </span>
      </button>

      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.12em',
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
        <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>
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

  useEffect(() => {
    if (isProcessing) {
      setExpanded(true);
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
        gap: 12,
        marginBottom,
        padding: '14px 16px',
        borderRadius: 16,
        background: resolvedTheme.surfaceColor,
        border: `1px solid ${resolvedTheme.borderColor}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
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
            size={18}
            traceColor={resolvedTheme.iconTraceColor}
            animated={isProcessing}
            spores={isProcessing ? 'animated' : 'none'}
            ariaHidden
          />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                marginBottom: 4,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: resolvedTheme.mutedColor,
              }}
            >
              {isProcessing ? 'Kloel está processando' : 'Atividade operacional'}
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.6,
                color: isProcessing ? resolvedTheme.textColor : resolvedTheme.mutedColor,
              }}
            >
              {summary}
            </p>
          </div>
        </div>

        {entries.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            style={{
              border: `1px solid ${resolvedTheme.borderColor}`,
              borderRadius: 999,
              background: 'transparent',
              color: resolvedTheme.mutedColor,
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 10px',
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
            gap: 12,
            padding: '10px 12px',
            borderRadius: 12,
            background: resolvedTheme.nestedSurfaceColor,
            border: `1px solid ${resolvedTheme.nestedBorderColor}`,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 12,
              lineHeight: 1.5,
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
                borderRadius: 999,
                background: 'transparent',
                color: resolvedTheme.textColor,
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 10px',
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '10px 12px',
                borderRadius: 12,
                background: resolvedTheme.nestedSurfaceColor,
                border: `1px solid ${resolvedTheme.nestedBorderColor}`,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: resolvedTheme.subtleTextColor,
                }}
              >
                {entry.phase.replace(PATTERN_RE, ' ')}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.55,
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
    borderRadius: 999,
    border: `1px solid ${theme.borderColor}`,
    background: 'transparent',
    color: enabled ? theme.textColor : theme.subtleTextColor,
    opacity: enabled ? 1 : 0.42,
    cursor: enabled ? 'pointer' : 'default',
  } as const;
}
