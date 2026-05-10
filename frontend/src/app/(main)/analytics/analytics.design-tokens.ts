import { KLOEL_THEME } from '@/lib/kloel-theme';
import { colors } from '@/lib/design-tokens';

export const FONT_SORA = "var(--font-sora), 'Sora', sans-serif";
export const FONT_MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";

export const V = {
  void: KLOEL_THEME.bgPrimary,
  s: KLOEL_THEME.bgCard,
  e: KLOEL_THEME.bgSecondary,
  b: KLOEL_THEME.borderPrimary,
  em: KLOEL_THEME.accent,
  t: KLOEL_THEME.textPrimary,
  t2: KLOEL_THEME.textSecondary,
  t3: KLOEL_THEME.textTertiary,
  g2: colors.semantic.success,
  bl: colors.semantic.info,
  y: colors.semantic.warning,
  r: colors.semantic.error,
  p: colors.semantic.purple,
  cy: colors.canvas.cyan,
  pk: colors.canvas.pink,
};

export const R$ = (n: number) =>
  'R$ ' + (n / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const Fmt = (n: number) => n.toLocaleString('pt-BR');

export const chartCardStyle: React.CSSProperties = {
  background: V.s,
  border: `1px solid ${V.b}`,
  borderRadius: 8,
};

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: V.e,
  border: `1px solid ${V.b}`,
  borderRadius: 6,
  color: V.t,
  fontSize: 13,
  fontFamily: FONT_SORA,
  outline: 'none',
};

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 9,
  fontWeight: 600,
  color: V.t3,
  letterSpacing: '.1em',
  textTransform: 'uppercase' as const,
  marginBottom: 6,
  fontFamily: FONT_SORA,
};
