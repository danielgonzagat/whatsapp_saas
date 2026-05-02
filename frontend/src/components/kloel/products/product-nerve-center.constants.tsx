import { KLOEL_THEME } from '@/lib/kloel-theme';

import type React from 'react';

/** S. */
export const S = "'Sora',sans-serif";
/** M. */
export const M = "'JetBrains Mono',monospace";
/** V. */
export const V = {
  void: KLOEL_THEME.bgPrimary,
  s: KLOEL_THEME.bgCard,
  e: KLOEL_THEME.bgSecondary,
  b: KLOEL_THEME.borderPrimary,
  em: KLOEL_THEME.accent,
  t: KLOEL_THEME.textPrimary,
  t2: KLOEL_THEME.textSecondary,
  t3: KLOEL_THEME.textTertiary,
  g: '#25D366',
  g2: '#10B981',
  p: '#8B5CF6',
  bl: '#3B82F6',
  y: '#F59E0B',
  r: '#EF4444',
  pk: '#EC4899',
} as const;

/** Cs. */
export const cs: React.CSSProperties = {
  background: V.s,
  border: `1px solid ${V.b}`,
  borderRadius: 6,
};

/** Is. */
export const is: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: KLOEL_THEME.bgInput,
  border: `1px solid ${KLOEL_THEME.borderInput}`,
  borderRadius: 6,
  color: KLOEL_THEME.textPrimary,
  fontSize: 13,
  fontFamily: S,
  outline: 'none',
};

/** Ls. */
export const ls: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 600,
  color: V.t3,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  marginBottom: 6,
  fontFamily: S,
};

/** Format brl cents. */
export const formatBrlCents = (value: number) =>
  (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
