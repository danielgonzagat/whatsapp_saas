import { KLOEL_THEME } from '@/lib/kloel-theme';

export const C = {
  bg: KLOEL_THEME.bgPrimary,
  bgOverlay: KLOEL_THEME.bgOverlay,
  card: KLOEL_THEME.bgCard,
  elevated: KLOEL_THEME.bgSecondary,
  border: KLOEL_THEME.borderPrimary,
  divider: KLOEL_THEME.borderSubtle,
  text: KLOEL_THEME.textPrimary,
  textOnAccent: KLOEL_THEME.textOnAccent,
  secondary: KLOEL_THEME.textSecondary,
  muted: KLOEL_THEME.textTertiary,
  ember: KLOEL_THEME.accent,
  emberBg: KLOEL_THEME.accentLight,
  emberGlow: KLOEL_THEME.accentLight,
  emberStrong: KLOEL_THEME.accentMedium,
  success: KLOEL_THEME.success,
  successBg: KLOEL_THEME.successBg,
  warning: KLOEL_THEME.warning,
  warningBg: KLOEL_THEME.warningBg,
  error: KLOEL_THEME.error,
  errorBg: KLOEL_THEME.errorBg,
  info: KLOEL_THEME.info,
  infoBg: KLOEL_THEME.infoBg,
};

export const FONT = {
  sans: "'Sora', sans-serif",
  mono: "'JetBrains Mono', monospace",
};

export const MONTH_LABELS = Object.freeze([
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
] as const);

export function TempBar({
  value,
  max,
  color = C.ember,
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div
      style={{
        width: '100%',
        height: 4,
        background: C.elevated,
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: 2,
          transition: 'width 300ms ease',
        }}
      />
    </div>
  );
}
