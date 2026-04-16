'use client';

import { useProducts } from '@/hooks/useProducts';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { apiFetch } from '@/lib/api';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React, { useState, useEffect, useRef, useCallback, useMemo, startTransition } from 'react';
import { mutate } from 'swr';

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
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
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
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
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
      <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 01-.837.276c-.47-.07-.802-.48-.968-.925a2.5 2.5 0 10-3.214 3.214c.446.166.855.497.925.968a.979.979 0 01-.276.837l-1.61 1.61a2.404 2.404 0 01-1.705.707 2.402 2.402 0 01-1.704-.706l-1.568-1.568a1.026 1.026 0 00-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 11-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 00-.289-.877l-1.568-1.568A2.402 2.402 0 011.998 12c0-.617.236-1.234.706-1.704L4.315 8.685a.98.98 0 01.837-.276c.47.07.802.48.968.925a2.5 2.5 0 103.214-3.214c-.446-.166-.855-.497-.925-.968a.979.979 0 01.276-.837l1.61-1.61a2.404 2.404 0 013.409 0l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 113.237 3.237c-.464.18-.894.527-.967 1.02z" />
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
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  zap: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
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
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
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
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
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
      <path d="M7 11V7a5 5 0 0110 0v4" />
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
      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
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
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
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
      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
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
      <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
    </svg>
  ),
  send: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
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
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
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
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
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
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
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
  const colors = { online: '#10B981', offline: '#6E6E73', warning: '#F59E0B', building: '#8b5cf6' };
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

function EmptyState({
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

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <div
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          background: checked ? EMBER : BORDER,
          transition: 'all .2s',
          position: 'relative',
          padding: 2,
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            transform: checked ? 'translateX(16px)' : 'translateX(0)',
            transition: 'transform .2s',
          }}
        />
      </div>
      {label && <span style={{ fontFamily: SORA, fontSize: 12, color: TEXT }}>{label}</span>}
    </button>
  );
}

// ── NeuralPulse canvas ──
function NeuralPulse({ w, h, color = EMBER }: { w: number; h: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    let raf: number;
    let visible = true;
    const obs = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
      },
      { threshold: 0 },
    );
    obs.observe(c);
    const draw = () => {
      if (!visible) {
        raf = requestAnimationFrame(draw);
        return;
      }
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.15 + Math.sin(frame * 0.02 + i) * 0.1;
        ctx.lineWidth = 1;
        for (let x = 0; x < w; x += 2) {
          const spike = Math.random() > 0.97 ? (Math.random() - 0.5) * h * 0.6 : 0;
          const y =
            h / 2 + Math.sin(x * 0.04 + frame * 0.03 + i * 1.5) * (h * 0.25 + i * 2) + spike;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      frame++;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [w, h, color]);
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      style={{ display: 'block', opacity: 0.6, pointerEvents: 'none' }}
    />
  );
}

// ══════════════════════════════════════════
// TAB: Visao Geral
// ══════════════════════════════════════════

