'use client';
import { colors } from '@/lib/design-tokens';

import React from 'react';
import {
  SORA,
  MONO,
  BORDER,
  BG_CARD,
  EMBER,
  TEXT,
  TEXT_DIM,
  TEXT_MUTED,
} from './SitesViewIcons';

export function Badge({ children, color = EMBER }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 10,
        padding: '2px 8px',
        borderRadius: 4,
        background: `${color}15`,
        color,
        border: `1px solid ${color}30`,
      }}
    >
      {children}
    </span>
  );
}

export function StatusDot({ status }: { status: 'online' | 'offline' | 'warning' | 'building' }) {
  const colors = {
    online: colors.semantic.success,
    offline: 'colors.text.muted',
    warning: colors.semantic.warning,
    building: '#8b5cf6',
  };
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: colors[status],
        boxShadow: status === 'online' ? `0 0 6px ${colors[status]}` : 'none',
      }}
    />
  );
}

export function Btn({
  children,
  variant = 'primary',
  onClick,
  disabled,
  small,
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'ghost' | 'danger';
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: EMBER, color: colors.text.silver, border: 'none' },
    ghost: { background: 'transparent', color: TEXT, border: `1px solid ${BORDER}` },
    danger: {
      background: 'transparent',
      color: '#ef4444',
      border: '1px solid rgba(239,68,68,0.3)',
    },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: SORA,
        fontSize: small ? 11 : 12,
        padding: small ? '4px 10px' : '8px 16px',
        borderRadius: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        fontWeight: 600,
        transition: 'all .2s',
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: BG_CARD,
        borderRadius: 8,
        border: `1px solid ${BORDER}`,
        padding: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: SORA,
        fontSize: 10,
        color: TEXT_MUTED,
        letterSpacing: '0.25em',
        textTransform: 'uppercase',
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: (s: number) => React.ReactElement;
}) {
  return (
    <Card
      style={{
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {icon && <span style={{ color: EMBER, opacity: 0.6 }}>{icon(20)}</span>}
      <div
        style={{
          fontFamily: SORA,
          fontSize: 10,
          color: TEXT_MUTED,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 22, color: TEXT, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 10, color: TEXT_DIM }}>{sub}</div>}
    </Card>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: (s: number) => React.ReactElement;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        gap: 12,
      }}
    >
      <span style={{ color: EMBER, opacity: 0.25 }}>{icon(60)}</span>
      <div style={{ fontFamily: SORA, fontSize: 16, color: TEXT }}>{title}</div>
      <div
        style={{
          fontFamily: SORA,
          fontSize: 13,
          color: TEXT_DIM,
          maxWidth: 400,
          textAlign: 'center',
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

