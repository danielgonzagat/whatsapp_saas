'use client';

import { kloelT } from '@/lib/i18n/t';
import { useProducts } from '@/hooks/useProducts';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { apiFetch } from '@/lib/api';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React, { useState, useEffect, useRef, useCallback, useMemo, startTransition } from 'react';
import { mutate } from 'swr';
import { secureRandomFloat } from '@/lib/secure-random';
import { colors } from '@/lib/design-tokens';

// ── Site item shape returned by the backend ──
interface SiteItem {
  id: string;
  name: string;
  htmlContent: string;
  updatedAt?: string;
  published?: boolean;
  slug?: string;
}

// ── Fonts ──
const SORA = "'Sora',sans-serif";
const MONO = "'JetBrains Mono',monospace";

// ── DNA Colors ──
const _BG = KLOEL_THEME.bgPrimary;
const BG_CARD = KLOEL_THEME.bgCard;
const BG_ELEVATED = KLOEL_THEME.bgSecondary;
const BORDER = KLOEL_THEME.borderPrimary;
const EMBER = KLOEL_THEME.accent;
const TEXT = KLOEL_THEME.textPrimary;
const TEXT_DIM = KLOEL_THEME.textSecondary;
const TEXT_MUTED = KLOEL_THEME.textTertiary;

// ── Icons (SVG arrow functions) ──
const IC: Record<string, (s: number) => React.ReactElement> = {
  globe: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path
        d={kloelT(
          `M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z`,
        )}
      />
    </svg>
  ),
  server: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <circle cx="6" cy="6" r="1" fill="currentColor" />
      <circle cx="6" cy="18" r="1" fill="currentColor" />
    </svg>
  ),
  site: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <line x1="2" y1="9" x2="22" y2="9" />
      <circle cx="6" cy="6" r="1" fill="currentColor" />
      <circle cx="10" cy="6" r="1" fill="currentColor" />
    </svg>
  ),
  edit: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d={kloelT(`M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7`)} />
      <path d={kloelT(`M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z`)} />
    </svg>
  ),
  puzzle: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        d={kloelT(
          `M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 01-.837.276c-.47-.07-.802-.48-.968-.925a2.5 2.5 0 10-3.214 3.214c.446.166.855.497.925.968a.979.979 0 01-.276.837l-1.61 1.61a2.404 2.404 0 01-1.705.707 2.402 2.402 0 01-1.704-.706l-1.568-1.568a1.026 1.026 0 00-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 11-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 00-.289-.877l-1.568-1.568A2.402 2.402 0 011.998 12c0-.617.236-1.234.706-1.704L4.315 8.685a.98.98 0 01.837-.276c.47.07.802.48.968.925a2.5 2.5 0 103.214-3.214c-.446-.166-.855-.497-.925-.968a.979.979 0 01.276-.837l1.61-1.61a2.404 2.404 0 013.409 0l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 113.237 3.237c-.464.18-.894.527-.967 1.02z`,
        )}
      />
    </svg>
  ),
  shield: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d={kloelT(`M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z`)} />
    </svg>
  ),
  zap: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={kloelT(`M13 2L3 14h9l-1 8 10-12h-9l1-8z`)} />
    </svg>
  ),
  check: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  plus: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  trash: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path
        d={kloelT(`M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2`)}
      />
    </svg>
  ),
  link: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d={kloelT(`M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71`)} />
      <path d={kloelT(`M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71`)} />
    </svg>
  ),
  lock: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d={kloelT(`M7 11V7a5 5 0 0110 0v4`)} />
    </svg>
  ),
  refresh: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <polyline points="23 4 23 10 17 10" />
      <path d={kloelT(`M20.49 15a9 9 0 11-2.12-9.36L23 10`)} />
    </svg>
  ),
  chart: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  eye: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d={kloelT(`M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z`)} />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  cloud: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d={kloelT(`M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z`)} />
    </svg>
  ),
  cpu: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  ),
  upload: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d={kloelT(`M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3`)} />
    </svg>
  ),
  send: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={kloelT(`M2.01 21L23 12 2.01 3 2 10l15 2-15 2z`)} />
    </svg>
  ),
  key: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        d={kloelT(
          `M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4`,
        )}
      />
    </svg>
  ),
  alert: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        d={kloelT(
          `M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z`,
        )}
      />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  copy: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d={kloelT(`M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1`)} />
    </svg>
  ),
};

// ── Helpers ──
const Fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toString());

// ══════════════════════════════════════════
// ATOMS
// ══════════════════════════════════════════

function Badge({ children, color = EMBER }: { children: React.ReactNode; color?: string }) {
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

function StatusDot({ status }: { status: 'online' | 'offline' | 'warning' | 'building' }) {
  const colors = {
    online: '#10B981',
    offline: 'colors.text.muted',
    warning: '#F59E0B',
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

function Btn({
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
    primary: { background: EMBER, color: '#fff', border: 'none' },
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

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
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

function Input({
  value,
  onChange,
  placeholder,
  style: extraStyle,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel || placeholder}
      style={{
        fontFamily: SORA,
        fontSize: 13,
        padding: '8px 14px',
        borderRadius: 6,
        border: `1px solid ${BORDER}`,
        background: BG_CARD,
        color: TEXT,
        outline: 'none',
        width: '100%',
        ...extraStyle,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = EMBER;
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = BORDER;
      }}
    />
  );
}

function ProgressBar({
  value,
  max = 100,
  color = EMBER,
}: {
  value: number;
  max?: number;
  color?: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div
      style={{ width: '100%', height: 4, background: BORDER, borderRadius: 99, overflow: 'hidden' }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: 99,
          transition: 'width .4s',
        }}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
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

function Stat({
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