function VisaoGeral({ switchTab }: { switchTab: (id: string) => void }) {
  const { isMobile } = useResponsiveViewport();
  const sites = [
    {
      name: 'Landing Page Principal',
      domain: 'meusite.com.br',
      status: 'online' as const,
      views: 12450,
      uptime: 99.9,
    },
    {
      name: 'Pagina de Vendas',
      domain: 'vendas.meusite.com.br',
      status: 'online' as const,
      views: 8320,
      uptime: 99.8,
    },
    {
      name: 'Blog',
      domain: 'blog.meusite.com.br',
      status: 'building' as const,
      views: 0,
      uptime: 0,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
        }}
      >
        <Stat label="Sites Ativos" value="2" icon={IC.site} />
        <Stat label="Dominios" value="3" icon={IC.globe} />
        <Stat label="Visitas (30d)" value={Fmt(20770)} icon={IC.eye} />
        <Stat label="Uptime Medio" value="99.9%" icon={IC.server} />
        <Stat label="SSL Ativos" value="3" icon={IC.lock} />
        <Stat label="Apps Instalados" value="5" icon={IC.puzzle} />
      </div>

      {/* Neural Pulse */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${BORDER}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontFamily: SORA, fontSize: 12, color: TEXT_DIM }}>
            Trafego em tempo real
          </span>
          <Badge>LIVE</Badge>
        </div>
        <NeuralPulse w={800} h={80} />
      </Card>

      {/* Sites List */}
      <div>
        <SectionLabel>Seus Sites</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sites.map((s, i) => (
            <Card
              key={i}
              style={{
                display: 'flex',
                alignItems: isMobile ? 'flex-start' : 'center',
                flexDirection: isMobile ? 'column' : 'row',
                gap: 14,
                cursor: 'pointer',
              }}
            >
              <StatusDot status={s.status} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SORA, fontSize: 14, color: TEXT }}>{s.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>{s.domain}</div>
              </div>
              <Badge color={s.status === 'online' ? '#10B981' : '#8b5cf6'}>
                {s.status === 'online' ? 'Online' : 'Construindo'}
              </Badge>
              {s.views > 0 && (
                <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>
                  {Fmt(s.views)} visitas
                </span>
              )}
              {s.uptime > 0 && (
                <span style={{ fontFamily: MONO, fontSize: 11, color: '#10B981' }}>
                  {s.uptime}%
                </span>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <SectionLabel>Acoes Rapidas</SectionLabel>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn variant="primary" onClick={() => switchTab('criar')}>
            {IC.plus(14)} Criar Novo Site
          </Btn>
          <Btn variant="ghost" onClick={() => switchTab('dominios')}>
            {IC.globe(14)} Gerenciar Dominios
          </Btn>
          <Btn variant="ghost" onClick={() => switchTab('apps')}>
            {IC.puzzle(14)} Instalar Apps
          </Btn>
          <Btn variant="ghost" onClick={() => switchTab('protecao')}>
            {IC.shield(14)} Verificar Seguranca
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// TAB: Dominios
// ══════════════════════════════════════════

function Dominios() {
  const { isMobile } = useResponsiveViewport();
  // Domains loaded from backend when site module is connected
  const [domains] = useState<
    Array<{
      name: string;
      ssl: boolean;
      expires: string;
      status: string;
      dns: string;
      primary: boolean;
    }>
  >([]);
  const [newDomain, setNewDomain] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: EMBER }}>{IC.globe(24)}</span>
          <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>Dominios</span>
          <Badge>{domains.length} dominios</Badge>
        </div>
      </div>

      {/* Add Domain */}
      <Card>
        <SectionLabel>Adicionar Dominio</SectionLabel>
        <div style={{ display: 'flex', gap: 8, flexDirection: isMobile ? 'column' : 'row' }}>
          <Input
            value={newDomain}
            onChange={setNewDomain}
            placeholder="meunovodominio.com.br"
            style={{ flex: 1 }}
          />
          <Btn variant="primary" disabled={!newDomain.trim()} onClick={() => setNewDomain('')}>
            {IC.plus(14)} Adicionar
          </Btn>
        </div>
      </Card>

      {/* Domains Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {!isMobile && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 80px',
              gap: 0,
              padding: '10px 16px',
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            {['Dominio', 'SSL', 'DNS', 'Status', 'Expira', ''].map((h, i) => (
              <div
                key={i}
                style={{
                  fontFamily: SORA,
                  fontSize: 10,
                  color: TEXT_MUTED,
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                }}
              >
                {h}
              </div>
            ))}
          </div>
        )}
        {domains.map((d, i) =>
          isMobile ? (
            <div
              key={i}
              style={{
                padding: '14px 16px',
                borderBottom: i < domains.length - 1 ? `1px solid ${BORDER}` : 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: MONO, fontSize: 13, color: TEXT }}>{d.name}</span>
                {d.primary && <Badge color="#10B981">Principal</Badge>}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 8,
                }}
              >
                <Badge color={d.dns === 'Configurado' ? '#10B981' : '#F59E0B'}>{d.dns}</Badge>
                <Badge color={d.status === 'ativo' ? '#10B981' : '#F59E0B'}>{d.status}</Badge>
                <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>
                  SSL: {d.ssl ? 'Ativo' : 'Pendente'}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>{d.expires}</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: TEXT_DIM,
                    padding: 4,
                  }}
                >
                  {IC.edit(14)}
                </button>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#ef4444',
                    padding: 4,
                  }}
                >
                  {IC.trash(14)}
                </button>
              </div>
            </div>
          ) : (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 80px',
                gap: 0,
                padding: '12px 16px',
                borderBottom: `1px solid ${BORDER}`,
                alignItems: 'center',
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 13,
                    color: TEXT,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {d.name}
                  {d.primary && <Badge color="#10B981">Principal</Badge>}
                </div>
              </div>
              <div>
                {d.ssl ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#10B981' }}>
                    {IC.lock(12)} <span style={{ fontFamily: MONO, fontSize: 11 }}>Ativo</span>
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#F59E0B' }}>
                    {IC.alert(12)} <span style={{ fontFamily: MONO, fontSize: 11 }}>Pendente</span>
                  </span>
                )}
              </div>
              <div>
                <Badge color={d.dns === 'Configurado' ? '#10B981' : '#F59E0B'}>{d.dns}</Badge>
              </div>
              <div>
                <Badge color={d.status === 'ativo' ? '#10B981' : '#F59E0B'}>{d.status}</Badge>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>{d.expires}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: TEXT_DIM,
                    padding: 4,
                  }}
                >
                  {IC.edit(14)}
                </button>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#ef4444',
                    padding: 4,
                  }}
                >
                  {IC.trash(14)}
                </button>
              </div>
            </div>
          ),
        )}
      </Card>

      {/* DNS Instructions */}
      <Card>
        <SectionLabel>Configuracao DNS</SectionLabel>
        <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT_DIM, marginBottom: 12 }}>
          Aponte os registros DNS do seu dominio para os servidores KLOEL:
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 2fr',
            gap: 8,
          }}
        >
          {[
            { type: 'A', name: '@', value: '76.223.105.230' },
            { type: 'CNAME', name: 'www', value: 'proxy.kloel.com' },
          ].map((r, i) => (
            <React.Fragment key={i}>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: EMBER,
                  padding: '6px 10px',
                  background: BG_ELEVATED,
                  borderRadius: 4,
                }}
              >
                {r.type}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: TEXT,
                  padding: '6px 10px',
                  background: BG_ELEVATED,
                  borderRadius: 4,
                }}
              >
                {r.name}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: TEXT_DIM,
                  padding: '6px 10px',
                  background: BG_ELEVATED,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                {r.value}
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(r.value)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: TEXT_DIM,
                    padding: 2,
                  }}
                >
                  {IC.copy(12)}
                </button>
              </div>
            </React.Fragment>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════
// TAB: Hospedagem
// ══════════════════════════════════════════

