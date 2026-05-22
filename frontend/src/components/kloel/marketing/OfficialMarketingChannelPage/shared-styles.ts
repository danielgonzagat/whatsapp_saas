import { type CSSProperties } from 'react';
import { KLOEL_THEME } from '@/lib/kloel-theme';

/**
 * Fully-rounded radius for circular indicators. Referenced via constant so it
 * stays a single named source of truth (and on the design-token scale's
 * intent of "pill" rather than an ad-hoc literal).
 */
export const FULL_ROUND_RADIUS = 999;

export function buttonStyle(color: string): CSSProperties {
  return {
    border: 'none',
    borderRadius: 6,
    background: color,
    color: KLOEL_THEME.textOnAccent,
    padding: '12px 16px',
    fontWeight: 700,
    cursor: 'pointer',
  };
}

export const secondaryButtonStyle: CSSProperties = {
  border: `1px solid ${KLOEL_THEME.borderPrimary}`,
  borderRadius: 6,
  background: KLOEL_THEME.bgCard,
  color: KLOEL_THEME.textPrimary,
  padding: '12px 16px',
  fontWeight: 700,
  cursor: 'pointer',
};

export const setupPanelStyle: CSSProperties = {
  border: `1px solid ${KLOEL_THEME.borderPrimary}`,
  background: KLOEL_THEME.bgCard,
  borderRadius: 6,
  padding: 18,
  marginBottom: 18,
};

export const sectionTitleStyle: CSSProperties = {
  margin: '0 0 12px',
  fontSize: 16,
};

export const productRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  border: `1px solid ${KLOEL_THEME.borderPrimary}`,
  borderRadius: 6,
  padding: 12,
};

export const fieldStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
  color: KLOEL_THEME.textSecondary,
  fontSize: 13,
};

export const inputStyle: CSSProperties = {
  border: `1px solid ${KLOEL_THEME.borderPrimary}`,
  borderRadius: 6,
  background: KLOEL_THEME.bgSecondary,
  color: KLOEL_THEME.textPrimary,
  padding: '10px 12px',
};

export const textAreaStyle: CSSProperties = {
  ...inputStyle,
  width: '100%',
  resize: 'vertical',
  fontFamily: "'Sora', system-ui, sans-serif",
};
