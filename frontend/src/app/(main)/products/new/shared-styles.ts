import { colors, typography } from '@/lib/design-tokens';
import type React from 'react';

export const monitorInput: React.CSSProperties = {
  width: '100%',
  backgroundColor: colors.background.nebula,
  border: `1px solid ${colors.border.space}`,
  borderRadius: 6,
  padding: '12px 16px',
  fontSize: 14,
  fontFamily: typography.fontFamily.sans,
  color: colors.text.starlight,
  outline: 'none',
  transition: 'border-color 150ms ease',
};

export const monitorLabel: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 600,
  fontFamily: typography.fontFamily.display,
  color: colors.text.moonlight,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
};

export const monitorCard: React.CSSProperties = {
  backgroundColor: colors.background.space,
  border: `1px solid ${colors.border.space}`,
  borderRadius: 6,
  padding: 24,
};

export const selectStyle: React.CSSProperties = {
  ...monitorInput,
  appearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235C5A6E' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 14px center',
  paddingRight: 36,
};

export function handleInputFocus(
  e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
) {
  e.target.style.borderColor = colors.accent.webb;
  e.target.style.boxShadow = 'none';
}

export function handleInputBlur(
  e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
) {
  e.target.style.borderColor = colors.border.space;
  e.target.style.boxShadow = 'none';
}

export const inputProps = {
  style: monitorInput,
  onFocus: handleInputFocus,
  onBlur: handleInputBlur,
};
