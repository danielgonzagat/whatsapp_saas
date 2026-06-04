'use client';

import { colors } from '@/lib/design-tokens';
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
