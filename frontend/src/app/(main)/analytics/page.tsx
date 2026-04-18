'use client';

export const dynamic = 'force-dynamic';

import {
  SUBINTERFACE_PILL_ROW_STYLE,
  getSubinterfacePillStyle,
} from '@/components/kloel/ui/subinterface-pill';
import { useNps } from '@/hooks/useDetailedReports';
import { useAnalyticsStats, useReports, useSmartTime } from '@/hooks/useReports';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { sendReportEmail } from '@/lib/api/misc';
import { swrFetcher } from '@/lib/fetcher';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import useSWR from 'swr';

const PATTERN_RE = /"/g;

// ═══════════════════════════════════════════════════════════
// REPORT DATA TYPES
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// DESIGN SYSTEM — TERMINATOR
// ═══════════════════════════════════════════════════════════
const S = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";
const V = {
  void: KLOEL_THEME.bgPrimary,
  s: KLOEL_THEME.bgCard,
  e: KLOEL_THEME.bgSecondary,
  b: KLOEL_THEME.borderPrimary,
  em: KLOEL_THEME.accent,
  t: KLOEL_THEME.textPrimary,
  t2: KLOEL_THEME.textSecondary,
  t3: KLOEL_THEME.textTertiary,
  g2: '#10B981',
  bl: '#3B82F6',
  y: '#F59E0B',
  r: '#EF4444',
  p: '#8B5CF6',
  cy: '#06B6D4',
  pk: '#EC4899',
};
const R$ = (n: number) =>
  `R$ ${(n / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const Fmt = (n: number) => n.toLocaleString('pt-BR');

// ═══════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════
interface RF {
  startDate?: string;
  endDate?: string;
  product?: string;
  status?: string;
  paymentMethod?: string;
  page?: number;
  perPage?: number;
}

// Row types used by report tabs
interface ReportRowFields {
  id?: string;
  status?: string;
  totalInCents?: number;
  paymentMethod?: string;
  createdAt?: string;
  buyerName?: string;
  buyerEmail?: string;
  productName?: string;
  planName?: string;
  vendas?: number;
  receita?: number;
  comissao?: number;
  partnerName?: string;
  partnerEmail?: string;
  source?: string;
  order?: {
    totalInCents?: number;
    customerName?: string;
    orderNumber?: string;
    customerEmail?: string;
    plan?: { name?: string; product?: { name?: string } };
  };
  refundedAt?: string;
  _count?: number;
  orderNumber?: string;
  customerName?: string;
  customerEmail?: string;
  plan?: { name?: string; product?: { name?: string } };
  totalSales?: number;
  totalRevenue?: number;
  totalCommission?: number;
  amount?: number;
  nextBillingAt?: string;
}

type ReportRow = ReportRowFields & Record<string, unknown>;

// ── Response shapes for useReport ──
interface PaginatedReport {
  data: ReportRow[];
  total: number;
}

interface VendasSummary {
  totalRevenue: number;
  totalCount: number;
  ticketMedio: number;
  conversao: number;
  paidCount: number;
  totalCommission: number;
}

interface ChurnResponse {
  total: number;
  monthly: ReportRow[];
}

interface AssinaturasResponse {
  data: ReportRow[];
  total: number;
  summary: SubscriptionSummaryRow[];
}

interface MetricasResponse {
  byMethod: Record<string, number>;
  totalSales: number;
  conversao: number;
  roas: string;
  totalAdSpend: number;
}

interface ChargebackResponse {
  data: ReportRow[];
  total: number;
  monthly: ReportRow[];
}

interface SubscriptionSummaryRow {
  status: string;
  _count: number;
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color?: string;
}
function buildUrl(ep: string, f: RF = {}) {
  const p = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  });
  const qs = p.toString();
  return `/reports/${ep}${qs ? `?${qs}` : ''}`;
}
const swrOpts = { keepPreviousData: true, revalidateOnFocus: false };
function useReport<T = unknown>(ep: string, f: RF = {}) {
  return useSWR<T>(buildUrl(ep, f), swrFetcher, swrOpts);
}

// ═══════════════════════════════════════════════════════════
// ICONS (inline SVG)
// ═══════════════════════════════════════════════════════════
const IC: Record<string, (s: number) => React.ReactNode> = {
  dollar: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  ),
  users: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  trend: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  down: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      <polyline points="17 18 23 18 23 12" />
    </svg>
  ),
  chart: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  ),
  clock: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  ban: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  ),
  alert: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
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
  repeat: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 014-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 01-4 4H3" />
    </svg>
  ),
  target: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  pkg: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d="M21 8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  undo: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
    </svg>
  ),
  perc: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  ),
  dl: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  filter: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  search: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  eye: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  card: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  pix: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  file: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  phone: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  ),
  copy: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  ),
  globe: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  ),
  link: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  ),
  pie: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d="M21.21 15.89A10 10 0 118 2.83" />
      <path d="M22 12A10 10 0 0012 2v10z" />
    </svg>
  ),
};

// ═══════════════════════════════════════════════════════════
// REUSABLE COMPONENTS
// ═══════════════════════════════════════════════════════════
function NP({ color = V.em, w = 120, h = 24 }: { color?: string; w?: number; h?: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    c.width = w * 2;
    c.height = h * 2;
    ctx.scale(2, 2);
    let f = 0,
      raf: number;
    let visible = true;
    const obs = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        if (visible) {
          raf = requestAnimationFrame(draw);
        }
      },
      { threshold: 0 },
    );
    obs.observe(c);
    const draw = () => {
      if (!visible) return;
      ctx.clearRect(0, 0, w, h);
      for (let layer = 0; layer < 2; layer++) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.2 + layer * 0.2;
        for (let x = 0; x < w; x += 2) {
          const spike = Math.random() > 0.97 ? (Math.random() - 0.5) * h * 0.5 : 0;
          const y =
            h / 2 + Math.sin(x * 0.04 + f * 0.03 + layer * 1.5) * (h * 0.25 + layer * 2) + spike;
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      f++;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [color, w, h]);
  return <canvas ref={cv} style={{ width: w, height: h, display: 'block', opacity: 0.6 }} />;
}

const cs: React.CSSProperties = { background: V.s, border: `1px solid ${V.b}`, borderRadius: 8 };
const is: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: V.e,
  border: `1px solid ${V.b}`,
  borderRadius: 6,
  color: V.t,
  fontSize: 13,
  fontFamily: S,
  outline: 'none',
};
const ls: React.CSSProperties = {
  display: 'block',
  fontSize: 9,
  fontWeight: 600,
  color: V.t3,
  letterSpacing: '.1em',
  textTransform: 'uppercase' as const,
  marginBottom: 6,
  fontFamily: S,
};

function StatusDot({ color }: { color: string }) {
  return (
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: 8,
        background: color,
        flexShrink: 0,
        boxShadow: `0 0 6px ${color}40`,
      }}
    />
  );
}

function Bt({
  primary,
  accent,
  children,
  onClick,
  style: sx,
}: {
  primary?: boolean;
  accent?: string;
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 16px',
        background: primary ? V.em : accent || 'transparent',
        border: primary || accent ? 'none' : `1px solid ${V.b}`,
        borderRadius: 6,
        color: primary ? V.void : accent ? '#fff' : V.t2,
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: S,
        ...sx,
      }}
    >
      {children}
    </button>
  );
}

function MetricCard({
  title,
  value,
  sub,
  color = V.em,
  icon,
  trend,
  loading,
}: {
  title: string;
  value: string;
  sub?: string;
  color?: string;
  icon: (s: number) => React.ReactNode;
  trend?: number;
  loading?: boolean;
}) {
  if (loading)
    return (
      <div style={{ ...cs, padding: '20px 22px', flex: 1, minWidth: 180 }}>
        <NP w={160} h={28} color={color} />
      </div>
    );
  return (
    <div
      style={{
        ...cs,
        padding: '20px 22px',
        flex: 1,
        minWidth: 180,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', right: 12, top: 12, color, opacity: 0.08 }}>
        {icon(40)}
      </div>
      <span style={{ ...ls, marginBottom: 10 }}>{title}</span>
      <span
        style={{
          fontFamily: M,
          fontSize: 28,
          fontWeight: 700,
          color,
          display: 'block',
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: 11, color: V.t2, marginTop: 8, display: 'block' }}>{sub}</span>
      )}
      {trend !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10 }}>
          <span style={{ color: trend >= 0 ? V.g2 : V.r, display: 'flex' }}>
            {trend >= 0 ? IC.trend(12) : IC.down(12)}
          </span>
          <span
            style={{ fontSize: 10, color: trend >= 0 ? V.g2 : V.r, fontFamily: M, fontWeight: 600 }}
          >
            {Math.abs(trend)}%
          </span>
          <span style={{ fontSize: 9, color: V.t3 }}>vs. anterior</span>
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <NP color={color} w={140} h={16} />
      </div>
    </div>
  );
}

function TableHeader({ cols }: { cols: { l: string; w: string }[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: cols.map((c) => c.w).join(' '),
        padding: '10px 14px',
        background: V.e,
        borderBottom: `1px solid ${V.b}`,
      }}
    >
      {cols.map((h) => (
        <span
          key={h.l || 'empty'}
          style={{
            fontSize: 8,
            fontWeight: 600,
            color: V.t3,
            letterSpacing: '.08em',
            textTransform: 'uppercase' as const,
          }}
        >
          {h.l}
        </span>
      ))}
    </div>
  );
}

function Pagination({
  total,
  perPage = 10,
  page,
  setPage,
}: {
  total: number;
  perPage?: number;
  page: number;
  setPage: (p: number) => void;
}) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 14px',
        borderTop: `1px solid ${V.b}`,
      }}
    >
      <span style={{ fontSize: 10, color: V.t3, fontFamily: M }}>
        Mostrando {(page - 1) * perPage + 1} até {Math.min(page * perPage, total)} de {total}
      </span>
      <div style={{ display: 'flex', gap: 2 }}>
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((p) => (
          <button
            type="button"
            key={p}
            onClick={() => setPage(p)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 4,
              border: `1px solid ${p === page ? V.em : V.b}`,
              background: p === page ? V.em : 'transparent',
              color: p === page ? V.void : V.t2,
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: M,
            }}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function CTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: V.s,
        border: `1px solid ${V.b}`,
        borderRadius: 8,
        padding: '10px 14px',
        boxShadow: '0 8px 32px rgba(0,0,0,.6)',
      }}
    >
      <span style={{ fontSize: 10, color: V.t3, display: 'block', marginBottom: 4, fontFamily: M }}>
        {label}
      </span>
      {payload.map((p: TooltipPayloadEntry) => (
        <div
          key={p.name}
          style={{ fontSize: 12, fontFamily: M, fontWeight: 600, color: p.color || V.em }}
        >
          {p.name}:{' '}
          {typeof p.value === 'number' && p.value > 999
            ? R$(p.value)
            : typeof p.value === 'number' && p.value < 100
              ? `${p.value.toFixed(2)}%`
              : Fmt(p.value)}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ ...cs, padding: 40, textAlign: 'center' }}>
      <span style={{ color: V.t3, fontSize: 13 }}>{message}</span>
    </div>
  );
}

function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...cs, padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {children}
      </div>
    </div>
  );
}

function FilterField({
  label,
  children,
  flex = 1,
}: {
  label: string;
  children: React.ReactNode;
  flex?: number;
}) {
  return (
    <div style={{ flex, minWidth: 160 }}>
      <span style={ls}>{label}</span>
      {children}
    </div>
  );
}

function FilterDrawer({
  open,
  onClose,
  filters,
  setFilters,
}: {
  open: boolean;
  onClose: () => void;
  filters: RF;
  setFilters: (f: RF | ((prev: RF) => RF)) => void;
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,.55)',
          backdropFilter: 'blur(4px)',
        }}
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            (e.currentTarget as HTMLElement).click();
          }
        }}
      />
      <div
        style={{
          position: 'relative',
          width: 380,
          maxWidth: '90vw',
          background: V.s,
          borderLeft: `1px solid ${V.b}`,
          height: '100vh',
          overflowY: 'auto',
          padding: '28px 24px',
          animation: 'fadeIn .2s ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color: V.t }}>Filtro avançado</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: V.t3,
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <span style={ls}>Período</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                aria-label="Data inicio"
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
                style={is}
              />
              <input
                aria-label="Data fim"
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
                style={is}
              />
            </div>
          </div>
          <div>
            <span style={ls}>Código da venda</span>
            <input aria-label="Codigo da venda" placeholder="Ex: ORD-12345" style={is} />
          </div>
          <div>
            <span style={ls}>Comprador</span>
            <input aria-label="Nome do comprador" placeholder="Nome do comprador" style={is} />
          </div>
          <div>
            <span style={ls}>CPF / CNPJ</span>
            <input aria-label="CPF ou CNPJ" placeholder="000.000.000-00" style={is} />
          </div>
          <div>
            <span style={ls}>Forma de pagamento</span>
            <select
              style={is}
              value={filters.paymentMethod || ''}
              onChange={(e) => setFilters((f) => ({ ...f, paymentMethod: e.target.value }))}
            >
              <option value="">Todas</option>
              <option value="CREDIT_CARD">Cartão de crédito</option>
              <option value="PIX">Pix</option>
              <option value="BOLETO">Boleto</option>
            </select>
          </div>
          <div>
            <span style={ls}>Status</span>
            <select
              style={is}
              value={filters.status || ''}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="">Todos</option>
              <option value="PAID">Aprovado</option>
              <option value="PENDING">Pendente</option>
              <option value="PROCESSING">Processando</option>
              <option value="CANCELED">Cancelado</option>
              <option value="REFUNDED">Estornado</option>
            </select>
          </div>
          <div>
            <span style={ls}>Produto</span>
            <select
              style={is}
              value={filters.product || ''}
              onChange={(e) => setFilters((f) => ({ ...f, product: e.target.value }))}
            >
              <option value="">Todos</option>
            </select>
          </div>
          <div>
            <span style={ls}>Plano</span>
            <input aria-label="Nome do plano" placeholder="Nome do plano" style={is} />
          </div>
          <div>
            <span style={ls}>UTM Source / Medium</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input aria-label="UTM Source" placeholder="utm_source" style={is} />
              <input aria-label="UTM Medium" placeholder="utm_medium" style={is} />
            </div>
          </div>
          <div>
            <span style={ls}>Email afiliado</span>
            <input aria-label="Email do afiliado" placeholder="email@afiliado.com" style={is} />
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            {['Primeira compra', 'Recuperação', 'Upsell'].map((label) => (
              <label
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  color: V.t2,
                  cursor: 'pointer',
                }}
              >
                <input type="checkbox" style={{ accentColor: V.em }} />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
          <Bt primary onClick={onClose}>
            Aplicar filtros
          </Bt>
          <Bt onClick={onClose}>Limpar</Bt>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STATUS MAPS
// ═══════════════════════════════════════════════════════════
const stMap: Record<string, { c: string; l: string }> = {
  PAID: { c: V.g2, l: 'Aprovado' },
  PENDING: { c: V.y, l: 'Pendente' },
  PROCESSING: { c: V.bl, l: 'Processando' },
  CANCELED: { c: V.t3, l: 'Cancelado' },
  REFUNDED: { c: V.p, l: 'Estornado' },
  CHARGEBACK: { c: V.pk, l: 'Chargeback' },
  DECLINED: { c: V.r, l: 'Recusado' },
  SHIPPED: { c: V.cy, l: 'Enviado' },
  DELIVERED: { c: V.g2, l: 'Entregue' },
  ACTIVE: { c: V.g2, l: 'Ativa' },
  CANCELLED: { c: V.r, l: 'Cancelada' },
  PAST_DUE: { c: V.y, l: 'Atrasada' },
  TRIALING: { c: V.bl, l: 'Trial' },
  PAUSED: { c: V.t3, l: 'Pausada' },
  active: { c: V.g2, l: 'Ativo' },
  approved: { c: V.g2, l: 'Aprovado' },
};
const formIcon: Record<string, (s: number) => React.ReactNode> = {
  PIX: IC.pix,
  CREDIT_CARD: IC.card,
  BOLETO: IC.file,
};

// ═══════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════
const TABS = [
  { k: 'vendas', l: 'Operações', ic: IC.dollar },
  { k: 'abandonos', l: 'Abandonos', ic: IC.ban },
  { k: 'assinaturas', l: 'Assinaturas', ic: IC.repeat },
  { k: 'estornos', l: 'Estornos', ic: IC.undo },
];

const VISIBLE_REPORT_TABS = new Set(TABS.map((tab) => tab.k));

function normalizeVisibleReportTab(tab: string | null | undefined) {
  return tab && VISIBLE_REPORT_TABS.has(tab) ? tab : 'vendas';
}

// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// TAB COMPONENTS (extracted for noNestedComponentDefinitions)
// ═══════════════════════════════════════════════════════════

// ── VENDAS TAB ──
function VendasTab({
  filters,
  baseFilters,
  page,
  setPage,
  isMobile,
}: {
  filters: RF;
  baseFilters: RF;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  isMobile: boolean;
}) {
  const gid = useId();

  const { data: summary, isLoading: ls } = useReport<VendasSummary>('vendas/summary', filters);
  const { data: daily } = useReport<ReportRow[]>('vendas/daily', filters);
  const { data: vendas, isLoading: lv } = useReport<PaginatedReport>('vendas', baseFilters);
  const rows = vendas?.data || [];
  const dailyData = Array.isArray(daily) ? daily : [];

  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title="Total de operações"
          value={summary ? R$(summary.totalRevenue || 0) : '...'}
          sub={
            summary
              ? `${Fmt(summary.totalCount || 0)} operações · Ticket médio ${R$(summary.ticketMedio || 0)}`
              : ''
          }
          color={V.em}
          icon={IC.dollar}
          loading={ls}
        />
        <MetricCard
          title="Conversão"
          value={summary ? `${summary.conversao || 0}%` : '...'}
          sub={`${summary?.paidCount || 0} aprovadas`}
          color={V.bl}
          icon={IC.perc}
          loading={ls}
        />
        <MetricCard
          title="Total comissões"
          value={summary ? R$(summary.totalCommission || 0) : '...'}
          sub="Comissões do período"
          color={V.g2}
          icon={IC.users}
          loading={ls}
        />
      </div>
      {dailyData.length > 0 && (
        <div style={{ ...cs, padding: 20, marginBottom: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: V.t,
              display: 'block',
              marginBottom: 16,
            }}
          >
            Receita diária
          </span>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dailyData}>
              <defs>
                <linearGradient id={`${gid}-gR`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={V.em} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={V.em} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={V.b} vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 8, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
                tickFormatter={(v: string) => (typeof v === 'string' ? v.slice(8, 10) : '')}
              />
              <YAxis
                tick={{ fontSize: 8, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${(v / 100000).toFixed(0)}k`}
              />
              <Tooltip content={<CTooltip />} />
              <Area
                type="monotone"
                dataKey="receita"
                stroke={V.em}
                fill={`url(#${gid}-gR)`}
                strokeWidth={2}
                dot={false}
                name="Receita"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {dailyData.length > 0 && (
        <div style={{ ...cs, padding: 20, marginBottom: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: V.t,
              display: 'block',
              marginBottom: 16,
            }}
          >
            Volume de operações
          </span>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={V.b} vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 7, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
                tickFormatter={(v: string) => (typeof v === 'string' ? v.slice(8, 10) : '')}
              />
              <YAxis
                tick={{ fontSize: 8, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CTooltip />} />
              <Bar dataKey="vendas" fill={V.em} radius={[3, 3, 0, 0]} name="Operações" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 14,
          padding: '10px 16px',
          ...cs,
          flexWrap: 'wrap',
        }}
      >
        {[
          { c: V.bl, l: 'Processando' },
          { c: V.g2, l: 'Aprovado' },
          { c: V.y, l: 'Pendente' },
          { c: V.r, l: 'Frustrada' },
          { c: V.p, l: 'Estornado' },
          { c: V.t3, l: 'Cancelado' },
        ].map((s) => (
          <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <StatusDot color={s.c} />
            <span style={{ fontSize: 10, color: V.t2 }}>{s.l}</span>
          </div>
        ))}
      </div>
      <div style={{ ...cs, overflowX: isMobile ? ('auto' as const) : ('hidden' as const) }}>
        <TableHeader
          cols={[
            { l: 'Pedido', w: '0.7fr' },
            { l: 'Comprador', w: '1.4fr' },
            { l: 'Pagamento', w: '0.5fr' },
            { l: 'Pedido', w: '0.8fr' },
            { l: 'Total', w: '0.7fr' },
            { l: 'Status', w: '0.4fr' },
          ]}
        />
        {lv ? (
          <div style={{ padding: 20 }}>
            <NP w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: V.t3, fontSize: 12 }}>
            Nenhuma operação no período
          </div>
        ) : (
          rows.map((s: ReportRow, i: number) => {
            const st = stMap[s.status ?? ''] || { c: V.bl, l: s.status };
            const FI = formIcon[s.paymentMethod ?? ''] || IC.card;
            return (
              // biome-ignore lint/a11y/useSemanticElements: grid-based report layout needs role="row" without table semantics; native <tr> requires <table> ancestry not used here
              <div
                key={s.id}
                role="row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '0.7fr 1.4fr 0.5fr 0.8fr 0.7fr 0.4fr',
                  padding: '10px 14px',
                  borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = V.e;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <span style={{ fontFamily: M, fontSize: 9, color: V.t3 }}>
                  {s.orderNumber || s.id?.slice(0, 12)}
                </span>
                <div>
                  <span style={{ fontSize: 11, color: V.t, display: 'block' }}>
                    {s.customerName || '—'}
                  </span>
                  <span style={{ fontSize: 9, color: V.t3 }}>{s.customerEmail || ''}</span>
                </div>
                <span style={{ color: V.t2, display: 'flex', justifyContent: 'center' }}>
                  {FI(16)}
                </span>
                <span style={{ fontSize: 9, color: V.t2, fontFamily: M }}>
                  {s.createdAt ? new Date(s.createdAt).toLocaleDateString('pt-BR') : '—'}
                </span>
                <span style={{ fontFamily: M, fontSize: 11, fontWeight: 600, color: V.t }}>
                  {R$(s.totalInCents || 0)}
                </span>
                <StatusDot color={st.c} />
              </div>
            );
          })
        )}
        <Pagination total={vendas?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}

