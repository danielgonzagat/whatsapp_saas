'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
/** Dynamic. */
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
import { secureRandomFloat } from '@/lib/secure-random';

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
  g2: '#10B981' /* PULSE_VISUAL_OK: success emerald, non-Monitor status indicator */,
  bl: '#3B82F6' /* PULSE_VISUAL_OK: info blue, non-Monitor status indicator */,
  y: '#F59E0B' /* PULSE_VISUAL_OK: warning amber, non-Monitor status indicator */,
  r: '#EF4444' /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */,
  p: '#8B5CF6' /* PULSE_VISUAL_OK: purple accent, non-Monitor status indicator */,
  cy: '#06B6D4' /* PULSE_VISUAL_OK: cyan accent, non-Monitor status indicator */,
  pk: '#EC4899' /* PULSE_VISUAL_OK: pink accent, non-Monitor status indicator */,
};
const R$ = (n: number) =>
  'R$ ' + (n / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    if (v !== undefined && v !== null && v !== '') {
      p.set(k, String(v));
    }
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
      <path d={kloelT(`M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6`)} />
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
      <path d={kloelT(`M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2`)} />
      <circle cx="9" cy="7" r="4" />
      <path d={kloelT(`M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75`)} />
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
      <path d={kloelT(`M18 20V10M12 20V4M6 20v-6`)} />
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
      <path
        d={kloelT(
          `M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z`,
        )}
      />
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
      <path d={kloelT(`M3 11V9a4 4 0 014-4h14`)} />
      <polyline points="7 23 3 19 7 15" />
      <path d={kloelT(`M21 13v2a4 4 0 01-4 4H3`)} />
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
      <path
        d={kloelT(
          `M21 8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z`,
        )}
      />
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
      <path d={kloelT(`M3.51 15a9 9 0 102.13-9.36L1 10`)} />
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
      <path d={kloelT(`M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4`)} />
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
      <path d={kloelT(`M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z`)} />
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
      <path d={kloelT(`M13 2L3 14h9l-1 8 10-12h-9l1-8z`)} />
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
      <path d={kloelT(`M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z`)} />
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
      <path
        d={kloelT(
          `M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z`,
        )}
      />
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
      <path d={kloelT(`M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1`)} />
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
      <path
        d={kloelT(
          `M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z`,
        )}
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
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d={kloelT(`M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71`)} />
      <path d={kloelT(`M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71`)} />
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
      <path d={kloelT(`M21.21 15.89A10 10 0 118 2.83`)} />
      <path d={kloelT(`M22 12A10 10 0 0012 2v10z`)} />
    </svg>
  ),
};
import "../../../__companions__/page.companion";