function Hospedagem() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: EMBER }}>{IC.server(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>Hospedagem</span>
        <Badge color="#10B981">Plano Pro</Badge>
      </div>

      {/* Server Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        <Stat label="CPU" value="23%" sub="2 vCPUs" icon={IC.cpu} />
        <Stat label="Memoria" value="512MB" sub="de 1GB" icon={IC.server} />
        <Stat label="Armazenamento" value="2.4GB" sub="de 10GB" icon={IC.cloud} />
        <Stat label="Bandwidth" value="45GB" sub="de 100GB / mes" icon={IC.upload} />
      </div>

      {/* Usage Bars */}
      <Card>
        <SectionLabel>Uso de Recursos</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { label: 'CPU', value: 23, max: 100, color: '#10B981' },
            { label: 'Memoria RAM', value: 512, max: 1024, color: '#3B82F6' },
            { label: 'Disco', value: 2.4, max: 10, color: '#F59E0B' },
            { label: 'Bandwidth', value: 45, max: 100, color: EMBER },
          ].map((r, i) => (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: SORA, fontSize: 12, color: TEXT }}>{r.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>
                  {typeof r.value === 'number' && r.value < 100 ? r.value : r.value}
                  {r.label === 'CPU' ? '%' : r.label === 'Memoria RAM' ? 'MB' : 'GB'} / {r.max}
                  {r.label === 'CPU' ? '%' : r.label === 'Memoria RAM' ? 'MB' : 'GB'}
                </span>
              </div>
              <ProgressBar value={r.value} max={r.max} color={r.color} />
            </div>
          ))}
        </div>
      </Card>

      {/* Server Info */}
      <Card>
        <SectionLabel>Informacoes do Servidor</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Regiao', value: 'Sao Paulo (sa-east-1)' },
            { label: 'IP', value: '76.223.105.230' },
            { label: 'Runtime', value: 'Node.js 20 LTS' },
            { label: 'CDN', value: 'CloudFront (ativo)' },
            { label: 'SSL', value: "Let's Encrypt (auto-renovacao)" },
            { label: 'Backups', value: 'Diarios (7 dias retencao)' },
          ].map((info, i) => (
            <div key={i} style={{ padding: '8px 12px', background: BG_ELEVATED, borderRadius: 6 }}>
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 10,
                  color: TEXT_MUTED,
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                  marginBottom: 2,
                }}
              >
                {info.label}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: TEXT }}>{info.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Uptime */}
      <Card>
        <SectionLabel>Uptime (30 dias)</SectionLabel>
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 40 }}>
          {Array.from({ length: 30 }, (_, i) => (
            <div
              key={i}
              style={{ flex: 1, height: 40, background: '#10B981', borderRadius: 2, opacity: 0.3 }}
            />
          ))}
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 12,
            color: 'var(--app-text-secondary)',
            marginTop: 8,
            textAlign: 'center',
          }}
        >
          Dados indisponiveis — conecte seu site
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════
// TAB: Criar Site
// ══════════════════════════════════════════

const FmtMoney = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