// ── AFTER PAY TAB ──
function AfterPayTab({
  filters,
  setFilters,
  baseFilters,
  page,
  setPage,
}: {
  filters: RF;
  setFilters: React.Dispatch<React.SetStateAction<RF>>;
  baseFilters: RF;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  const { data, isLoading } = useReport<PaginatedReport>('afterpay', baseFilters);
  const rows = data?.data || [];
  const aReceberTotal = rows.reduce((acc: number, r: ReportRow) => acc + (r.totalInCents || 0), 0);
  const atrasadasCount = rows.filter(
    (r: ReportRow) => r.status === 'PAST_DUE' || r.status === 'OVERDUE',
  ).length;
  const quitadosCount = rows.filter(
    (r: ReportRow) => r.status === 'PAID' || r.status === 'DELIVERED',
  ).length;
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title="Parcelamentos"
          value={String(data?.total || 0)}
          sub="Cartão de crédito"
          color={V.bl}
          icon={IC.clock}
          loading={isLoading}
        />
        <MetricCard
          title="A receber"
          value={R$(aReceberTotal)}
          sub="Valor total pendente"
          color={V.bl}
          icon={IC.dollar}
          loading={isLoading}
        />
        <MetricCard
          title="Parcelas atrasadas"
          value={String(atrasadasCount)}
          sub="Em atraso"
          color={V.y}
          icon={IC.alert}
          loading={isLoading}
        />
        <MetricCard
          title="Quitados"
          value={String(quitadosCount)}
          sub="Pagos integralmente"
          color={V.g2}
          icon={IC.check}
          loading={isLoading}
        />
      </div>
      <FilterBar>
        <FilterField label="Produto">
          <select
            style={is}
            value={filters.product || ''}
            onChange={(e) => setFilters((f) => ({ ...f, product: e.target.value }))}
          >
            <option value="">Todos</option>
          </select>
        </FilterField>
        <FilterField label="Status">
          <select
            style={is}
            value={filters.status || ''}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">Todos</option>
            <option value="PAID">Pago</option>
            <option value="PENDING">Pendente</option>
            <option value="PAST_DUE">Atrasado</option>
          </select>
        </FilterField>
      </FilterBar>
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 14,
          padding: '10px 16px',
          ...cs,
          flexWrap: 'wrap',
        }}
      >
        {[
          { c: V.bl, l: 'Processando' },
          { c: V.g2, l: 'Pago' },
          { c: V.y, l: 'Atrasado' },
          { c: V.r, l: 'Cancelado' },
          { c: V.t3, l: 'Pendente' },
        ].map((s) => (
          <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <StatusDot color={s.c} />
            <span style={{ fontSize: 10, color: V.t2 }}>{s.l}</span>
          </div>
        ))}
      </div>
      <div style={{ ...cs, overflow: 'hidden' }}>
        <TableHeader
          cols={[
            { l: 'Pedido', w: '0.8fr' },
            { l: 'Comprador', w: '1.4fr' },
            { l: 'Produto', w: '1fr' },
            { l: 'Valor', w: '0.7fr' },
            { l: 'Status', w: '0.4fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NP w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message="Nenhum parcelamento encontrado" />
        ) : (
          rows.map((a: ReportRow, i: number) => {
            const st = stMap[a.status ?? ''] || { c: V.t3, l: a.status };
            return (
              <div
                key={a.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '0.8fr 1.4fr 1fr 0.7fr 0.4fr',
                  padding: '12px 14px',
                  borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = V.e;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <span style={{ fontFamily: M, fontSize: 9, color: V.t3 }}>
                  {a.orderNumber || a.id?.slice(0, 12)}
                </span>
                <div>
                  <span style={{ fontSize: 11, color: V.t, display: 'block' }}>
                    {a.customerName || '—'}
                  </span>
                  <span style={{ fontSize: 9, color: V.t3 }}>{a.customerEmail}</span>
                </div>
                <span style={{ fontSize: 10, color: V.em, fontWeight: 500 }}>
                  {a.plan?.name || '—'}
                </span>
                <span style={{ fontFamily: M, fontSize: 10, fontWeight: 600, color: V.t }}>
                  {R$(a.totalInCents || 0)}
                </span>
                <StatusDot color={st.c} />
              </div>
            );
          })
        )}
        <Pagination total={data?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}

// ── CHURN TAB ──
function ChurnTab({ filters }: { filters: RF }) {
  const { data, isLoading } = useReport<ChurnResponse>('churn', filters);
  const monthly = data?.monthly || [];
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title="Cancelamentos"
          value={String(data?.total || 0)}
          sub="Período selecionado"
          color={V.r}
          icon={IC.ban}
          loading={isLoading}
        />
      </div>
      {monthly.length > 0 && (
        <div style={{ ...cs, padding: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: V.t,
              display: 'block',
              marginBottom: 16,
            }}
          >
            Evolução de cancelamentos
          </span>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke={V.b} vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CTooltip />} />
              <Bar dataKey="total" fill={V.r} radius={[3, 3, 0, 0]} name="Cancelamentos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {!isLoading && monthly.length === 0 && (
        <EmptyState message="Nenhum cancelamento no período" />
      )}
    </>
  );
}

