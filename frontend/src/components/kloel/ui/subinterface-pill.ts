import type React from 'react';

export const SUBINTERFACE_PILL_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  marginBottom: 24,
  overflowX: 'auto',
  paddingBottom: 8,
  maxWidth: 1240,
  marginInline: 'auto',
};

export function getSubinterfacePillStyle(
  isActive: boolean,
  isMobile: boolean,
): React.CSSProperties {
  return {
    fontFamily: "var(--font-sora), 'Sora', sans-serif",
    fontSize: isMobile ? 11 : 12,
    padding: isMobile ? '8px 12px' : '8px 14px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: isActive ? 'var(--app-accent-light)' : 'transparent',
    color: isActive ? 'var(--app-accent)' : 'var(--app-text-secondary)',
    transition: 'all .2s',
    flexShrink: 0,
  };
}
