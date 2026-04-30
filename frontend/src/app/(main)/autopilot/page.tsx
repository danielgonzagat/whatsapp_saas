'use client';

import { kloelT } from '@/lib/i18n/t';
/** Dynamic. */
export const dynamic = 'force-dynamic';

import {
  Button,
  CenterStage,
  type MissionCardData,
  MissionCards,
  Section,
  StageHeadline,
} from '@/components/kloel';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import {
  activateMoneyMachine,
  apiFetch,
  askAutopilotInsights,
  buildQuery,
  exportAutopilotActions,
  getAutopilotActions,
  getAutopilotConfig,
  getAutopilotImpact,
  getAutopilotMoneyReport,
  getAutopilotPipeline,
  getAutopilotRevenueEvents,
  getAutopilotRuntimeConfig,
  getAutopilotStats,
  getAutopilotStatus,
  getSystemHealth,
  runAutopilotSmokeTest,
  sendAutopilotDirectMessage,
  toggleAutopilot,
  tokenStorage,
  updateAutopilotConfig,
} from '@/lib/api';
import type { AskInsightsResult, MoneyMachineResult, RuntimeConfig } from '@/lib/api';
import { unwrapArrayEnvelope, unwrapDataEnvelope, unwrapSettled } from './page.helpers';
import { colors } from '@/lib/design-tokens';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  Database,
  DollarSign,
  Filter,
  Layers,
  Lightbulb,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  Save,
  Send,
  Server,
  Settings2,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Users,
  Workflow,
  XCircle,
  Zap,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, useCallback, useEffect, useState } from 'react';

interface AutopilotStatus {
  workspaceId: string;
  enabled: boolean;
  billingSuspended?: boolean;
}

interface AutopilotStats {
  workspaceId: string;
  enabled: boolean;
  billingSuspended?: boolean;
  contactsTracked: number;
  actionsLast7d: number;
  actionsByType: Record<string, number>;
  lastActionAt: string | null;
  errorsLast7d: number;
  lastErrorAt: string | null;
  errorReasons: Record<string, number>;
  scheduledCount: number;
  nextRetryAt: string | null;
  conversionsLast7d: number;
  lastConversionAt: string | null;
  conversionsAmountLast7d: number;
  skippedTotal: number;
  skippedOptin: number;
  skipped24h: number;
  timeline: Record<string, number>;
}

interface AutopilotImpact {
  workspaceId: string;
  actionsAnalyzed: number;
  repliedContacts: number;
  totalReplies: number;
  replyRate: number;
  conversions: number;
  conversionRate: number;
  avgReplyMinutes: number | null;
  samples: Array<{
    contactId: string;
    contact: string;
    replyAt: string;
    delayMinutes: number;
  }>;
}

interface AutopilotAction {
  id?: string;
  createdAt: string;
  contactId?: string;
  contact?: string;
  intent?: string;
  action?: string;
  status?: string;
  reason?: string;
}

interface MoneyReport {
  totalRevenue?: number;
  totalCosts?: number;
  roi?: number;
  period?: string;
  conversions?: number;
  avgTicket?: number;
  revenueByDay?: Record<string, number>;
  [key: string]: unknown;
}