function CriarSite({ mode }: { mode?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<'ask' | 'building' | 'editor'>('ask');
  const [prompt, setPrompt] = useState('');
  const [generatedHtml, setGeneratedHtml] = useState('');
  const [savedSiteId, setSavedSiteId] = useState<string | null>(null);
  const [siteName, setSiteName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState('');
  const [savedSites, setSavedSites] = useState<any[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { products: rawProducts } = useProducts();
  const dynamicMode = mode === 'dynamic';
  const source = searchParams?.get('source') || '';
  const productId = searchParams?.get('productId') || '';
  const productName = searchParams?.get('productName') || '';

  useEffect(() => {
    if (!dynamicMode || prompt.trim()) return;
    setPrompt(
      'Crie uma página de vendas dinâmica que adapte headline, provas e CTA conforme origem do tráfego, interesse do visitante e produto selecionado.',
    );
  }, [dynamicMode, prompt]);

  useEffect(() => {
    if (prompt.trim() || !productName) return;
    setPrompt(
      `Crie uma página de vendas para o produto ${productName}, com headline forte, provas, FAQ, CTA principal e integração natural com checkout.`,
    );
  }, [productName, prompt]);

  useEffect(() => {
    setLoadingSites(true);
    apiFetch('/kloel/site/list')
      .then((res) => {
        if (res.data?.sites) setSavedSites(res.data.sites);
      })
      .finally(() => setLoadingSites(false));
  }, []);

  const productList = useMemo(() => {
    if (!rawProducts || !Array.isArray(rawProducts)) return [];
    return (rawProducts as any[])
      .slice(0, 6)
      .map((p: any) => ({ name: p.name || p.title || 'Produto', price: p.price ?? 0 }));
  }, [rawProducts]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setError('');
    setPhase('building');
    const res = await apiFetch('/kloel/site/generate', {
      method: 'POST',
      body: { prompt: prompt.trim() },
    });
    if (res.error) {
      setError(res.error);
      setPhase('ask');
      return;
    }
    if (res.data?.html) {
      setGeneratedHtml(res.data.html);
      setSiteName(prompt.trim().slice(0, 60));
      setPhase('editor');
    } else {
      setError('Nenhum HTML foi gerado. Tente novamente.');
      setPhase('ask');
    }
  };

  const invalidateSites = () =>
    mutate((key: string) => typeof key === 'string' && key.startsWith('/kloel/site'));
  const handleSave = async () => {
    setSaving(true);
    setError('');
    if (savedSiteId) {
      const res = await apiFetch(`/kloel/site/${savedSiteId}`, {
        method: 'PUT',
        body: { name: siteName || 'Site sem titulo', htmlContent: generatedHtml },
      });
      if (res.error) setError(res.error);
      else invalidateSites();
    } else {
      const res = await apiFetch('/kloel/site/save', {
        method: 'POST',
        body: { name: siteName || 'Site sem titulo', htmlContent: generatedHtml },
      });
      if (res.error) setError(res.error);
      else {
        if (res.data?.site?.id) setSavedSiteId(res.data.site.id);
        invalidateSites();
      }
    }
    setSaving(false);
  };

  const handlePublish = async () => {
    if (!savedSiteId) {
      setSaving(true);
      setError('');
      const saveRes = await apiFetch('/kloel/site/save', {
        method: 'POST',
        body: { name: siteName || 'Site sem titulo', htmlContent: generatedHtml },
      });
      setSaving(false);
      if (saveRes.error) {
        setError(saveRes.error);
        return;
      }
      if (!saveRes.data?.site?.id) {
        setError('Erro ao salvar site antes de publicar.');
        return;
      }
      setSavedSiteId(saveRes.data.site.id);
      setPublishing(true);
      const pubRes = await apiFetch(`/kloel/site/${saveRes.data.site.id}/publish`, {
        method: 'POST',
      });
      setPublishing(false);
      if (pubRes.error) {
        setError(pubRes.error);
        return;
      }
      if (pubRes.data?.url) setPublishedUrl(pubRes.data.url);
    } else {
      setPublishing(true);
      setError('');
      const res = await apiFetch(`/kloel/site/${savedSiteId}/publish`, { method: 'POST' });
      setPublishing(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.data?.url) setPublishedUrl(res.data.url);
    }
  };

  const handleEditWithAI = async () => {
    if (!editPrompt.trim()) return;
    setEditLoading(true);
    setError('');
    const res = await apiFetch('/kloel/site/generate', {
      method: 'POST',
      body: { prompt: editPrompt.trim(), currentHtml: generatedHtml },
    });
    setEditLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.data?.html) {
      setGeneratedHtml(res.data.html);
      setEditPrompt('');
    }
  };

  const loadSavedSite = (site: any) => {
    setGeneratedHtml(site.htmlContent || '');
    setSavedSiteId(site.id);
    setSiteName(site.name || '');
    setPublishedUrl(site.published && site.slug ? `/s/${site.slug}` : '');
    setPhase('editor');
  };

  const handleDelete = async (siteId: string) => {
    const res = await apiFetch(`/kloel/site/${siteId}`, { method: 'DELETE' });
    if (!res.error) {
      setSavedSites((prev) => prev.filter((s) => s.id !== siteId));
      if (savedSiteId === siteId) {
        setSavedSiteId(null);
        setGeneratedHtml('');
        setPhase('ask');
      }
      invalidateSites();
    }
  };

  // ASK PHASE
  if (phase === 'ask')
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 400,
          gap: 20,
        }}
      >
        <div style={{ color: EMBER, opacity: 0.3 }}>{IC.globe(80)}</div>
        <div style={{ fontFamily: SORA, fontSize: 22, color: TEXT }}>Criar seu Site</div>
        <div
          style={{
            fontFamily: SORA,
            fontSize: 14,
            color: TEXT_DIM,
            maxWidth: 400,
            textAlign: 'center',
          }}
        >
          Descreva o site que voce quer e a IA vai gerar um site completo. Pronto em segundos.
        </div>
        {(source || productName) && (
          <div
            style={{
              width: '100%',
              maxWidth: 500,
              padding: '12px 16px',
              borderRadius: 6,
              border: `1px solid ${EMBER}30`,
              background: `${EMBER}10`,
            }}
          >
            <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT, marginBottom: 6 }}>
              Contexto comercial
            </div>
            <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT_DIM, lineHeight: 1.6 }}>
              {productName
                ? `Você veio de Produtos para publicar a oferta ${productName}. Gere a página, publique e depois volte para conectar checkout, URL e campanha.`
                : 'Use este editor para criar a superfície pública da sua oferta e conecte com checkout, domínio e publicação.'}
            </div>
          </div>
        )}
        {dynamicMode && (
          <div
            style={{
              width: '100%',
              maxWidth: 500,
              padding: '12px 16px',
              borderRadius: 6,
              border: `1px solid ${EMBER}40`,
              background: `${EMBER}10`,
            }}
          >
            <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT, marginBottom: 8 }}>
              Modo páginas dinâmicas
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                'Adapte headline por origem do tráfego',
                'Mostre provas por estágio de compra',
                'Troque CTA por campanha ativa',
              ].map((hint) => (
                <button
                  type="button"
                  key={hint}
                  onClick={() => setPrompt((prev) => `${prev.trim()} ${hint}.`.trim())}
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    padding: '4px 10px',
                    borderRadius: 4,
                    border: `1px solid ${BORDER}`,
                    background: BG_CARD,
                    color: TEXT,
                    cursor: 'pointer',
                  }}
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        )}
        {productList.length > 0 && (
          <div style={{ width: '100%', maxWidth: 500 }}>
            <SectionLabel>Seus Produtos (clique para incluir)</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {productList.map((p, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => setPrompt((prev) => prev + (prev ? ', ' : '') + p.name)}
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    padding: '4px 10px',
                    borderRadius: 4,
                    border: `1px solid ${BORDER}`,
                    background: BG_CARD,
                    color: TEXT,
                    cursor: 'pointer',
                  }}
                >
                  {p.name} -- {FmtMoney(p.price)}
                </button>
              ))}
            </div>
          </div>
        )}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ex: Landing page para venda de curso de marketing digital, com secao de depoimentos e botao de compra..."
          style={{
            fontFamily: SORA,
            fontSize: 14,
            width: '100%',
            maxWidth: 500,
            minHeight: 100,
            padding: 14,
            borderRadius: 6,
            border: `1px solid ${BORDER}`,
            background: BG_CARD,
            color: TEXT,
            resize: 'vertical',
            outline: 'none',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = EMBER;
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = BORDER;
          }}
        />
        <Btn variant="primary" onClick={handleGenerate} disabled={!prompt.trim()}>
          {IC.zap(16)} Gerar Site com IA
        </Btn>
        {error && (
          <div
            style={{
              fontFamily: MONO,
              fontSize: 12,
              color: '#ef4444',
              maxWidth: 500,
              textAlign: 'center',
              padding: '8px 16px',
              background: 'rgba(239,68,68,0.1)',
              borderRadius: 6,
            }}
          >
            {error}
          </div>
        )}
        {(loadingSites || savedSites.length > 0) && (
          <div style={{ width: '100%', maxWidth: 500, marginTop: 16 }}>
            <SectionLabel>Sites Salvos</SectionLabel>
            {loadingSites && (
              <div style={{ fontFamily: MONO, fontSize: 12, color: TEXT_DIM }}>Carregando...</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {savedSites.map((site) => (
                <Card
                  key={site.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    padding: '10px 14px',
                  }}
                >
                  <span
                    style={{ color: EMBER }}
                    onClick={() => loadSavedSite(site)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).click();
                      }
                    }}
                  >
                    {IC.site(16)}
                  </span>
                  <span
                    style={{
                      fontFamily: SORA,
                      fontSize: 13,
                      color: TEXT,
                      flex: 1,
                      cursor: 'pointer',
                    }}
                    onClick={() => loadSavedSite(site)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).click();
                      }
                    }}
                  >
                    {site.name || 'Site sem titulo'}
                  </span>
                  {site.published && <Badge color="#10B981">Publicado</Badge>}
                  <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_DIM }}>
                    {site.updatedAt ? new Date(site.updatedAt).toLocaleDateString('pt-BR') : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(site.id)}
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      padding: '2px 8px',
                      borderRadius: 4,
                      border: `1px solid ${BORDER}`,
                      background: 'transparent',
                      color: '#ef4444',
                      cursor: 'pointer',
                    }}
                  >
                    X
                  </button>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    );

  // BUILDING PHASE
  if (phase === 'building')
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 400,
          gap: 20,
        }}
      >
        <div style={{ color: EMBER }}>{IC.globe(60)}</div>
        <div style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>
          Gerando seu site com IA...
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: EMBER }}>
          Isso pode levar alguns segundos
        </div>
        <div
          style={{
            width: 300,
            height: 4,
            background: BORDER,
            borderRadius: 99,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              background: EMBER,
              borderRadius: 99,
              width: '100%',
              animation: 'sitesBuildPulse 1.5s ease-in-out infinite',
            }}
          />
        </div>
      </div>
    );

  // EDITOR PHASE
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Btn
            variant="ghost"
            small
            onClick={() => {
              setPhase('ask');
              setError('');
              setPublishedUrl('');
            }}
          >
            Voltar
          </Btn>
          <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>Editor do Site</span>
          {savedSiteId && (
            <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED }}>
              ID: {savedSiteId.slice(0, 8)}...
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Btn>
          <Btn variant="primary" onClick={handlePublish} disabled={publishing || saving}>
            {publishing ? 'Publicando...' : 'Publicar'}
          </Btn>
        </div>
      </div>
      {publishedUrl && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            marginBottom: 12,
            background: 'rgba(16,185,129,0.08)',
            borderRadius: 6,
            border: '1px solid rgba(16,185,129,0.2)',
          }}
        >
          <span style={{ color: '#10B981' }}>{IC.check(16)}</span>
          <span style={{ fontFamily: SORA, fontSize: 13, color: '#10B981' }}>Publicado em:</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: TEXT }}>{publishedUrl}</span>
        </div>
      )}
      {(publishedUrl || productId) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {productId && (
            <>
              <Btn
                variant="ghost"
                onClick={() =>
                  router.push(`/products/${productId}?tab=checkouts&focus=checkout-appearance`)
                }
              >
                {IC.site(14)} Voltar para Checkout
              </Btn>
              <Btn variant="ghost" onClick={() => router.push(`/products/${productId}?tab=urls`)}>
                {IC.link(14)} Conectar URL
              </Btn>
            </>
          )}
          <Btn variant="ghost" onClick={() => router.push('/sites/dominios')}>
            {IC.globe(14)} Domínios
          </Btn>
          <Btn variant="ghost" onClick={() => router.push('/sites/apps')}>
            {IC.puzzle(14)} Apps
          </Btn>
        </div>
      )}
      {error && (
        <div
          style={{
            fontFamily: MONO,
            fontSize: 12,
            color: '#ef4444',
            padding: '8px 16px',
            marginBottom: 12,
            background: 'rgba(239,68,68,0.1)',
            borderRadius: 6,
          }}
        >
          {error}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontFamily: SORA, fontSize: 12, color: TEXT_DIM }}>Nome:</span>
        <Input
          value={siteName}
          onChange={setSiteName}
          placeholder="Nome do site"
          style={{ maxWidth: 300 }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input
          value={editPrompt}
          onChange={setEditPrompt}
          placeholder="Pedir alteracao para a IA... Ex: Mude as cores para azul, adicione mais depoimentos"
        />
        <Btn
          variant="primary"
          onClick={handleEditWithAI}
          disabled={editLoading || !editPrompt.trim()}
        >
          {editLoading ? 'Editando...' : <>{IC.zap(14)} Editar com IA</>}
        </Btn>
      </div>
      <Card style={{ padding: 0, overflow: 'hidden', minHeight: 500 }}>
        <div
          style={{
            background: BG_ELEVATED,
            padding: '6px 12px',
            borderBottom: `1px solid ${BORDER}`,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
          <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED, marginLeft: 8 }}>
            Preview
          </span>
        </div>
        <iframe
          ref={iframeRef}
          srcDoc={generatedHtml}
          sandbox="allow-scripts"
          style={{ width: '100%', height: 500, border: 'none', background: '#fff' }}
          title="Site Preview"
        />
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════
// TAB: Editar Site
// ══════════════════════════════════════════

function EditarSite({ mode }: { mode?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [savedSites, setSavedSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState<any | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [variantPrompt, setVariantPrompt] = useState('');
  const [variantLoading, setVariantLoading] = useState(false);
  const [variantNotice, setVariantNotice] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const abMode = mode === 'ab';
  const productId = searchParams?.get('productId') || '';

  useEffect(() => {
    apiFetch('/kloel/site/list')
      .then((res) => {
        if (res.data?.sites) setSavedSites(res.data.sites);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleEditWithAI = async () => {
    if (!editPrompt.trim() || !selectedSite) return;
    setEditLoading(true);
    setError('');
    const res = await apiFetch('/kloel/site/generate', {
      method: 'POST',
      body: { prompt: editPrompt.trim(), currentHtml: selectedSite.htmlContent },
    });
    setEditLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.data?.html) {
      setSelectedSite({ ...selectedSite, htmlContent: res.data.html });
      setEditPrompt('');
    }
  };

  const handleSave = async () => {
    if (!selectedSite) return;
    setSaving(true);
    setError('');
    const res = await apiFetch(`/kloel/site/${selectedSite.id}`, {
      method: 'PUT',
      body: { name: selectedSite.name, htmlContent: selectedSite.htmlContent },
    });
    if (res.error) setError(res.error);
    setSaving(false);
  };

  const handleDelete = async (siteId: string) => {
    const res = await apiFetch(`/kloel/site/${siteId}`, { method: 'DELETE' });
    if (!res.error) {
      setSavedSites((prev) => prev.filter((s) => s.id !== siteId));
      if (selectedSite?.id === siteId) setSelectedSite(null);
    }
  };

  const handleCreateVariant = async () => {
    if (!selectedSite || !variantPrompt.trim()) return;
    setVariantLoading(true);
    setVariantNotice('');
    setError('');
    const genRes = await apiFetch('/kloel/site/generate', {
      method: 'POST',
      body: {
        prompt: `Crie uma variação alternativa A/B deste site mantendo a mesma oferta, mas mudando estrutura, ênfase visual e sequência de persuasão. Objetivo: ${variantPrompt.trim()}`,
        currentHtml: selectedSite.htmlContent,
      },
    });
    if (genRes.error || !genRes.data?.html) {
      setVariantLoading(false);
      setError(genRes.error || 'Falha ao gerar variante.');
      return;
    }

    const variantName = `${selectedSite.name || 'Site'} — Variante B`;
    const saveRes = await apiFetch('/kloel/site/save', {
      method: 'POST',
      body: { name: variantName, htmlContent: genRes.data.html },
    });
    setVariantLoading(false);
    if (saveRes.error || !saveRes.data?.site) {
      setError(saveRes.error || 'Falha ao salvar variante.');
      return;
    }
    const newSite = saveRes.data.site;
    setSavedSites((prev) => [newSite, ...prev]);
    setSelectedSite(newSite);
    setVariantPrompt('');
    setVariantNotice(`Variante criada: ${variantName}`);
  };

  if (!selectedSite) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: EMBER }}>{IC.edit(24)}</span>
          <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>Editar Site</span>
        </div>
        {loading ? (
          <Card style={{ padding: '20px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: EMBER }}>{IC.refresh(16)}</span>
            <div>
              <div style={{ fontFamily: SORA, fontSize: 14, color: TEXT }}>
                Carregando seus sites
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>
                Mantendo a interface estável enquanto os dados chegam.
              </div>
            </div>
          </Card>
        ) : savedSites.length === 0 ? (
          <EmptyState
            icon={IC.site}
            title="Nenhum site encontrado"
            subtitle="Crie seu primeiro site na aba 'Criar Site'"
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {savedSites.map((site) => (
              <Card
                key={site.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  cursor: 'pointer',
                  padding: '12px 16px',
                }}
              >
                <span
                  style={{ color: EMBER }}
                  onClick={() => setSelectedSite(site)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      (e.currentTarget as HTMLElement).click();
                    }
                  }}
                >
                  {IC.site(20)}
                </span>
                <div
                  style={{ flex: 1, cursor: 'pointer' }}
                  onClick={() => setSelectedSite(site)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      (e.currentTarget as HTMLElement).click();
                    }
                  }}
                >
                  <div style={{ fontFamily: SORA, fontSize: 14, color: TEXT }}>
                    {site.name || 'Site sem titulo'}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>
                    {site.updatedAt
                      ? new Date(site.updatedAt).toLocaleDateString('pt-BR')
                      : 'Sem data'}
                  </div>
                </div>
                {site.published && <Badge color="#10B981">Publicado</Badge>}
                <Btn variant="ghost" small onClick={() => setSelectedSite(site)}>
                  {IC.edit(14)} Editar
                </Btn>
                <Btn variant="danger" small onClick={() => handleDelete(site.id)}>
                  {IC.trash(14)}
                </Btn>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Btn variant="ghost" small onClick={() => setSelectedSite(null)}>
            Voltar
          </Btn>
          <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>
            {selectedSite.name || 'Site sem titulo'}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED }}>
            ID: {selectedSite.id?.slice(0, 8)}...
          </span>
        </div>
        <Btn variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Alteracoes'}
        </Btn>
      </div>
      {abMode && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: 12,
            background: `${EMBER}10`,
            borderRadius: 6,
            border: `1px solid ${EMBER}40`,
          }}
        >
          <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT, marginBottom: 8 }}>
            Modo páginas alternativas
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              value={variantPrompt}
              onChange={setVariantPrompt}
              placeholder="Ex: crie uma variante mais agressiva focada em prova social"
            />
            <Btn
              variant="primary"
              onClick={handleCreateVariant}
              disabled={variantLoading || !variantPrompt.trim()}
            >
              {variantLoading ? 'Gerando...' : 'Gerar Variante B'}
            </Btn>
          </div>
          {variantNotice && (
            <div style={{ fontFamily: MONO, fontSize: 11, color: '#10B981', marginTop: 8 }}>
              {variantNotice}
            </div>
          )}
        </div>
      )}
      {productId && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <Btn
            variant="ghost"
            onClick={() =>
              router.push(`/products/${productId}?tab=checkouts&focus=checkout-appearance`)
            }
          >
            {IC.site(14)} Voltar para Checkout
          </Btn>
          <Btn
            variant="ghost"
            onClick={() =>
              router.push(`/products/${productId}?tab=campanhas&focus=recommendations`)
            }
          >
            {IC.chart(14)} Revisar recomendações
          </Btn>
        </div>
      )}
      {error && (
        <div
          style={{
            fontFamily: MONO,
            fontSize: 12,
            color: '#ef4444',
            padding: '8px 16px',
            marginBottom: 12,
            background: 'rgba(239,68,68,0.1)',
            borderRadius: 6,
          }}
        >
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input
          value={editPrompt}
          onChange={setEditPrompt}
          placeholder="Descreva a alteracao que deseja..."
        />
        <Btn
          variant="primary"
          onClick={handleEditWithAI}
          disabled={editLoading || !editPrompt.trim()}
        >
          {editLoading ? 'Editando...' : <>{IC.zap(14)} Editar com IA</>}
        </Btn>
      </div>
      <Card style={{ padding: 0, overflow: 'hidden', minHeight: 500 }}>
        <div
          style={{
            background: BG_ELEVATED,
            padding: '6px 12px',
            borderBottom: `1px solid ${BORDER}`,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
          <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED, marginLeft: 8 }}>
            Preview
          </span>
        </div>
        <iframe
          ref={iframeRef}
          srcDoc={selectedSite.htmlContent || ''}
          sandbox="allow-scripts"
          style={{ width: '100%', height: 500, border: 'none', background: '#fff' }}
          title="Site Preview"
        />
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════
// TAB: Apps
// ══════════════════════════════════════════

function Apps() {
  // Apps loaded from backend when site app store is connected
  const [installedApps] = useState<
    Array<{ name: string; icon: any; status: string; desc: string }>
  >([]);

  // Available apps catalog — will be loaded from marketplace when connected
  const [availableApps] = useState<Array<{ name: string; icon: any; desc: string }>>([]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: EMBER }}>{IC.puzzle(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>Apps & Integracoes</span>
        <Badge>{installedApps.length} instalados</Badge>
      </div>

      {/* Installed */}
      <div>
        <SectionLabel>Apps Instalados</SectionLabel>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 10,
          }}
        >
          {installedApps.map((app, i) => (
            <Card key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: EMBER }}>{app.icon(20)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT }}>{app.name}</div>
                <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>{app.desc}</div>
              </div>
              <Badge color="#10B981">{app.status}</Badge>
            </Card>
          ))}
        </div>
      </div>

      {/* Available */}
      <div>
        <SectionLabel>Apps Disponiveis</SectionLabel>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 10,
          }}
        >
          {availableApps.map((app, i) => (
            <Card key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: TEXT_DIM }}>{app.icon(20)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT }}>{app.name}</div>
                <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>{app.desc}</div>
              </div>
              <Btn variant="ghost" small>
                {IC.plus(12)} Instalar
              </Btn>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// TAB: Protecao
