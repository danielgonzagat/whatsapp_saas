import React from 'react';
import { colors } from '@/lib/design-tokens';
import { Activity, CheckCircle2, Clock, Calendar, TrendingUp, XCircle } from 'lucide-react';

export type { AutopilotStatus } from './page.types';

export type { AutopilotStats } from './page.types';

export type { AutopilotImpact } from './page.types';

import type { AutopilotAction } from './page.types';
export type { AutopilotAction };

export interface MoneyReport {
  totalRevenue?: number;
  totalCosts?: number;
  roi?: number;
  period?: string;
  conversions?: number;
  avgTicket?: number;
  revenueByDay?: Record<string, number>;
  [key: string]: unknown;
}

export interface RevenueEvent {
  id?: string;
  type?: string;
  amount?: number;
  contactId?: string;
  contact?: string;
  phone?: string;
  reason?: string;
  createdAt: string;
  [key: string]: unknown;
}

export type { AutopilotInsight } from './page.types';

export interface QueueStats {
  waiting?: number;
  active?: number;
  delayed?: number;
  completed?: number;
  failed?: number;
  paused?: number;
  [key: string]: unknown;
}

export type { AutopilotConfigData } from './page.types';

export type { AutopilotPipeline } from './page.types';

export type { SystemHealth } from './page.types';

export type { AutopilotSmokeTestResult } from './page.types';

export function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  trend,
  color = colors.brand.green,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string | undefined;
  trend?: 'up' | 'down' | 'neutral';
  color?: string | undefined;
}) {
  return (
    <div
      className="p-5 rounded-xl border transition-all hover:scale-[1.02]"
      style={{
        backgroundColor: colors.background.surface1,
        borderColor: colors.stroke,
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}20` }}>
          <Icon size={20} style={{ color }} />
        </div>
        <span className="text-sm font-medium" style={{ color: colors.text.secondary }}>
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold" style={{ color: colors.text.primary }}>
          {value}
        </span>
        {subValue && (
          <span className="text-sm" style={{ color: colors.text.muted }}>
            {subValue}
          </span>
        )}
        {trend && (
          <TrendingUp
            size={16}
            className={
              trend === 'up'
                ? 'text-green-500'
                : trend === 'down'
                  ? 'text-red-500'
                  : 'text-gray-500'
            }
            style={{ transform: trend === 'down' ? 'rotate(180deg)' : undefined }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}

export function ActionRow({ action }: { action: AutopilotAction }) {
  const statusColors: Record<string, string> = {
    success: colors.brand.green,
    error: colors.state.error,
    skipped: colors.brand.cyan,
    scheduled: colors.state.warning,
  };

  const statusIcons: Record<string, React.ElementType> = {
    success: CheckCircle2,
    error: XCircle,
    skipped: Clock,
    scheduled: Calendar,
  };
  const statusKey = action.status || 'unknown';
  const StatusIcon = statusIcons[statusKey] || Activity;
  const statusColor = statusColors[statusKey] || colors.text.muted;

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-lg border transition-all hover:bg-white/5"
      style={{ backgroundColor: colors.background.surface2, borderColor: colors.stroke }}
    >
      <div className="p-2 rounded-full" style={{ backgroundColor: `${statusColor}20` }}>
        <StatusIcon size={16} style={{ color: statusColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate" style={{ color: colors.text.primary }}>
            {action.contact || action.contactId?.slice(0, 8)}
          </span>
          <span
            className="px-2 py-0.5 rounded text-xs font-medium"
            style={{ backgroundColor: `${colors.brand.cyan}20`, color: colors.brand.cyan }}
          >
            {action.intent}
          </span>
        </div>
        <div className="text-sm truncate" style={{ color: colors.text.muted }}>
          {action.action}
          {action.reason && ` — ${action.reason}`}
        </div>
      </div>
      <div className="text-xs whitespace-nowrap" style={{ color: colors.text.muted }}>
        {new Date(action.createdAt).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
    </div>
  );
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }
  return parsed.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function statusTone(status?: string) {
  const normalized = String(status || '').toUpperCase();
  if (['UP', 'CONFIGURED', 'COMPLETED'].includes(normalized)) {
    return { color: colors.brand.green, bg: `${colors.brand.green}20` };
  }
  if (['DEGRADED', 'PARTIAL', 'QUEUED', 'PROCESSING'].includes(normalized)) {
    return { color: colors.state.warning, bg: `${colors.state.warning}26` };
  }
  if (
    ['DOWN', 'FAILED', 'ERROR', 'SKIPPED', 'DISABLED', 'BILLING_SUSPENDED', 'MISSING'].includes(
      normalized,
    )
  ) {
    return { color: colors.state.error, bg: `${colors.state.error}1F` };
  }
  return { color: colors.brand.cyan, bg: `${colors.brand.cyan}18` };
}

export function StatusPill({ label, status }: { label: string; status?: string | undefined }) {
  const tone = statusTone(status);
  return (
    <div
      className="px-3 py-2 rounded-lg border text-sm flex items-center justify-between gap-3"
      style={{ backgroundColor: colors.background.surface2, borderColor: colors.stroke }}
    >
      <span style={{ color: colors.text.secondary }}>{label}</span>
      <span
        className="px-2 py-1 rounded-md text-xs font-semibold uppercase tracking-wide"
        style={{ color: tone.color, backgroundColor: tone.bg }}
      >
        {status || 'unknown'}
      </span>
    </div>
  );
}

export function formatCurrency(value?: number) {
  if (value == null) {
    return 'R$ 0';
  }
  return (
    'R$ ' + value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}