// ── ABANDONOS TAB ──
function AbandonosTab({
  baseFilters,
  page,
  setPage,
}: {
  baseFilters: RF;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  const { data, isLoading } = useReport<PaginatedReport>('abandonos', baseFilters);
  const rows = data?.data || [];
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title="Total abandonos"
          value={String(data?.total || 0)}
          sub="Checkouts não finalizados"
          color={V.r}
          icon={IC.ban}
          loading={isLoading}
        />
      </div>
      <div style={{ ...cs, overflow: 'hidden' }}>
        <TableHeader
          cols={[
            { l: 'Comprador', w: '1.6fr' },
            { l: 'Produto', w: '1fr' },
            { l: 'Plano', w: '1fr' },
            { l: 'Valor', w: '0.7fr' },
            { l: 'Data', w: '0.8fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NP w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: V.t3, fontSize: 12 }}>
            Nenhum abandono no período
          </div>
        ) : (
          rows.map((a: ReportRow, i: number) => (
            <div
              key={a.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.6fr 1fr 1fr 0.7fr 0.8fr',
                padding: '12px 14px',
                borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = V.e;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <div>
                <span style={{ fontSize: 11, color: V.t, display: 'block', fontWeight: 500 }}>
                  {a.customerName || '—'}
                </span>
                <span style={{ fontSize: 9, color: V.t3 }}>{a.customerEmail}</span>
              </div>
              <span style={{ fontSize: 10, color: V.em, fontWeight: 500 }}>
                {a.plan?.product?.name || '—'}
              </span>
              <span style={{ fontSize: 10, color: V.t2 }}>{a.plan?.name || '—'}</span>
              <span style={{ fontFamily: M, fontSize: 10, fontWeight: 600, color: V.t }}>
                {R$(a.totalInCents || 0)}
              </span>
              <span style={{ fontFamily: M, fontSize: 9, color: V.t2 }}>
                {a.createdAt ? new Date(a.createdAt).toLocaleDateString('pt-BR') : '—'}
              </span>
            </div>
          ))
        )}
        <Pagination total={data?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}

function SatisfacaoTab() {
  const { nps, isLoading } = useNps();
  const distribution = useMemo(() => {
    const buckets = Array.from({ length: 11 }, (_, score) => ({
      score,
      total: nps.responses.filter((item) => Number(item.details?.score ?? -1) === score).length,
    }));
    return buckets;
  }, [nps.responses]);

  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title="NPS"
          value={String(nps.nps || 0)}
          sub="Net Promoter Score"
          color={V.g2}
          icon={IC.check}
          loading={isLoading}
        />
        <MetricCard
          title="Nota média"
          value={String(nps.avg || '0.0')}
          sub="Média das respostas"
          color={V.em}
          icon={IC.perc}
          loading={isLoading}
        />
        <MetricCard
          title="Respostas"
          value={String(nps.total || 0)}
          sub="Coletas registradas"
          color={V.bl}
          icon={IC.users}
          loading={isLoading}
        />
      </div>
      {!isLoading && distribution.some((item) => item.total > 0) && (
        <div style={{ ...cs, padding: 20, marginBottom: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: V.t,
              display: 'block',
              marginBottom: 16,
            }}
          >
            Distribuição de notas
          </span>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={distribution}>
              <CartesianGrid strokeDasharray="3 3" stroke={V.b} vertical={false} />
              <XAxis
                dataKey="score"
                tick={{ fontSize: 9, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CTooltip />} />
              <Bar dataKey="total" fill={V.g2} radius={[3, 3, 0, 0]} name="Respostas" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {isLoading ? (
        <div style={{ ...cs, padding: 20 }}>
          <NP w={200} h={20} />
        </div>
      ) : nps.responses.length === 0 ? (
        <EmptyState message="Nenhuma resposta de satisfação registrada ainda" />
      ) : (
        <div style={{ ...cs, overflow: 'hidden' }}>
          <TableHeader
            cols={[
              { l: 'Nota', w: '0.5fr' },
              { l: 'Comentário', w: '2fr' },
              { l: 'Pedido', w: '0.8fr' },
              { l: 'Data', w: '0.8fr' },
            ]}
          />
          {nps.responses.map((response, index) => (
            <div
              key={response.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '0.5fr 2fr 0.8fr 0.8fr',
                padding: '12px 14px',
                borderBottom: index < nps.responses.length - 1 ? `1px solid ${V.b}` : 'none',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = V.e;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span
                style={{
                  fontFamily: M,
                  fontSize: 16,
                  fontWeight: 700,
                  color:
                    Number(response.details?.score ?? 0) >= 9
                      ? V.g2
                      : Number(response.details?.score ?? 0) >= 7
                        ? V.y
                        : V.r,
                }}
              >
                {response.details?.score ?? '—'}
              </span>
              <span style={{ fontSize: 11, color: V.t }}>
                {response.details?.comment || 'Sem comentário'}
              </span>
              <span style={{ fontFamily: M, fontSize: 10, color: V.t2 }}>
                {response.details?.orderId || '—'}
              </span>
              <span style={{ fontFamily: M, fontSize: 10, color: V.t2 }}>
                {response.createdAt
                  ? new Date(response.createdAt).toLocaleDateString('pt-BR')
                  : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function EnvioRelatoriosTab({ filters, isMobile }: { filters: RF; isMobile: boolean }) {
  const [email, setEmail] = useState('');
  const [reportType, setReportType] = useState('vendas');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; message: string } | null>(null);

  const handleSendReport = async () => {
    if (!email.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const reportFilters = Object.fromEntries(
        Object.entries(filters)
          .filter(([, value]) => value !== undefined && value !== null && value !== '')
          .map(([key, value]) => [key, String(value)]),
      );
      const res = await sendReportEmail({
        email: email.trim(),
        reportType,
        period: `${filters.startDate},${filters.endDate}`,
        filters: reportFilters,
      });
      const resObj = res as unknown as Record<string, unknown>;
      if (resObj?.error) throw new Error(String(resObj.error));
      setResult({ ok: true, message: `Relatório enviado para ${email.trim()}` });
    } catch (error: unknown) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : 'Falha ao enviar relatório.',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1.1fr) minmax(280px,0.9fr)',
        gap: 16,
      }}
    >
      <div style={{ ...cs, padding: 20 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: V.t,
            display: 'block',
            marginBottom: 16,
          }}
        >
          Enviar relatório por email
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <span style={ls}>Email de destino</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="financeiro@empresa.com"
              style={is}
            />
          </div>
          <div>
            <span style={ls}>Tipo de relatório</span>
            <select value={reportType} onChange={(e) => setReportType(e.target.value)} style={is}>
              <option value="vendas">Resumo de vendas</option>
              <option value="assinaturas">Assinaturas</option>
              <option value="abandonos">Abandonos</option>
              <option value="chargeback">Chargebacks</option>
            </select>
          </div>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 6,
              background: V.e,
              border: `1px solid ${V.b}`,
              color: V.t2,
              fontSize: 12,
            }}
          >
            Período atual: {filters.startDate} até {filters.endDate}
          </div>
          <Bt primary onClick={handleSendReport} style={{ width: 'fit-content' }}>
            {IC.file(14)} {sending ? 'Enviando...' : 'Enviar relatório'}
          </Bt>
          {result && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: result.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${result.ok ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                color: result.ok ? V.g2 : V.r,
                fontFamily: M,
                fontSize: 12,
              }}
            >
              {result.message}
            </div>
          )}
        </div>
      </div>
      <div style={{ ...cs, padding: 20 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: V.t,
            display: 'block',
            marginBottom: 16,
          }}
        >
          Rotina recomendada
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            'Financeiro: receba um resumo diário de receita e pendências.',
            'Operação: acompanhe abandonos e chargebacks com o mesmo período filtrado.',
            'Comercial: use o envio recorrente para alinhar vendas, afiliados e churn.',
          ].map((item) => (
            <div
              key={item}
              style={{
                padding: '12px 14px',
                borderRadius: 6,
                background: V.e,
                border: `1px solid ${V.b}`,
                color: V.t2,
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExportacoesTab({
  setPage,
  exportReport,
  router,
  setActive,
}: {
  setPage: React.Dispatch<React.SetStateAction<number>>;
  exportReport: (tabKey: string, fileLabel?: string) => void;
  router: ReturnType<typeof useRouter>;
  setActive: React.Dispatch<React.SetStateAction<string>>;
}) {
  const reportCards = [
    { key: 'vendas', label: 'Vendas', desc: 'Resumo completo de pedidos e receita do período.' },
    {
      key: 'assinaturas',
      label: 'Assinaturas',
      desc: 'Base recorrente, status e próximas cobranças.',
    },
    { key: 'abandonos', label: 'Abandonos', desc: 'Checkouts não concluídos e valor perdido.' },
    {
      key: 'chargeback',
      label: 'Chargebacks',
      desc: 'Disputas, valores e histórico de perda/ganho.',
    },
    {
      key: 'engajamento',
      label: 'Engajamento',
      desc: 'Mensagens, contatos e performance operacional.',
    },
    {
      key: 'satisfacao',
      label: 'Satisfação',
      desc: 'NPS, comentários e visão de experiência do cliente.',
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 14,
      }}
    >
      {reportCards.map((report) => (
        <div key={report.key} style={{ ...cs, padding: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: V.t,
              display: 'block',
              marginBottom: 8,
            }}
          >
            {report.label}
          </span>
          <span
            style={{
              fontSize: 12,
              color: V.t2,
              display: 'block',
              lineHeight: 1.6,
              minHeight: 56,
            }}
          >
            {report.desc}
          </span>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Bt primary onClick={() => exportReport(report.key, report.label.toLowerCase())}>
              {IC.dl(14)} Exportar CSV
            </Bt>
            <Bt
              onClick={() => {
                setActive(report.key);
                setPage(1);
                router.replace(`/analytics?tab=${report.key}`);
              }}
            >
              {IC.eye(14)} Abrir
            </Bt>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── AFILIADOS TAB ──
function AfiliadosTab({ filters }: { filters: RF }) {
  const { data, isLoading } = useReport<ReportRow[]>('afiliados', filters);
  const rows = Array.isArray(data) ? data : [];
  return (
    <>
      <div style={{ ...cs, overflow: 'hidden' }}>
        <TableHeader
          cols={[
            { l: 'Afiliado', w: '2fr' },
            { l: 'Vendas', w: '0.8fr' },
            { l: 'Receita', w: '1fr' },
            { l: 'Comissão', w: '1fr' },
            { l: 'Status', w: '0.4fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NP w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message="Nenhum afiliado encontrado" />
        ) : (
          rows.map((a: ReportRow, i: number) => (
            <div
              key={a.id || i}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr .8fr 1fr 1fr .4fr',
                padding: '12px 14px',
                borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = V.e;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <div>
                <span style={{ fontSize: 12, fontWeight: 500, color: V.t, display: 'block' }}>
                  {a.partnerName || '—'}
                </span>
                <span style={{ fontSize: 9, color: V.t3 }}>{a.partnerEmail}</span>
              </div>
              <span style={{ fontFamily: M, fontSize: 12, color: V.bl, fontWeight: 600 }}>
                {a.totalSales || 0}
              </span>
              <span style={{ fontFamily: M, fontSize: 11, color: V.t2 }}>
                {R$((a.totalRevenue || 0) * 100)}
              </span>
              <span style={{ fontFamily: M, fontSize: 12, fontWeight: 700, color: V.em }}>
                {R$((a.totalCommission || 0) * 100)}
              </span>
              <StatusDot color={(stMap[a.status ?? ''] || { c: V.t3 }).c} />
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ── INDICADORES TAB ──
function IndicadoresTab({ filters }: { filters: RF }) {
  const { data, isLoading } = useReport<ReportRow[]>('indicadores', filters);
  const rows = Array.isArray(data) ? data : [];
  return (
    <>
      <div style={{ ...cs, overflow: 'hidden' }}>
        <TableHeader
          cols={[
            { l: 'Afiliado', w: '1.8fr' },
            { l: 'Vendas', w: '0.8fr' },
            { l: 'Receita', w: '1fr' },
            { l: 'Comissão', w: '1fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NP w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message="Nenhum indicador encontrado" />
        ) : (
          rows.map((a: ReportRow, i: number) => (
            <div
              key={a.partnerName || a.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.8fr .8fr 1fr 1fr',
                padding: '14px 14px',
                borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = V.e;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <div>
                <span style={{ fontSize: 12, fontWeight: 500, color: V.t, display: 'block' }}>
                  {a.partnerName}
                </span>
                <span style={{ fontSize: 9, color: V.t3 }}>{a.partnerEmail}</span>
              </div>
              <span style={{ fontFamily: M, fontSize: 11, color: V.t2 }}>{a.totalSales || 0}</span>
              <span style={{ fontFamily: M, fontSize: 11, color: V.g2, fontWeight: 600 }}>
                {R$((a.totalRevenue || 0) * 100)}
              </span>
              <span style={{ fontFamily: M, fontSize: 12, fontWeight: 700, color: V.em }}>
                {R$((a.totalCommission || 0) * 100)}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ── ASSINATURAS TAB ──
function AssinaturasTab({
  baseFilters,
  page,
  setPage,
}: {
  baseFilters: RF;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  const { data, isLoading } = useReport<AssinaturasResponse>('assinaturas', baseFilters);
  const rows = data?.data || [];
  const summary = data?.summary || [];
  const activeCount =
    summary.find((s: SubscriptionSummaryRow) => s.status === 'ACTIVE')?._count || 0;
  const cancelledCount =
    summary.find((s: SubscriptionSummaryRow) => s.status === 'CANCELLED')?._count || 0;
  const pastDueCount =
    summary.find((s: SubscriptionSummaryRow) => s.status === 'PAST_DUE')?._count || 0;
  const othersCount = summary
    .filter((s: SubscriptionSummaryRow) => !['ACTIVE', 'CANCELLED', 'PAST_DUE'].includes(s.status))
    .reduce((acc: number, s: SubscriptionSummaryRow) => acc + (s._count || 0), 0);
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title="Ativas"
          value={String(activeCount)}
          color={V.g2}
          icon={IC.check}
          loading={isLoading}
        />
        <MetricCard
          title="Canceladas"
          value={String(cancelledCount)}
          color={V.r}
          icon={IC.ban}
          loading={isLoading}
        />
        <MetricCard
          title="Atrasadas"
          value={String(pastDueCount)}
          color={V.y}
          icon={IC.alert}
          loading={isLoading}
        />
        <MetricCard
          title="Outros"
          value={String(othersCount)}
          color={V.t3}
          icon={IC.clock}
          loading={isLoading}
        />
      </div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 14,
          padding: '10px 16px',
          ...cs,
          flexWrap: 'wrap',
        }}
      >
        {[
          { c: V.cy, l: 'Iniciada' },
          { c: V.bl, l: 'Aguardando' },
          { c: V.g2, l: 'Ativa' },
          { c: V.y, l: 'Atrasada' },
          { c: V.r, l: 'Cancelada' },
          { c: V.t3, l: 'Inativa' },
        ].map((s) => (
          <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <StatusDot color={s.c} />
            <span style={{ fontSize: 10, color: V.t2 }}>{s.l}</span>
          </div>
        ))}
      </div>
      <div style={{ ...cs, overflow: 'hidden' }}>
        <TableHeader
          cols={[
            { l: 'Assinante', w: '1.8fr' },
            { l: 'Produto', w: '1fr' },
            { l: 'Valor', w: '0.7fr' },
            { l: 'Próx. Cobrança', w: '0.9fr' },
            { l: 'Status', w: '0.4fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NP w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message="Nenhuma assinatura encontrada" />
        ) : (
          rows.map((s: ReportRow, i: number) => {
            const st = stMap[s.status ?? ''] || { c: V.t3, l: s.status };
            return (
              <div
                key={s.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.8fr 1fr .7fr .9fr .4fr',
                  padding: '12px 14px',
                  borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = V.e;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div>
                  <span style={{ fontSize: 11, color: V.t, display: 'block' }}>
                    {s.customerName}
                  </span>
                  <span style={{ fontSize: 9, color: V.t3 }}>{s.customerEmail}</span>
                </div>
                <span style={{ fontSize: 11, color: V.em }}>{s.planName || '—'}</span>
                <span style={{ fontFamily: M, fontSize: 10, fontWeight: 600, color: V.t }}>
                  {R$(s.amount || 0)}
                </span>
                <span style={{ fontFamily: M, fontSize: 10, color: V.t2 }}>
                  {s.nextBillingAt ? new Date(s.nextBillingAt).toLocaleDateString('pt-BR') : '—'}
                </span>
                <StatusDot color={st.c} />
              </div>
            );
          })
        )}
        <Pagination total={data?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}

// ── INDICADORES PRODUTO TAB ──
function IndProdTab({ filters }: { filters: RF }) {
  const { data, isLoading } = useReport<ReportRow[]>('indicadores-produto', filters);
  const rows = Array.isArray(data) ? data : [];
  return (
    <>
      {rows.length > 0 ? (
        <div style={{ ...cs, padding: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: V.t,
              display: 'block',
              marginBottom: 16,
            }}
          >
            Vendas por dia
          </span>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke={V.b} vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 7, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
                tickFormatter={(v: string) => (typeof v === 'string' ? v.slice(8, 10) : '')}
              />
              <YAxis
                tick={{ fontSize: 8, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CTooltip />} />
              <Bar dataKey="vendas" fill={V.p} radius={[3, 3, 0, 0]} name="Vendas" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : isLoading ? (
        <div style={{ ...cs, padding: 20 }}>
          <NP w={200} h={20} />
        </div>
      ) : (
        <EmptyState message="Selecione um produto para ver indicadores" />
      )}
    </>
  );
}

// ── RECUSA TAB ──
function RecusaTab({
  baseFilters,
  page,
  setPage,
}: {
  baseFilters: RF;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  const { data, isLoading } = useReport<PaginatedReport>('recusa', baseFilters);
  const rows = data?.data || [];
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        <MetricCard
          title="Total recusas"
          value={String(data?.total || 0)}
          sub="No período"
          color={V.r}
          icon={IC.alert}
          loading={isLoading}
        />
      </div>
      <div style={{ ...cs, overflow: 'hidden' }}>
        <TableHeader
          cols={[
            { l: 'Pedido', w: '0.7fr' },
            { l: 'Comprador', w: '1.3fr' },
            { l: 'Produto', w: '1fr' },
            { l: 'Data', w: '0.8fr' },
            { l: 'Status', w: '0.4fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NP w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message="Nenhuma recusa no período" />
        ) : (
          rows.map((r: ReportRow, i: number) => (
            // biome-ignore lint/a11y/noStaticElementInteractions: hover handlers are purely decorative; row has no click behavior
            <div
              key={r.id || i}
              style={{
                display: 'grid',
                gridTemplateColumns: '0.7fr 1.3fr 1fr 0.8fr .4fr',
                padding: '12px 14px',
                borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = V.e;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ fontFamily: M, fontSize: 10, color: V.t2 }}>
                {r.order?.orderNumber || r.id?.slice(0, 10)}
              </span>
              <div>
                <span style={{ fontSize: 11, color: V.t, display: 'block' }}>
                  {r.order?.customerName}
                </span>
                <span style={{ fontSize: 9, color: V.t3 }}>{r.order?.customerEmail}</span>
              </div>
              <span style={{ fontSize: 10, color: V.em, fontWeight: 500 }}>
                {r.order?.plan?.product?.name || '—'}
              </span>
              <span style={{ fontFamily: M, fontSize: 9, color: V.t2 }}>
                {r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR') : '—'}
              </span>
              <StatusDot color={V.r} />
            </div>
          ))
        )}
        <Pagination total={data?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}

// ── ORIGEM TAB ──
function OrigemTab({ filters }: { filters: RF }) {
  const { data, isLoading } = useReport<ReportRow[]>('origem', filters);
  const rows = Array.isArray(data) ? data : [];
  const PIE_COLORS = [V.em, V.bl, V.p, V.g2, V.y, V.cy, V.pk, V.r, V.t3];
  const totalVendas = rows.reduce((s: number, r: ReportRow) => s + (Number(r.vendas) || 0), 0);
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        <MetricCard
          title="Total vendas rastreadas"
          value={Fmt(totalVendas)}
          color={V.em}
          icon={IC.globe}
          loading={isLoading}
        />
        <MetricCard
          title="Fontes ativas"
          value={String(rows.length)}
          color={V.bl}
          icon={IC.link}
          loading={isLoading}
        />
      </div>
      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <div style={{ ...cs, padding: 20, flex: 1.5 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: V.t,
                display: 'block',
                marginBottom: 16,
              }}
            >
              Vendas por origem
            </span>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={rows.map((d: ReportRow) => ({
                  name:
                    (d.source || '').length > 16 ? `${(d.source || '').slice(0, 14)}...` : d.source,
                  vendas: d.vendas,
                }))}
                layout="vertical"
                margin={{ left: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={V.b} horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 8, fill: V.t3, fontFamily: M }}
                  stroke={V.b}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 9, fill: V.t2, fontFamily: S }}
                  stroke={V.b}
                  tickLine={false}
                  width={100}
                />
                <Tooltip content={<CTooltip />} />
                <Bar dataKey="vendas" fill={V.em} radius={[0, 4, 4, 0]} name="Vendas" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ ...cs, padding: 20, flex: 1 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: V.t,
                display: 'block',
                marginBottom: 16,
              }}
            >
              Distribuição
            </span>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={rows.map((d: ReportRow) => ({ name: d.source, value: d.vendas }))}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  dataKey="value"
                  stroke={V.void}
                  strokeWidth={2}
                >
                  {rows.map((r: ReportRow, i: number) => (
                    <Cell key={r.source || `cell-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {!isLoading && rows.length === 0 && <EmptyState message="Nenhuma venda paga no período" />}
      {rows.length > 0 && (
        <div style={{ ...cs, overflow: 'hidden' }}>
          <TableHeader
            cols={[
              { l: 'Fonte', w: '1.5fr' },
              { l: 'Vendas', w: '0.6fr' },
              { l: 'Receita', w: '1fr' },
              { l: '% Total', w: '1fr' },
            ]}
          />
          {rows.map((o: ReportRow, i: number) => {
            const perc = totalVendas > 0 ? ((o.vendas ?? 0) / totalVendas) * 100 : 0;
            return (
              <div
                key={o.source}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 0.6fr 1fr 1fr',
                  padding: '12px 14px',
                  borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = V.e;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 8,
                      background: PIE_COLORS[i % PIE_COLORS.length],
                    }}
                  />
                  <span style={{ fontSize: 12, color: V.t, fontWeight: 500 }}>{o.source}</span>
                </div>
                <span style={{ fontFamily: M, fontSize: 12, color: V.bl, fontWeight: 600 }}>
                  {Fmt(o.vendas ?? 0)}
                </span>
                <span style={{ fontFamily: M, fontSize: 11, color: V.t2 }}>
                  {R$(o.receita || 0)}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 5,
                      background: V.e,
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${perc}%`,
                        height: '100%',
                        background: PIE_COLORS[i % PIE_COLORS.length],
                        borderRadius: 3,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontFamily: M,
                      fontSize: 11,
                      fontWeight: 700,
                      color: V.em,
                      minWidth: 44,
                      textAlign: 'right',
                    }}
                  >
                    {perc.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── MÉTRICAS TAB ──
function MetricasTab({ filters }: { filters: RF }) {
  const { data, isLoading } = useReport<MetricasResponse>('metricas', filters);
  const methods = data?.byMethod || {};
  const total = data?.totalSales || 0;
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title="Total vendas"
          value={Fmt(total)}
          color={V.em}
          icon={IC.chart}
          loading={isLoading}
        />
        <MetricCard
          title="Conversão"
          value={`${data?.conversao || 0}%`}
          color={V.g2}
          icon={IC.perc}
          loading={isLoading}
        />
        <MetricCard
          title="ROAS"
          value={data?.roas ? `${data.roas}x` : '\u2014'}
          sub={
            data?.totalAdSpend
              ? `Ad spend: ${R$(data.totalAdSpend)}`
              : 'Registre gastos com an\u00FAncios'
          }
          color={
            data?.roas && Number.parseFloat(data.roas) >= 3
              ? V.g2
              : data?.roas && Number.parseFloat(data.roas) >= 1.5
                ? V.y
                : V.r
          }
          icon={IC.target}
          loading={isLoading}
        />
      </div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        {[
          { l: 'Cartão', v: methods.CREDIT_CARD || 0, c: V.g2 },
          { l: 'Pix', v: methods.PIX || 0, c: V.bl },
          { l: 'Boleto', v: methods.BOLETO || 0, c: V.y },
        ].map((m) => (
          <div key={m.l} style={{ ...cs, padding: 16, flex: 1 }}>
            <span style={{ fontSize: 11, color: V.t2, display: 'block' }}>{m.l}</span>
            <span
              style={{
                fontFamily: M,
                fontSize: 28,
                fontWeight: 700,
                color: m.c,
                display: 'block',
                marginTop: 4,
              }}
            >
              {Fmt(m.v)}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <div
                style={{
                  flex: 1,
                  height: 4,
                  background: V.e,
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${total > 0 ? (m.v / total) * 100 : 0}%`,
                    height: '100%',
                    background: m.c,
                    borderRadius: 2,
                  }}
                />
              </div>
              <span style={{ fontSize: 10, color: V.t3 }}>
                {total > 0 ? ((m.v / total) * 100).toFixed(1) : 0}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ── ESTORNOS TAB ──
function EstornosTab({
  filters,
  setFilters,
  baseFilters,
  page,
  setPage,
}: {
  filters: RF;
  setFilters: React.Dispatch<React.SetStateAction<RF>>;
  baseFilters: RF;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  const { data, isLoading } = useReport<PaginatedReport>('estornos', baseFilters);
  const rows = data?.data || [];
  const valorEstornado = rows.reduce(
    (acc: number, r: ReportRow) => acc + (Number(r.totalInCents) || 0),
    0,
  );
  const processandoCount = rows.filter(
    (r: ReportRow) => r.status === 'PROCESSING' || r.status === 'PENDING',
  ).length;
  const negadosCount = rows.filter(
    (r: ReportRow) => r.status === 'DECLINED' || r.status === 'DENIED',
  ).length;
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title="Total estornos"
          value={String(data?.total || 0)}
          sub="No período"
          color={V.r}
          icon={IC.undo}
          loading={isLoading}
        />
        <MetricCard
          title="Valor estornado"
          value={R$(valorEstornado)}
          sub="Soma dos estornos"
          color={V.p}
          icon={IC.dollar}
          loading={isLoading}
        />
        <MetricCard
          title="Processando"
          value={String(processandoCount)}
          sub="Em andamento"
          color={V.bl}
          icon={IC.clock}
          loading={isLoading}
        />
        <MetricCard
          title="Negados"
          value={String(negadosCount)}
          sub="Estornos negados"
          color={V.y}
          icon={IC.ban}
          loading={isLoading}
        />
      </div>
      <FilterBar>
        <FilterField label="Produto">
          <select
            style={is}
            value={filters.product || ''}
            onChange={(e) => setFilters((f) => ({ ...f, product: e.target.value }))}
          >
            <option value="">Todos</option>
          </select>
        </FilterField>
        <FilterField label="Status">
          <select
            style={is}
            value={filters.status || ''}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">Todos</option>
            <option value="REFUNDED">Estornado</option>
            <option value="PROCESSING">Processando</option>
            <option value="DECLINED">Negado</option>
          </select>
        </FilterField>
      </FilterBar>
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 14,
          padding: '10px 16px',
          ...cs,
          flexWrap: 'wrap',
        }}
      >
        {[
          { c: V.bl, l: 'Processando' },
          { c: V.p, l: 'Estornado' },
          { c: V.y, l: 'Negado' },
          { c: V.r, l: 'Cancelado' },
        ].map((s) => (
          <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <StatusDot color={s.c} />
            <span style={{ fontSize: 10, color: V.t2 }}>{s.l}</span>
          </div>
        ))}
      </div>
      <div style={{ ...cs, overflow: 'hidden' }}>
        <TableHeader
          cols={[
            { l: 'Pedido', w: '0.7fr' },
            { l: 'Comprador', w: '1.4fr' },
            { l: 'Produto', w: '1fr' },
            { l: 'Valor', w: '0.7fr' },
            { l: 'Data', w: '0.8fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NP w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message="Nenhum estorno no período" />
        ) : (
          rows.map((e: ReportRow, i: number) => (
            <div
              key={e.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '0.7fr 1.4fr 1fr 0.7fr 0.8fr',
                padding: '12px 14px',
                borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                alignItems: 'center',
              }}
              onMouseEnter={(el) => {
                el.currentTarget.style.background = V.e;
              }}
              onMouseLeave={(el) => {
                el.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ fontFamily: M, fontSize: 9, color: V.t3 }}>
                {e.orderNumber || e.id?.slice(0, 12)}
              </span>
              <div>
                <span style={{ fontSize: 11, color: V.t, display: 'block' }}>{e.customerName}</span>
                <span style={{ fontSize: 9, color: V.t3 }}>{e.customerEmail}</span>
              </div>
              <span style={{ fontSize: 10, color: V.em, fontWeight: 500 }}>
                {e.plan?.product?.name || '—'}
              </span>
              <span style={{ fontFamily: M, fontSize: 11, fontWeight: 600, color: V.r }}>
                {R$(e.totalInCents || 0)}
              </span>
              <span style={{ fontFamily: M, fontSize: 10, color: V.t2 }}>
                {e.refundedAt ? new Date(String(e.refundedAt)).toLocaleDateString('pt-BR') : '—'}
              </span>
            </div>
          ))
        )}
        <Pagination total={data?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}

// ── CHARGEBACK TAB ──
function ChargebackTab({
  baseFilters,
  page,
  setPage,
}: {
  baseFilters: RF;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  const { data, isLoading } = useReport<ChargebackResponse>('chargeback', baseFilters);
  const rows = data?.data || [];
  const totalChargebackValue = rows.reduce(
    (acc: number, c: ReportRow) => acc + (Number(c.order?.totalInCents) || 0),
    0,
  );
  const ganhos = rows.filter(
    (c: ReportRow) => c.status === 'WON' || c.status === 'RESOLVED',
  ).length;
  const taxaMedia =
    rows.length > 0 ? (totalChargebackValue / rows.length / 100).toFixed(2) : '0.00';
  const monthly = data?.monthly || [];
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title="Ganhos cartão"
          value={String(ganhos)}
          sub="Disputas ganhas"
          color={V.g2}
          icon={IC.check}
          loading={isLoading}
        />
        <MetricCard
          title="Total chargebacks"
          value={String(data?.total || 0)}
          sub="Disputas"
          color={V.pk}
          icon={IC.ban}
          loading={isLoading}
        />
        <MetricCard
          title="Taxa média"
          value={`R$ ${taxaMedia}`}
          sub="Valor médio por disputa"
          color={V.y}
          icon={IC.perc}
          loading={isLoading}
        />
      </div>
      {monthly.length > 0 && (
        <div style={{ ...cs, padding: 20, marginBottom: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: V.t,
              display: 'block',
              marginBottom: 16,
            }}
          >
            Ganhos vs Chargebacks
          </span>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke={V.b} vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 9, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CTooltip />} />
              <Bar dataKey="ganhos" fill={V.g2} radius={[3, 3, 0, 0]} name="Ganhos" />
              <Bar dataKey="chargebacks" fill={V.pk} radius={[3, 3, 0, 0]} name="Chargebacks" />
              <Line
                type="monotone"
                dataKey="taxa"
                stroke={V.y}
                strokeWidth={2}
                dot={{ fill: V.y, r: 3 }}
                name="Taxa %"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 14,
          padding: '10px 16px',
          ...cs,
          flexWrap: 'wrap',
        }}
      >
        {[
          { c: V.g2, l: 'Ganho' },
          { c: V.pk, l: 'Chargeback' },
          { c: V.y, l: 'Em disputa' },
          { c: V.r, l: 'Perdido' },
        ].map((s) => (
          <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <StatusDot color={s.c} />
            <span style={{ fontSize: 10, color: V.t2 }}>{s.l}</span>
          </div>
        ))}
      </div>
      <div style={{ ...cs, overflow: 'hidden' }}>
        <TableHeader
          cols={[
            { l: 'Comprador', w: '1.4fr' },
            { l: 'Valor', w: '0.7fr' },
            { l: 'Data', w: '0.8fr' },
            { l: 'Status', w: '0.4fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NP w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message="Nenhum chargeback encontrado" />
        ) : (
          rows.map((c: ReportRow, i: number) => (
            <div
              key={c.id || i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 0.7fr 0.8fr .4fr',
                padding: '12px 14px',
                borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = V.e;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ fontSize: 11, color: V.t }}>{c.order?.customerName || '—'}</span>
              <span style={{ fontFamily: M, fontSize: 11, fontWeight: 600, color: V.pk }}>
                {R$(c.order?.totalInCents || 0)}
              </span>
              <span style={{ fontFamily: M, fontSize: 10, color: V.t2 }}>
                {c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR') : '—'}
              </span>
              <StatusDot color={V.pk} />
            </div>
          ))
        )}
        <Pagination total={data?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}

// ── ENGAJAMENTO TAB — smart-time + analytics/stats + analytics/reports ──
function EngajamentoTab({ filters }: { filters: RF }) {
  const { smartTime, isLoading: stLoading } = useSmartTime();
  const { stats, isLoading: statsLoading } = useAnalyticsStats();
  const { report, isLoading: rLoading } = useReports(
    filters.startDate && filters.endDate ? `custom:${filters.startDate}:${filters.endDate}` : '30d',
  );

  const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title="Mensagens enviadas"
          value={statsLoading ? '...' : Fmt(stats?.messages || 0)}
          sub={`${Fmt(stats?.contacts || 0)} contatos ativos`}
          color={V.bl}
          icon={IC.phone}
          loading={statsLoading}
        />
        <MetricCard
          title="Taxa de entrega"
          value={statsLoading ? '...' : `${(stats?.deliveryRate || 0).toFixed(1)}%`}
          sub={`Leitura: ${(stats?.readRate || 0).toFixed(1)}%`}
          color={V.g2}
          icon={IC.check}
          loading={statsLoading}
        />
        <MetricCard
          title="Flows ativos"
          value={statsLoading ? '...' : Fmt(stats?.flows || 0)}
          sub={`${Fmt(stats?.flowCompleted || 0)} concluídos`}
          color={V.em}
          icon={IC.chart}
          loading={statsLoading}
        />
        <MetricCard
          title="Melhor horário"
          value={stLoading ? '...' : smartTime ? `${smartTime.peakHour}h` : '--'}
          sub={
            stLoading
              ? ''
              : smartTime
                ? `Melhor dia: ${DAYS[new Date(smartTime.peakDay || '').getDay()] || smartTime.peakDay}`
                : 'Sem dados suficientes'
          }
          color={V.y}
          icon={IC.clock}
          loading={stLoading}
        />
      </div>

      {/* Smart Time Heatmap */}
      {!stLoading && smartTime && smartTime.heatmap && smartTime.heatmap.length > 0 && (
        <div style={{ ...cs, padding: 20, marginBottom: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: V.t,
              display: 'block',
              marginBottom: 4,
            }}
          >
            Melhor horário para envio
          </span>
          <span style={{ fontSize: 10, color: V.t3, display: 'block', marginBottom: 16 }}>
            Baseado no histórico de respostas do seu workspace
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(24, 1fr)`, gap: 2 }}>
            <div />
            {HOURS.map((h) => (
              <span
                key={h}
                style={{ fontSize: 7, color: V.t3, textAlign: 'center', fontFamily: M }}
              >
                {h}h
              </span>
            ))}
            {DAYS.map((day) => (
              <React.Fragment key={day}>
                <span
                  style={{
                    fontSize: 9,
                    color: V.t2,
                    display: 'flex',
                    alignItems: 'center',
                    fontFamily: M,
                  }}
                >
                  {day}
                </span>
                {HOURS.map((h) => {
                  const cell = smartTime.heatmap.find((c) => c.day === day && c.hour === h);
                  const score = cell?.score || 0;
                  const opacity = Math.min(score, 1);
                  return (
                    <div
                      key={`${day}-${h}`}
                      title={`${day} ${h}h — score: ${(score * 100).toFixed(0)}%`}
                      style={{
                        height: 16,
                        borderRadius: 2,
                        background: score > 0 ? V.em : V.b,
                        opacity: score > 0 ? 0.2 + opacity * 0.8 : 0.3,
                      }}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 9, color: V.t3 }}>Menos ativo</span>
            {[0.2, 0.4, 0.6, 0.8, 1].map((o) => (
              <div
                key={o}
                style={{ width: 16, height: 10, borderRadius: 2, background: V.em, opacity: o }}
              />
            ))}
            <span style={{ fontSize: 9, color: V.t3 }}>Mais ativo</span>
          </div>
        </div>
      )}
      {!stLoading && !smartTime && (
        <EmptyState message="Dados de melhor horário indisponíveis. Envie mais mensagens para gerar análise." />
      )}

      {/* Full report from analytics/reports */}
      {!rLoading && report && (
        <div style={{ ...cs, padding: 20, marginBottom: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: V.t,
              display: 'block',
              marginBottom: 16,
            }}
          >
            Resumo do período
          </span>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            {[
              { l: 'Mensagens', v: report?.messages?.total || report?.messages || 0 },
              { l: 'Leads novos', v: report?.leads?.newContacts || 0 },
              { l: 'Flows executados', v: report?.flows?.executions || 0 },
              { l: 'Flows concluidos', v: report?.flows?.completed || 0 },
              {
                l: 'Receita (vendas)',
                v: report?.sales?.revenue ? R$(report.sales.revenue) : '--',
              },
            ].map((item) => (
              <div key={item.l} style={{ background: V.e, borderRadius: 6, padding: '14px 16px' }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: V.t3,
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  {item.l}
                </span>
                <span style={{ fontFamily: M, fontSize: 18, fontWeight: 700, color: V.em }}>
                  {typeof item.v === 'number' ? Fmt(item.v) : item.v}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sentiment & Lead Score from stats */}
      {!statsLoading && stats && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {stats.sentiment && (
            <div style={{ ...cs, padding: 20, flex: 1, minWidth: 240 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: V.t,
                  display: 'block',
                  marginBottom: 16,
                }}
              >
                Sentimento das conversas
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { l: 'Positivo', v: stats.sentiment.positive, c: V.g2 },
                  { l: 'Neutro', v: stats.sentiment.neutral, c: V.y },
                  { l: 'Negativo', v: stats.sentiment.negative, c: V.r },
                ].map((s) => (
                  <div key={s.l} style={{ flex: 1, textAlign: 'center' }}>
                    <span
                      style={{
                        fontFamily: M,
                        fontSize: 22,
                        fontWeight: 700,
                        color: s.c,
                        display: 'block',
                      }}
                    >
                      {s.v}
                    </span>
                    <span style={{ fontSize: 10, color: V.t3 }}>{s.l}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stats.leadScore && (
            <div style={{ ...cs, padding: 20, flex: 1, minWidth: 240 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: V.t,
                  display: 'block',
                  marginBottom: 16,
                }}
              >
                Score dos leads
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { l: 'Alto', v: stats.leadScore.high, c: V.em },
                  { l: 'Medio', v: stats.leadScore.medium, c: V.y },
                  { l: 'Baixo', v: stats.leadScore.low, c: V.t3 },
                ].map((s) => (
                  <div key={s.l} style={{ flex: 1, textAlign: 'center' }}>
                    <span
                      style={{
                        fontFamily: M,
                        fontSize: 22,
                        fontWeight: 700,
                        color: s.c,
                        display: 'block',
                      }}
                    >
                      {s.v}
                    </span>
                    <span style={{ fontSize: 10, color: V.t3 }}>{s.l}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function KloelRelatorio() {
  const { isMobile } = useResponsiveViewport();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get('tab');
  const [active, setActive] = useState(normalizeVisibleReportTab(tabParam));

  // Sync tab from URL params (when navigating from sidebar)
  useEffect(() => {
    const nextTab = normalizeVisibleReportTab(tabParam);
    if (nextTab !== active) {
      setActive(nextTab);
    }
    if (tabParam && !VISIBLE_REPORT_TABS.has(tabParam)) {
      router.replace('/analytics?tab=vendas');
    }
  }, [active, router, tabParam]);
  const [page, setPage] = useState(1);
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState<RF>({
    startDate: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  const baseFilters = { ...filters, page, perPage: 10 };

  const resolveExportEndpoint = useCallback((tabKey: string) => {
    const map: Record<string, string | null> = {
      vendas: 'vendas',
      afterpay: 'afterpay',
      churn: 'churn',
      abandonos: 'abandonos',
      satisfacao: 'nps',
      afiliados: 'afiliados',
      indicadores: 'indicadores',
      assinaturas: 'assinaturas',
      ind_prod: 'indicadores-produto',
      recusa: 'recusa',
      origem: 'origem',
      metricas: 'metricas',
      estornos: 'estornos',
      chargeback: 'chargeback',
      engajamento: 'engajamento',
      envio: null,
      exportacoes: null,
    };
    return map[tabKey] ?? null;
  }, []);

  const exportReport = useCallback(
    (tabKey: string, fileLabel?: string) => {
      const ep = resolveExportEndpoint(tabKey);
      if (!ep) return;
      const url = buildUrl(ep, { ...filters, perPage: 1000 });
      swrFetcher(url)
        .then((data: unknown) => {
          const rows: ReportRow[] = Array.isArray(data)
            ? (data as ReportRow[])
            : ep === 'nps'
              ? ((data as Record<string, unknown>)?.responses as ReportRow[]) || []
              : ((data as Record<string, unknown>)?.data as ReportRow[]) || [];
          if (rows.length === 0) {
            return;
          }
          const headers = Object.keys(rows[0]);
          const csv = [
            headers.join(','),
            ...rows.map((row: ReportRow) =>
              headers
                .map((h) => {
                  const val = row[h];
                  if (val === null || val === undefined) return '';
                  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
                  return str.includes(',') || str.includes('"')
                    ? `"${str.replace(PATTERN_RE, '""')}"`
                    : str;
                })
                .join(','),
            ),
          ].join('\n');
          const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
          const csvUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = csvUrl;
          a.download = `kloel-${fileLabel || tabKey}-${new Date().toISOString().slice(0, 10)}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(csvUrl);
        })
        .catch(() => console.error('Export failed'));
    },
    [filters, resolveExportEndpoint],
  );

  const handleExport = useCallback(() => {
    exportReport(active, active);
  }, [active, exportReport]);

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div
      style={{
        background: V.void,
        minHeight: '100vh',
        fontFamily: S,
        color: V.t,
        padding: isMobile ? '20px 16px 28px' : '28px 32px',
      }}
    >
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}} ::selection{background:rgba(232,93,48,.3)} ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:#222226;border-radius:2px}`}</style>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div />
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: isMobile ? 'stretch' : 'center',
            flexWrap: 'wrap',
            width: isMobile ? '100%' : 'auto',
          }}
        >
          <input
            aria-label="Data inicio"
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
            style={{
              padding: '6px 10px',
              background: V.e,
              border: `1px solid ${V.b}`,
              borderRadius: 6,
              color: V.t,
              fontSize: 11,
              fontFamily: M,
              outline: 'none',
              width: isMobile ? '100%' : 'auto',
            }}
          />
          <span style={{ color: V.t3, fontSize: 10 }}>até</span>
          <input
            aria-label="Data fim"
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
            style={{
              padding: '6px 10px',
              background: V.e,
              border: `1px solid ${V.b}`,
              borderRadius: 6,
              color: V.t,
              fontSize: 11,
              fontFamily: M,
              outline: 'none',
              width: isMobile ? '100%' : 'auto',
            }}
          />
          <Bt primary onClick={() => setShowFilter(true)}>
            {IC.filter(14)} Filtro avançado
          </Bt>
          {!['envio', 'exportacoes'].includes(active) && (
            <Bt accent={V.g2} onClick={handleExport}>
              {IC.dl(14)} Excel
            </Bt>
          )}
        </div>
      </div>

      {/* Tabs — pill style */}
      <div style={SUBINTERFACE_PILL_ROW_STYLE}>
        {TABS.map((t) => (
          <button
            type="button"
            key={t.k}
            onClick={() => {
              setActive(t.k);
              setPage(1);
              router.replace(`/analytics?tab=${t.k}`);
            }}
            style={getSubinterfacePillStyle(active === t.k, isMobile)}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>{t.ic(14)}</span>
            {t.l}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ animation: 'fadeIn .3s ease', maxWidth: 1240, margin: '0 auto' }} key={active}>
        {active === 'vendas' && (
          <VendasTab
            filters={filters}
            baseFilters={baseFilters}
            page={page}
            setPage={setPage}
            isMobile={isMobile}
          />
        )}
        {active === 'afterpay' && (
          <AfterPayTab
            filters={filters}
            setFilters={setFilters}
            baseFilters={baseFilters}
            page={page}
            setPage={setPage}
          />
        )}
        {active === 'churn' && <ChurnTab filters={filters} />}
        {active === 'abandonos' && (
          <AbandonosTab baseFilters={baseFilters} page={page} setPage={setPage} />
        )}
        {active === 'satisfacao' && <SatisfacaoTab />}
        {active === 'envio' && <EnvioRelatoriosTab filters={filters} isMobile={isMobile} />}
        {active === 'exportacoes' && (
          <ExportacoesTab
            setPage={setPage}
            exportReport={exportReport}
            router={router}
            setActive={setActive}
          />
        )}
        {active === 'afiliados' && <AfiliadosTab filters={filters} />}
        {active === 'indicadores' && <IndicadoresTab filters={filters} />}
        {active === 'assinaturas' && (
          <AssinaturasTab baseFilters={baseFilters} page={page} setPage={setPage} />
        )}
        {active === 'ind_prod' && <IndProdTab filters={filters} />}
        {active === 'recusa' && (
          <RecusaTab baseFilters={baseFilters} page={page} setPage={setPage} />
        )}
        {active === 'origem' && <OrigemTab filters={filters} />}
        {active === 'metricas' && <MetricasTab filters={filters} />}
        {active === 'estornos' && (
          <EstornosTab
            filters={filters}
            setFilters={setFilters}
            baseFilters={baseFilters}
            page={page}
            setPage={setPage}
          />
        )}
        {active === 'chargeback' && (
          <ChargebackTab baseFilters={baseFilters} page={page} setPage={setPage} />
        )}
        {active === 'engajamento' && <EngajamentoTab filters={filters} />}
      </div>

      <FilterDrawer
        open={showFilter}
        onClose={() => setShowFilter(false)}
        filters={filters}
        setFilters={setFilters}
      />
    </div>
  );
}