// ══════════════════════════════════════════

function Protecao() {
  const [sslEnabled, setSslEnabled] = useState(true);
  const [ddosProtection, setDdosProtection] = useState(true);
  const [firewallEnabled, setFirewallEnabled] = useState(true);
  const [autoBackups, setAutoBackups] = useState(true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: EMBER }}>{IC.shield(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>Protecao & Seguranca</span>
        <Badge color="#10B981">Seguro</Badge>
      </div>

      {/* Security Score */}
      <Card style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: SORA,
            fontSize: 10,
            color: TEXT_MUTED,
            textTransform: 'uppercase',
            letterSpacing: '0.2em',
            marginBottom: 8,
          }}
        >
          Pontuacao de Seguranca
        </div>
        <div style={{ fontFamily: MONO, fontSize: 48, color: '#10B981', fontWeight: 700 }}>96</div>
        <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT_DIM }}>de 100 pontos</div>
        <div style={{ marginTop: 12, maxWidth: 300, margin: '12px auto 0' }}>
          <ProgressBar value={96} color="#10B981" />
        </div>
      </Card>

      {/* Security Settings */}
      <Card>
        <SectionLabel>Configuracoes de Seguranca</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#10B981' }}>{IC.lock(18)}</span>
              <div>
                <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT }}>SSL/TLS (HTTPS)</div>
                <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>
                  Criptografia de dados em transito
                </div>
              </div>
            </div>
            <Toggle checked={sslEnabled} onChange={setSslEnabled} />
          </div>
          <div style={{ height: 1, background: BORDER }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#3B82F6' }}>{IC.shield(18)}</span>
              <div>
                <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT }}>Protecao DDoS</div>
                <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>
                  Mitigacao de ataques distribuidos
                </div>
              </div>
            </div>
            <Toggle checked={ddosProtection} onChange={setDdosProtection} />
          </div>
          <div style={{ height: 1, background: BORDER }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#F59E0B' }}>{IC.key(18)}</span>
              <div>
                <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT }}>Firewall (WAF)</div>
                <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>
                  Bloqueio de requisicoes maliciosas
                </div>
              </div>
            </div>
            <Toggle checked={firewallEnabled} onChange={setFirewallEnabled} />
          </div>
          <div style={{ height: 1, background: BORDER }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: EMBER }}>{IC.cloud(18)}</span>
              <div>
                <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT }}>
                  Backups Automaticos
                </div>
                <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>
                  Backup diario com 7 dias de retencao
                </div>
              </div>
            </div>
            <Toggle checked={autoBackups} onChange={setAutoBackups} />
          </div>
        </div>
      </Card>

      {/* SSL Certificates */}
      <Card>
        <SectionLabel>Certificados SSL</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            {
              domain: 'meusite.com.br',
              issuer: "Let's Encrypt",
              expires: '2026-09-15',
              status: 'valido',
            },
            {
              domain: 'vendas.meusite.com.br',
              issuer: "Let's Encrypt",
              expires: '2026-09-15',
              status: 'valido',
            },
            { domain: 'blog.meusite.com.br', issuer: '--', expires: '--', status: 'pendente' },
          ].map((cert, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                background: BG_ELEVATED,
                borderRadius: 6,
              }}
            >
              <span style={{ color: cert.status === 'valido' ? '#10B981' : '#F59E0B' }}>
                {IC.lock(14)}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: TEXT }}>{cert.domain}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: TEXT_DIM }}>{cert.issuer}</div>
              </div>
              <Badge color={cert.status === 'valido' ? '#10B981' : '#F59E0B'}>{cert.status}</Badge>
              <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_DIM }}>
                {cert.expires}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent Threats */}
      <Card>
        <SectionLabel>Atividade Recente</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { time: '2 min', event: 'Requisicao bloqueada (SQL injection)', severity: 'alta' },
            { time: '15 min', event: 'Rate limit atingido - IP 192.168.1.45', severity: 'media' },
            { time: '1h', event: 'Certificado SSL renovado automaticamente', severity: 'info' },
            { time: '3h', event: 'Backup automatico concluido', severity: 'info' },
            { time: '6h', event: 'Bot crawler bloqueado', severity: 'baixa' },
          ].map((item, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                background: BG_ELEVATED,
                borderRadius: 6,
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED, width: 50 }}>
                {item.time}
              </span>
              <span style={{ fontFamily: SORA, fontSize: 12, color: TEXT, flex: 1 }}>
                {item.event}
              </span>
              <Badge
                color={
                  item.severity === 'alta'
                    ? '#ef4444'
                    : item.severity === 'media'
                      ? '#F59E0B'
                      : item.severity === 'baixa'
                        ? '#3B82F6'
                        : TEXT_DIM
                }
              >
                {item.severity}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════

