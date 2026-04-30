'use client';

import { kloelT } from '@/lib/i18n/t';
import CRMPipelineView from '@/components/kloel/crm/CRMPipelineView';
import {
  SUBINTERFACE_PILL_ROW_STYLE,
  getSubinterfacePillStyle,
} from '@/components/kloel/ui/subinterface-pill';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import {
  useOrderAlerts,
  useOrderPipeline,
  useOrderStats,
  useOrders,
  useReturnOrder,
  useSaleDetail,
  useSales,
  useSalesChart,
  useSalesStats,
  useSubscriptionStats,
  useSubscriptions,
} from '@/hooks/useSales';
import { useSalesPipeline } from '@/hooks/useSalesPipeline';
import { apiFetch, tokenStorage } from '@/lib/api';
import { smartPaymentApi } from '@/lib/api/misc';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useEffect, useRef, useState, useId } from 'react';
import { mutate } from 'swr';

/* ── Local view types ── */
interface SaleItem {
  id: string;
  leadId?: string;
  leadPhone?: string;
  customerName?: string;
  productName?: string;
  amount: number;
  status: string;
  paymentMethod?: string;
  createdAt?: string;
}

interface SubscriptionItem {
  id: string;
  customerName?: string;
  planName?: string;
  amount: number;
  status: string;
  totalPaid?: number;
  startedAt?: string;
  nextBillingAt?: string;
}

interface OrderItem {
  id: string;
  customerName?: string;
  productName?: string;
  amount: number;
  status: string;
  trackingCode?: string;
  addressCity?: string;
  addressState?: string;
  createdAt?: string;
}

interface SalesStatsData {
  totalRevenue?: number;
  revenueTrend?: number;
  totalTransactions?: number;
  totalPending?: number;
  pendingCount?: number;
  avgTicket?: number;
}

interface SubStatsData {
  mrr?: number;
  activeCount?: number;
  churnRate?: number;
  avgLtv?: number;
  arr?: number;
  lifecycle?: Record<string, number>;
}

interface OrderStatsData {
  total?: number;
  processing?: number;
  shipped?: number;
  delivered?: number;
}

interface OrderPipelineData {
  processing?: number;
  shipped?: number;
  delivered?: number;
  returned?: number;
}

interface PipelineStage {
  id: string;
  name?: string;
  color?: string;
  deals?: PipelineDeal[];
}

interface PipelineDeal {
  id: string;
  value?: number;
}

interface DetailItemData {
  id: string;
  amount?: number;
  paymentMethod?: string;
  createdAt?: string;
  startedAt?: string;
  nextBillingAt?: string;
  totalPaid?: number;
  trackingCode?: string;
  addressCity?: string;
  addressState?: string;
  status?: string;
  customerName?: string;
  customerEmail?: string;
  leadPhone?: string;
  productName?: string;
  planName?: string;
}

const SORA = "var(--font-sora), 'Sora', sans-serif";
const MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";

/* ── Icons (extracted into VendasView.icons.tsx) ── */
import { IC } from './VendasView.icons';
import { colors } from '@/lib/design-tokens';

/* ── Status configs ── */
const SALE_STATUS: Record<string, { label: string; color: string }> = {
  paid: { label: 'Pago', color: 'colors.ember.primary' },
  pending: { label: 'Pendente', color: '#F59E0B' },
  refunded: { label: 'Reembolsado', color: 'var(--app-text-secondary)' },
  cancelled: { label: 'Cancelado', color: 'var(--app-text-tertiary)' },
  overdue: { label: 'Atrasado', color: '#EF4444' },
};
const SUB_STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Ativa', color: 'colors.ember.primary' },
  PAST_DUE: { label: 'Atrasada', color: '#F59E0B' },
  CANCELLED: { label: 'Cancelada', color: 'var(--app-text-tertiary)' },
  PAUSED: { label: 'Pausada', color: 'var(--app-text-secondary)' },
  TRIALING: { label: 'Trial', color: '#3B82F6' },
};
const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  PROCESSING: { label: 'Processando', color: '#F59E0B' },
  SHIPPED: { label: 'Enviado', color: '#3B82F6' },
  DELIVERED: { label: 'Entregue', color: 'colors.ember.primary' },
  RETURNED: { label: 'Devolvido', color: 'var(--app-text-secondary)' },
  CANCELLED: { label: 'Cancelado', color: 'var(--app-text-tertiary)' },
};
const PAY_METHODS: Record<string, string> = {
  PIX: 'colors.ember.primary',
  CREDIT_CARD: '#3B82F6',
  BOLETO: '#F59E0B',
  DEBIT: '#10B981',
};

/* ── Helpers ── */
function fmtBRL(v: number) {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}
function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('pt-BR');
}

function Stat({
  label,
  value,
  color = 'var(--app-text-primary)',
  sub,
  trend,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
  trend?: number;
}) {
  return (
    <div
      style={{
        background: 'var(--app-bg-card)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 6,
        padding: 18,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--app-text-secondary)',
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          display: 'block',
          marginBottom: 6,
          fontFamily: SORA,
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, color }}>{value}</span>
        {trend !== undefined && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              fontSize: 10,
              color: trend > 0 ? '#10B981' : '#EF4444',
            }}
          >
            {trend > 0 ? IC.trend(10) : IC.trendD(10)} {Math.abs(trend)}%
          </span>
        )}
      </div>
      {sub && (
        <span
          style={{
            fontSize: 11,
            color: 'var(--app-text-tertiary)',
            marginTop: 4,
            display: 'block',
            fontFamily: SORA,
          }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

function Badge({
  status,
  config,
}: {
  status: string;
  config: Record<string, { label: string; color: string }>;
}) {
  const s = config[status] || { label: status, color: 'var(--app-text-tertiary)' };
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 10,
        fontWeight: 600,
        color: s.color,
        background: `${s.color}12`,
        padding: '3px 8px',
        borderRadius: 4,
        letterSpacing: '.04em',
        textTransform: 'uppercase',
      }}
    >
      {s.label}
    </span>
  );
}

function TH({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--app-text-tertiary)',
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        fontFamily: SORA,
      }}
    >
      {children}
    </span>
  );
}

function MiniChart({ data, color = 'colors.ember.primary' }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1);
  const bars = data.map((value, idx) => ({
    id: `bar-${idx}-of-${data.length}-${value}`,
    value,
    isLast: idx === data.length - 1,
  }));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40 }}>
      {bars.map((bar) => (
        <div
          key={bar.id}
          style={{
            flex: 1,
            height: `${(bar.value / max) * 100}%`,
            minHeight: 2,
            background: bar.isLast ? color : 'var(--app-accent-light)',
            borderRadius: '2px 2px 0 0',
          }}
        />
      ))}
    </div>
  );
}