interface RevenueEvent {
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

interface AutopilotInsight {
  id?: string;
  type?: string;
  title?: string;
  description?: string;
  severity?: 'info' | 'warning' | 'critical' | 'success';
  recommendation?: string;
  createdAt?: string;
  [key: string]: unknown;
}

interface QueueStats {
  waiting?: number;
  active?: number;
  delayed?: number;
  completed?: number;
  failed?: number;
  paused?: number;
  [key: string]: unknown;
}

interface AutopilotConfigData {
  conversionFlowId?: string | null;
  currencyDefault?: string;
  recoveryTemplateName?: string | null;
  [key: string]: unknown;
}

interface AutopilotPipeline {
  workspaceId: string;
  workspaceName?: string | null;
  windowHours?: number;
  autonomy?: {
    autopilotEnabled?: boolean;
    whatsappStatus?: string;
    connected?: boolean;
  };
  messages?: {
    received?: number;
    responded?: number;
    unansweredEstimate?: number;
    lastInbound?: {
      content?: string;
      createdAt?: string;
    } | null;
    lastOutbound?: {
      content?: string;
      createdAt?: string;
    } | null;
  };
  autopilot?: {
    executed?: number;
    skipped?: number;
    failed?: number;
    lastEvent?: {
      status?: string;
      reason?: string | null;
      createdAt?: string;
    } | null;
    recentFailures?: Array<{
      status?: string;
      reason?: string | null;
      createdAt?: string;
    }>;
  };
  queue?: {
    waiting?: number;
    active?: number;
    delayed?: number;
    failed?: number;
  };
}

interface SystemHealth {
  status: string;
  details?: Record<string, { status?: string; error?: string; missing?: string[] }>;
}

interface AutopilotSmokeTestResult {
  smokeTestId: string;
  mode: 'dry-run' | 'live';
  phone: string;
  message: string;
  result?: {
    status?: string;
    stage?: string;
    error?: string;
    previewText?: string;
    mode?: 'dry-run' | 'live';
    reason?: string;
  };
  queue?: {
    waiting?: number;
    active?: number;
    delayed?: number;
    failed?: number;
  };
}

function StatCard({
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
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  color?: string;
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

function ActionRow({ action }: { action: AutopilotAction }) {
  const statusColors: Record<string, string> = {
    success: colors.brand.green,
    error:
      '#EF4444' /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */ /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */,
    skipped: colors.brand.cyan,
    scheduled:
      '#F59E0B' /* PULSE_VISUAL_OK: warning amber, non-Monitor status indicator */ /* PULSE_VISUAL_OK: warning amber, non-Monitor status indicator */,
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
      style={{
        backgroundColor: colors.background.surface2,
        borderColor: colors.stroke,
      }}
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
            style={{
              backgroundColor: `${colors.brand.cyan}20`,
              color: colors.brand.cyan,
            }}
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

function formatDateTime(value?: string | null) {
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

function statusTone(status?: string) {
  const normalized = String(status || '').toUpperCase();
  if (['UP', 'CONFIGURED', 'COMPLETED'].includes(normalized)) {
    return { color: colors.brand.green, bg: `${colors.brand.green}20` };
  }
  if (['DEGRADED', 'PARTIAL', 'QUEUED', 'PROCESSING'].includes(normalized)) {
    return {
      color:
        '#F59E0B' /* PULSE_VISUAL_OK: warning amber, non-Monitor status indicator */ /* PULSE_VISUAL_OK: warning amber, non-Monitor status indicator */,
      bg: 'rgba(245, 158, 11, 0.15)',
    };
  }
  if (
    ['DOWN', 'FAILED', 'ERROR', 'SKIPPED', 'DISABLED', 'BILLING_SUSPENDED', 'MISSING'].includes(
      normalized,
    )
  ) {
    return {
      color:
        '#EF4444' /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */ /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */,
      bg: 'rgba(239, 68, 68, 0.12)',
    };
  }
  return { color: colors.brand.cyan, bg: `${colors.brand.cyan}18` };
}

function StatusPill({ label, status }: { label: string; status?: string }) {
  const tone = statusTone(status);
  return (
    <div
      className="px-3 py-2 rounded-lg border text-sm flex items-center justify-between gap-3"
      style={{
        backgroundColor: colors.background.surface2,
        borderColor: colors.stroke,
      }}
    >
      <span style={{ color: colors.text.secondary }}>{label}</span>
      <span
        className="px-2 py-1 rounded-md text-xs font-semibold uppercase tracking-wide"
        style={{
          color: tone.color,
          backgroundColor: tone.bg,
        }}
      >
        {status || 'unknown'}
      </span>
    </div>
  );
}
import "../../../__companions__/page.companion";