export default function SitesView({ defaultTab = 'visao-geral' }: { defaultTab?: string }) {
  const { isMobile } = useResponsiveViewport();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(defaultTab);
  const prevDefault = useRef(defaultTab);
  useEffect(() => {
    if (prevDefault.current !== defaultTab) {
      setTab(defaultTab);
      prevDefault.current = defaultTab;
    }
  }, [defaultTab]);
  const mode = searchParams?.get('mode') || undefined;

  const TABS = [
    { id: 'visao-geral', label: 'Visao Geral', icon: IC.globe },
    { id: 'dominios', label: 'Dominios', icon: IC.link },
    { id: 'hospedagem', label: 'Hospedagem', icon: IC.server },
    { id: 'criar', label: 'Criar Site', icon: IC.site },
    { id: 'editar', label: 'Editar Site', icon: IC.edit },
    { id: 'apps', label: 'Apps', icon: IC.puzzle },
    { id: 'protecao', label: 'Protecao', icon: IC.shield },
  ];

  const switchTab = useCallback(
    (id: string) => {
      setTab(id);
      const nextRoute = id === 'visao-geral' ? '/sites' : `/sites/${id}`;
      if (pathname === nextRoute) return;
      startTransition(() => {
        router.push(nextRoute);
      });
    },
    [pathname, router],
  );

  return (
    <div
      style={{
        fontFamily: SORA,
        color: TEXT,
        minHeight: '100vh',
        padding: isMobile ? 16 : 24,
      }}
    >
      {/* CSS Keyframes */}
      <style>{`
        @keyframes sitesFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sitesBuildPulse { 0% { opacity: 0.3; transform: scaleX(0.3); } 50% { opacity: 1; transform: scaleX(1); } 100% { opacity: 0.3; transform: scaleX(0.3); } }
      `}</style>

      {/* Tab Navigation */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 24,
          overflowX: 'auto',
          paddingBottom: 8,
          maxWidth: 1240,
          marginInline: 'auto',
        }}
      >
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => switchTab(t.id)}
            style={{
              fontFamily: SORA,
              fontSize: isMobile ? 11 : 12,
              padding: isMobile ? '8px 12px' : '8px 14px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: tab === t.id ? `${EMBER}20` : 'transparent',
              color: tab === t.id ? EMBER : TEXT_DIM,
              transition: 'all .2s',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>{t.icon(14)}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        {/* Tab Content */}
        {tab === 'visao-geral' && <VisaoGeral switchTab={switchTab} />}
        {tab === 'dominios' && <Dominios />}
        {tab === 'hospedagem' && <Hospedagem />}
        {tab === 'criar' && <CriarSite mode={mode} />}
        {tab === 'editar' && <EditarSite mode={mode} />}
        {tab === 'apps' && <Apps />}
        {tab === 'protecao' && <Protecao />}
      </div>
    </div>
  );
}
