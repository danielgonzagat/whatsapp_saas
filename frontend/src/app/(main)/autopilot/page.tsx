'use client';

import { kloelT } from '@/lib/i18n/t';
/** Dynamic. */
export const dynamic = 'force-dynamic';

import {
  Button,
  CenterStage,
  type MissionCardData,
  Section,
  StageHeadline,
} from '@/components/kloel';
import AutopilotPlanInspector from '@/components/kloel/autopilot/AutopilotPlanInspector';
import AutopilotDecisionLog from '@/components/kloel/autopilot/AutopilotDecisionLog';
import AutopilotSafetyBrakes from '@/components/kloel/autopilot/AutopilotSafetyBrakes';
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
  AlertCircle,  BarChart3,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  Database,
  DollarSign,  Layers,
  Lightbulb,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  Save,  Server,
  Settings2,
  Sparkles,  TrendingUp,
  Users,  XCircle,
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
        colors.semantic.warning,
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
        colors.semantic.error,
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

/** Autopilot page. */
export default function AutopilotPage() {
  const workspaceId = useWorkspaceId();
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [status, setStatus] = useState<AutopilotStatus | null>(null);
  const [stats, setStats] = useState<AutopilotStats | null>(null);
  const [impact, setImpact] = useState<AutopilotImpact | null>(null);
  const [pipeline, setPipeline] = useState<AutopilotPipeline | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [actions, setActions] = useState<AutopilotAction[]>([]);
  const [moneyReport, setMoneyReport] = useState<MoneyReport | null>(null);
  const [revenueEvents, setRevenueEvents] = useState<RevenueEvent[]>([]);
  const [insights, setInsights] = useState<AutopilotInsight[]>([]);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [config, setConfig] = useState<AutopilotConfigData | null>(null);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [configDraft, setConfigDraft] = useState<AutopilotConfigData>({});
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  const navigate = useCallback(
    (href: string) => {
      if (!href || pathname === href) {
        return;
      }
      startTransition(() => {
        router.push(href);
      });
    },
    [pathname, router],
  );

  // Money Machine

  // Ask AI Insights
  const [askQuestion, setAskQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [askResult, setAskResult] = useState<AskInsightsResult | null>(null);

  // Direct Send
  const [sendResult, setSendResult] = useState<{
    success?: boolean;
    messageId?: string;
    error?: string;
  } | null>(null);

  // Runtime Config
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);

  const token = tokenStorage.getToken();
  const effectiveWorkspaceId = workspaceId || tokenStorage.getWorkspaceId() || '';

  const fetchAutopilotData = useCallback(async () => {
    if (!effectiveWorkspaceId || !token) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const [
        statusResult,
        statsResult,
        impactResult,
        actionsResult,
        pipelineResult,
        systemHealthResult,
        moneyReportResult,
        revenueEventsResult,
        insightsResult,
        queueStatsResult,
        configResult,
        runtimeConfigResult,
      ] = await Promise.allSettled([
        getAutopilotStatus(effectiveWorkspaceId, token),
        getAutopilotStats(effectiveWorkspaceId, token),
        getAutopilotImpact(effectiveWorkspaceId, token),
        getAutopilotActions(effectiveWorkspaceId, { limit: 50, token }),
        getAutopilotPipeline(effectiveWorkspaceId, token),
        getSystemHealth(),
        getAutopilotMoneyReport(effectiveWorkspaceId),
        getAutopilotRevenueEvents(effectiveWorkspaceId, 20),
        apiFetch<AutopilotInsight[] | { data: AutopilotInsight[] }>(
          '/autopilot/insights' + buildQuery({ workspaceId: effectiveWorkspaceId }),
        ),
        apiFetch<QueueStats | { data: QueueStats }>(
          '/autopilot/queue' + buildQuery({ workspaceId: effectiveWorkspaceId }),
        ),
        getAutopilotConfig(effectiveWorkspaceId, token),
        getAutopilotRuntimeConfig(),
      ]);

      const statusData = unwrapSettled<AutopilotStatus | null>(
        statusResult,
        (v) => (v as AutopilotStatus) || null,
        null,
      );
      setStatus(statusData);

      setStats(
        unwrapSettled<AutopilotStats | null>(
          statsResult,
          (v) => (v as AutopilotStats) || null,
          null,
        ),
      );
      setImpact(
        unwrapSettled<AutopilotImpact | null>(
          impactResult,
          (v) => (v as AutopilotImpact) || null,
          null,
        ),
      );
      setActions(unwrapSettled<AutopilotAction[]>(actionsResult, unwrapArrayEnvelope, []));
      setPipeline(
        unwrapSettled<AutopilotPipeline | null>(
          pipelineResult,
          (v) => (v as AutopilotPipeline) || null,
          null,
        ),
      );
      setSystemHealth(
        unwrapSettled<SystemHealth | null>(
          systemHealthResult,
          (v) => (v as SystemHealth) || null,
          null,
        ),
      );
      setMoneyReport(
        unwrapSettled<MoneyReport | null>(moneyReportResult, unwrapDataEnvelope, null),
      );
      setRevenueEvents(unwrapSettled<RevenueEvent[]>(revenueEventsResult, unwrapArrayEnvelope, []));
      setInsights(unwrapSettled<AutopilotInsight[]>(insightsResult, unwrapArrayEnvelope, []));
      setQueueStats(unwrapSettled<QueueStats | null>(queueStatsResult, unwrapDataEnvelope, null));

      const cfgData = unwrapSettled<AutopilotConfigData | null>(
        configResult,
        unwrapDataEnvelope,
        null,
      );
      setConfig(cfgData);
      if (cfgData) {
        setConfigDraft(cfgData);
      }

      setRuntimeConfig(
        unwrapSettled<RuntimeConfig | null>(
          runtimeConfigResult,
          (v) => (v as RuntimeConfig) || null,
          null,
        ),
      );

      const partialError =
        statsResult.status === 'rejected' ||
        impactResult.status === 'rejected' ||
        actionsResult.status === 'rejected' ||
        pipelineResult.status === 'rejected' ||
        systemHealthResult.status === 'rejected';

      // Se billingSuspended, alguns endpoints podem responder 403/erro — isso não deve bloquear a tela.
      if (statusData?.billingSuspended) {
        setError(null);
      } else if (!statusData) {
        setError('Erro ao carregar dados do Autopilot');
      } else if (partialError) {
        setError('Erro ao carregar dados do Autopilot');
      }
    } catch (err) {
      console.error('Error fetching autopilot data:', err);
      setError('Erro ao carregar dados do Autopilot');
    } finally {
      setIsLoading(false);
    }
  }, [effectiveWorkspaceId, token]);

  useEffect(() => {
    fetchAutopilotData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchAutopilotData, 30000);
    return () => clearInterval(interval);
  }, [fetchAutopilotData]);

  const handleToggle = async () => {
    if (!effectiveWorkspaceId || !token || !status) {
      return;
    }

    try {
      setIsToggling(true);
      setError(null);
      const data = await toggleAutopilot(effectiveWorkspaceId, !status.enabled, token);

      setStatus((prev) => (prev ? { ...prev, enabled: Boolean(data.enabled) } : null));

      await fetchAutopilotData();
    } catch (err: unknown) {
      console.error('Error toggling autopilot:', err);
      setError(err instanceof Error ? err.message : 'Erro ao alterar status do Autopilot');
    } finally {
      setIsToggling(false);
    }
  };

  const filteredActions = actions.filter((a) =>
    statusFilter === 'all' ? true : a.status === status  );

  const handleExportActions = async () => {
    if (!effectiveWorkspaceId || !token) {
      return;
    }
    try {
      const csv = await exportAutopilotActions(
        effectiveWorkspaceId,
        statusFilter === 'all' ? undefined : status        token,
      );
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `autopilot-actions-${workspaceId}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting actions:', err);
      setError('Erro ao exportar ações');
    }
  };


  const handleSaveConfig = async () => {
    if (!effectiveWorkspaceId || !token) {
      return;
    }
    try {
      setIsSavingConfig(true);
      setError(null);
      await updateAutopilotConfig(effectiveWorkspaceId, configDraft, token);
      setConfig(configDraft);
      setIsEditingConfig(false);
      await fetchAutopilotData();
    } catch (err: unknown) {
      console.error('Error saving autopilot config:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar configuração');
    } finally {
      setIsSavingConfig(false);
    }
  };


  const handleAskInsights = async () => {
    if (!effectiveWorkspaceId || !askQuestion.trim()) {
      return;
    }
    try {
      setIsAsking(true);
      setAskResult(null);
      const result = await askAutopilotInsights(effectiveWorkspaceId, askQuestion.trim());
      setAskResult(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao consultar insights da IA');
    } finally {
      setIsAsking(false);
    }
  };


  const formatCurrency = (value?: number) => {
    if (value == null) {
      return 'R$ 0';
    }
    return (
      'R$ ' + value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  };

  const queueTotal = queueStats
    ? (queueStats.waiting || 0) +
      (queueStats.active || 0) +
      (queueStats.delayed || 0) +
      (queueStats.failed || 0)
    : 0;

  const queueHealthStatus = (() => {
    if (!queueStats) {
      return 'unknown';
    }
    if ((queueStats.failed || 0) > 10) {
      return 'critical';
    }
    if ((queueStats.waiting || 0) > 50 || (queueStats.delayed || 0) > 20) {
      return 'degraded';
    }
    return 'healthy';
  })();

  const missionCards: MissionCardData[] = [
    {
      id: 'auto-responses',
      title: 'Respostas Automáticas',
      description: 'IA responde leads em segundos',
      icon: MessageSquare,
      status: status?.enabled ? 'completed' : 'pending',
      action: () => navigate('/whatsapp'),
    },
    {
      id: 'lead-qualification',
      title: 'Qualificação de Leads',
      description: 'Identifica intenção de compra',
      icon: Users,
      status: stats?.actionsLast7d ? 'completed' : 'pending',
      action: () => navigate('/vendas/pipeline'),
    },
    {
      id: 'sales-flows',
      title: 'Fluxos de Vendas',
      description: 'Direciona para conversão',
      icon: Zap,
      status: 'completed',
      action: () => navigate('/flow'),
    },
    {
      id: 'analytics',
      title: 'Analytics',
      description: 'Métricas em tempo real',
      icon: BarChart3,
      status: 'completed',
      action: () => navigate('/analytics'),
    },
  ];

  if (isLoading && !stats) {
    return (
      <div
        className="min-h-full flex items-center justify-center"
        style={{ backgroundColor: colors.background.obsidian }}
      >
        <div className="flex flex-col items-center gap-4">
          <RefreshCw
            size={32}
            className="animate-spin"
            style={{ color: colors.brand.green }}
            aria-hidden="true"
          />
          <span style={{ color: colors.text.muted }}>{kloelT(`Carregando Autopilot...`)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-20" style={{ backgroundColor: colors.background.obsidian }}>
      {/* Header */}
      <Section spacing="lg">
        <CenterStage size="XL">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <p
                className="text-xs font-medium tracking-widest mb-2"
                style={{ color: colors.brand.cyan }}
              >
                {kloelT(`VENDAS NO PILOTO AUTOMÁTICO`)}
              </p>
              <StageHeadline
                headline={kloelT(`Autopilot`)}
                highlight={kloelT(`Autopilot`)}
                subheadline={kloelT(`IA que responde, qualifica e converte leads 24/7`)}
              />
            </div>

            {/* Toggle Button */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={handleToggle}
                disabled={isToggling || status?.billingSuspended}
                className={`
                  relative w-32 h-16 rounded-full transition-all duration-300
                  ${isToggling ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:scale-105'}
                  ${status?.billingSuspended ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                style={{
                  backgroundColor: status?.enabled
                    ? colors.brand.green
                    : colors.background.surface2,
                  border: `2px solid ${status?.enabled ? colors.brand.green : colors.stroke}`,
                }}
              >
                <div
                  className={`
                    absolute top-1 w-12 h-12 rounded-full flex items-center justify-center
                    transition-all duration-300 shadow-lg
                  `}
                  style={{
                    backgroundColor: colors.background.surface1,
                    left: status?.enabled ? 'calc(100% - 52px)' : '4px',
                  }}
                >
                  {status?.enabled ? (
                    <Play size={20} style={{ color: colors.brand.green }} aria-hidden="true" />
                  ) : (
                    <Pause size={20} style={{ color: colors.text.muted }} aria-hidden="true" />
                  )}
                </div>
              </button>
              <span
                className="text-sm font-medium"
                style={{
                  color: status?.enabled ? colors.brand.green : colors.text.muted,
                }}
              >
                {isToggling ? 'Alterando...' : status?.enabled ? 'ATIVO' : 'PAUSADO'}
              </span>
              {status?.billingSuspended && (
                <span
                  className="text-xs flex items-center gap-1"
                  style={{
                    color:
                      colors.semantic.error,
                  }}
                >
                  <AlertCircle size={12} aria-hidden="true" />

                  {kloelT(`Cobrança pendente`)}
                </span>
              )}
            </div>
          </div>
        </CenterStage>
      </Section>

      {/* Error Alert */}
      {error && (
        <Section spacing="sm">
          <CenterStage size="XL">
            <div
              className="p-4 rounded-lg flex items-center gap-3"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              <AlertCircle
                size={20}
                style={{
                  color:
                    colors.semantic.error,
                }}
                aria-hidden="true"
              />
              <span
                style={{
                  color:
                    colors.semantic.error,
                }}
              >
                {error}
              </span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="ml-auto text-sm underline"
                style={{ color: colors.text.muted }}
              >
                {kloelT(`Fechar`)}
              </button>
            </div>
          </CenterStage>
        </Section>
      )}
      <Section spacing="md">
        <CenterStage size="XL">
          <AutopilotPlanInspector
            stats={stats}
            impact={impact}
            pipeline={pipeline}
            systemHealth={systemHealth}
            missionCards={missionCards}
            isLoading={isLoading}
            onRefresh={fetchAutopilotData}
          />
        </CenterStage>
      </Section>
{/* Secondary Stats */}
      <Section spacing="sm">
        <CenterStage size="XL">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard
              icon={Clock}
              label={kloelT(`Tempo Médio Resposta`)}
              value={impact?.avgReplyMinutes ? `${impact.avgReplyMinutes}min` : '—'}
              color={colors.brand.cyan}
            />
            <StatCard
              icon={CheckCircle2}
              label={kloelT(`Sucesso`)}
              value={stats?.actionsByType?.REPLY || stats?.actionsByType?.SEND_MESSAGE || 0}
              color={colors.brand.green}
            />
            <StatCard
              icon={AlertCircle}
              label={kloelT(`Erros`)}
              value={stats?.errorsLast7d || 0}
              color="var(--app-error)"
            />
            <StatCard
              icon={XCircle}
              label={kloelT(`Ignorados`)}
              value={stats?.skippedTotal || 0}
              subValue={stats?.skippedOptin ? `${stats.skippedOptin} opt-in` : undefined}
              color={colors.text.muted}
            />
            <StatCard
              icon={Calendar}
              label={kloelT(`Agendados`)}
              value={stats?.scheduledCount || 0}
              color="var(--app-warning)"
            />
          </div>
        </CenterStage>
      </Section>

      {/* Decision Log */}
      <Section spacing="lg">
        <CenterStage size="XL">
          <AutopilotDecisionLog
            actions={actions}
            impact={impact}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onRefresh={fetchAutopilotData}
            onExport={handleExportActions}
            isLoading={isLoading}
            isEnabled={status?.enabled}
          />
        </CenterStage>
      </Section>
)}

      {/* Money Report */}
      <Section spacing="lg">
        <CenterStage size="XL">
          <div
            className="p-5 rounded-xl border"
            style={{
              backgroundColor: colors.background.surface1,
              borderColor: colors.stroke,
            }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${colors.brand.green}20` }}
              >
                <DollarSign size={20} style={{ color: colors.brand.green }} aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                  {kloelT(`Relatório Financeiro`)}
                </h2>
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  {kloelT(`Receita, custos e ROI gerados pelo Autopilot`)}
                </p>
              </div>
            </div>

            {moneyReport ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  icon={TrendingUp}
                  label={kloelT(`Receita Total`)}
                  value={formatCurrency(moneyReport.totalRevenue)}
                  color={colors.brand.green}
                />
                <StatCard
                  icon={Activity}
                  label={kloelT(`Custos`)}
                  value={formatCurrency(moneyReport.totalCosts)}
                  color="var(--app-error)"
                />
                <StatCard
                  icon={BarChart3}
                  label="ROI"
                  value={moneyReport.roi != null ? `${Math.round(moneyReport.roi * 100)}%` : '---'}
                  color={colors.brand.cyan}
                  trend={
                    moneyReport.roi != null && moneyReport.roi > 0
                      ? 'up'
                      : moneyReport.roi != null && moneyReport.roi < 0
                        ? 'down'
                        : 'neutral'
                  }
                />
                <StatCard
                  icon={Sparkles}
                  label={kloelT(`Ticket Médio`)}
                  value={formatCurrency(moneyReport.avgTicket)}
                  color="var(--app-warning)"
                />
              </div>
            ) : (
              <div
                className="p-6 rounded-lg text-center"
                style={{ backgroundColor: colors.background.surface2 }}
              >
                <DollarSign
                  size={32}
                  className="mx-auto mb-2"
                  style={{ color: colors.text.muted }}
                  aria-hidden="true"
                />
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  {kloelT(`Nenhum dado financeiro disponível`)}
                </p>
              </div>
            )}
          </div>
        </CenterStage>
      </Section>

      {/* Revenue Events Timeline */}
      <Section spacing="lg">
        <CenterStage size="XL">
          <div
            className="p-5 rounded-xl border"
            style={{
              backgroundColor: colors.background.surface1,
              borderColor: colors.stroke,
            }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-lg" style={{ backgroundColor: `${colors.brand.cyan}20` }}>
                <Layers size={20} style={{ color: colors.brand.cyan }} aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                  {kloelT(`Eventos de Receita`)}
                </h2>
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  {kloelT(`Vendas e conversões atribuídas ao Autopilot`)}
                </p>
              </div>
            </div>

            {revenueEvents.length > 0 ? (
              <div className="space-y-2">
                {revenueEvents.map((event, idx) => {
                  const eventColor =
                    event.type === 'sale'
                      ? colors.brand.green
                      : event.type === 'conversion'
                        ? colors.semantic.warning
                        : colors.brand.cyan;
                  return (
                    <div
                      key={event.id || idx}
                      className="flex items-center gap-4 p-4 rounded-lg border transition-all hover:bg-white/5"
                      style={{
                        backgroundColor: colors.background.surface2,
                        borderColor: colors.stroke,
                      }}
                    >
                      <div
                        className="p-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: `${eventColor}20` }}
                      >
                        <DollarSign size={16} style={{ color: eventColor }} aria-hidden="true" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="font-medium truncate"
                            style={{ color: colors.text.primary }}
                          >
                            {event.contact ||
                              event.phone ||
                              event.contactId?.slice(0, 8) ||
                              'Contato'}
                          </span>
                          {event.type && (
                            <span
                              className="px-2 py-0.5 rounded text-xs font-medium"
                              style={{
                                backgroundColor: `${eventColor}20`,
                                color: eventColor,
                              }}
                            >
                              {event.type}
                            </span>
                          )}
                        </div>
                        {event.reason && (
                          <div className="text-sm truncate" style={{ color: colors.text.muted }}>
                            {event.reason}
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div
                          className="font-semibold"
                          style={{
                            color: colors.text.primary,
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          {event.amount != null ? formatCurrency(event.amount) : '---'}
                        </div>
                        <div className="text-xs" style={{ color: colors.text.muted }}>
                          {formatDateTime(event.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                className="p-6 rounded-lg text-center"
                style={{ backgroundColor: colors.background.surface2 }}
              >
                <Layers
                  size={32}
                  className="mx-auto mb-2"
                  style={{ color: colors.text.muted }}
                  aria-hidden="true"
                />
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  {kloelT(`Nenhum evento de receita registrado`)}
                </p>
              </div>
            )}
          </div>
        </CenterStage>
      </Section>

      {/* AI Insights */}
      <Section spacing="lg">
        <CenterStage size="XL">
          <div
            className="p-5 rounded-xl border"
            style={{
              backgroundColor: colors.background.surface1,
              borderColor: colors.stroke,
            }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${colors.brand.green}20` }}
              >
                <Lightbulb size={20} style={{ color: colors.brand.green }} aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                  {kloelT(`Insights da IA`)}
                </h2>
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  {kloelT(`Recomendações e observações geradas automaticamente`)}
                </p>
              </div>
            </div>

            {/* Ask AI input */}
            <div className="flex gap-3 mb-5">
              <input
                value={askQuestion}
                onChange={(e) => setAskQuestion(e.target.value)}
                placeholder={kloelT(
                  `Pergunte algo sobre o Autopilot... (ex: Quais leads estao mais propensos a comprar?)`,
                )}
                className="flex-1 px-4 py-3 rounded-lg border outline-none text-sm"
                style={{
                  backgroundColor: colors.background.surface2,
                  borderColor: colors.stroke,
                  color: colors.text.primary,
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAskInsights();
                  }
                }}
              />
              <Button
                variant="primary"
                size="md"
                onClick={handleAskInsights}
                isLoading={isAsking}
                leftIcon={!isAsking ? <Sparkles size={14} aria-hidden="true" /> : undefined}
              >
                {isAsking ? 'Consultando...' : 'Perguntar'}
              </Button>
            </div>

            {askResult && (
              <div
                className="mb-5 p-4 rounded-lg border"
                style={{
                  backgroundColor: colors.background.surface2,
                  borderColor: colors.stroke,
                  borderLeft: `3px solid ${colors.brand.green}`,
                }}
              >
                {askResult.question && (
                  <p className="text-xs mb-2" style={{ color: colors.text.muted }}>
                    {kloelT(`Pergunta:`)} {askResult.question}
                  </p>
                )}
                <p className="text-sm" style={{ color: colors.text.primary }}>
                  {askResult.answer || JSON.stringify(askResult)}
                </p>
              </div>
            )}

            {insights.length > 0 ? (
              <div className="space-y-3">
                {insights.map((insight, idx) => {
                  const severityColors: Record<string, string> = {
                    success: colors.brand.green,
                    info: colors.brand.cyan,
                    warning:
                      colors.semantic.warning,
                    critical:
                      colors.semantic.error,
                  };
                  const severityIcons: Record<string, React.ElementType> = {
                    success: CheckCircle2,
                    info: Lightbulb,
                    warning: AlertCircle,
                    critical: XCircle,
                  };
                  const sColor = severityColors[insight.severity || 'info'] || colors.brand.cyan;
                  const SIcon = severityIcons[insight.severity || 'info'] || Lightbulb;

                  return (
                    <div
                      key={insight.id || idx}
                      className="p-4 rounded-lg border"
                      style={{
                        backgroundColor: colors.background.surface2,
                        borderColor: colors.stroke,
                        borderLeft: `3px solid ${sColor}`,
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="p-1.5 rounded-lg flex-shrink-0 mt-0.5"
                          style={{ backgroundColor: `${sColor}20` }}
                        >
                          <SIcon size={16} style={{ color: sColor }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium" style={{ color: colors.text.primary }}>
                              {insight.title || insight.type || 'Insight'}
                            </span>
                            {insight.severity && (
                              <span
                                className="px-2 py-0.5 rounded text-xs font-medium uppercase"
                                style={{
                                  backgroundColor: `${sColor}20`,
                                  color: sColor,
                                }}
                              >
                                {insight.severity}
                              </span>
                            )}
                          </div>
                          {insight.description && (
                            <p className="text-sm mb-2" style={{ color: colors.text.secondary }}>
                              {insight.description}
                            </p>
                          )}
                          {insight.recommendation && (
                            <div
                              className="text-sm p-2 rounded"
                              style={{
                                backgroundColor: `${sColor}08`,
                                color: colors.text.primary,
                              }}
                            >
                              <strong>{kloelT(`Recomendação:`)}</strong> {insight.recommendation}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                className="p-6 rounded-lg text-center"
                style={{ backgroundColor: colors.background.surface2 }}
              >
                <Lightbulb
                  size={32}
                  className="mx-auto mb-2"
                  style={{ color: colors.text.muted }}
                  aria-hidden="true"
                />
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  {kloelT(`Nenhum insight disponível no momento`)}
                </p>
              </div>
            )}
          </div>
        </CenterStage>
      </Section>

      {/* Queue Health + Config — side by side */}
      <Section spacing="lg">
        <CenterStage size="XL">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Queue Stats */}
            <div
              className="p-5 rounded-xl border"
              style={{
                backgroundColor: colors.background.surface1,
                borderColor: colors.stroke,
              }}
            >
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: `${colors.brand.cyan}20` }}
                >
                  <Server size={20} style={{ color: colors.brand.cyan }} aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                    {kloelT(`Saúde da Fila (BullMQ)`)}
                  </h2>
                  <p className="text-sm" style={{ color: colors.text.muted }}>
                    {kloelT(`Status do processamento de mensagens`)}
                  </p>
                </div>
                <div
                  className="px-3 py-1 rounded-full text-xs font-semibold uppercase"
                  style={{
                    backgroundColor:
                      queueHealthStatus === 'healthy'
                        ? `${colors.brand.green}20`
                        : queueHealthStatus === 'degraded'
                          ? 'rgba(245, 158, 11, 0.15)'
                          : queueHealthStatus === 'critical'
                            ? 'rgba(239, 68, 68, 0.12)'
                            : `${colors.brand.cyan}18`,
                    color:
                      queueHealthStatus === 'healthy'
                        ? colors.brand.green
                        : queueHealthStatus === 'degraded'
                          ? colors.semantic.warning
                          : queueHealthStatus === 'critical'
                            ? colors.semantic.error
                            : colors.brand.cyan,
                  }}
                >
                  {queueHealthStatus === 'healthy'
                    ? 'Saudável'
                    : queueHealthStatus === 'degraded'
                      ? 'Degradado'
                      : queueHealthStatus === 'critical'
                        ? 'Crítico'
                        : 'Desconhecido'}
                </div>
              </div>

              {queueStats ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <StatusPill
                      label={kloelT(`Esperando`)}
                      status={String(queueStats.waiting ?? 0)}
                    />
                    <StatusPill label={kloelT(`Ativas`)} status={String(queueStats.active ?? 0)} />
                    <StatusPill
                      label={kloelT(`Atrasadas`)}
                      status={String(queueStats.delayed ?? 0)}
                    />
                    <StatusPill label={kloelT(`Falhas`)} status={String(queueStats.failed ?? 0)} />
                  </div>
                  {(queueStats.completed != null || queueStats.paused != null) && (
                    <div className="grid grid-cols-2 gap-3">
                      {queueStats.completed != null && (
                        <StatusPill
                          label={kloelT(`Completadas`)}
                          status={String(queueStats.completed)}
                        />
                      )}
                      {queueStats.paused != null && (
                        <StatusPill label={kloelT(`Pausadas`)} status={String(queueStats.paused)} />
                      )}
                    </div>
                  )}
                  <div
                    className="flex items-center justify-between p-3 rounded-lg text-sm"
                    style={{ backgroundColor: colors.background.surface2 }}
                  >
                    <span style={{ color: colors.text.secondary }}>{kloelT(`Total na fila`)}</span>
                    <span
                      className="font-semibold"
                      style={{
                        color: colors.text.primary,
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      {queueTotal}
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  className="p-6 rounded-lg text-center"
                  style={{ backgroundColor: colors.background.surface2 }}
                >
                  <Server
                    size={32}
                    className="mx-auto mb-2"
                    style={{ color: colors.text.muted }}
                    aria-hidden="true"
                  />
                  <p className="text-sm" style={{ color: colors.text.muted }}>
                    {kloelT(`Dados da fila indisponíveis`)}
                  </p>
                </div>
              )}
            </div>

            {/* Runtime Config */}
            <div
              className="p-5 rounded-xl border"
              style={{
                backgroundColor: colors.background.surface1,
                borderColor: colors.stroke,
              }}
            >
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: `${colors.brand.cyan}20` }}
                >
                  <Database size={20} style={{ color: colors.brand.cyan }} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                    {kloelT(`Configuracao de Runtime`)}
                  </h2>
                  <p className="text-sm" style={{ color: colors.text.muted }}>
                    {kloelT(`Parametros de execucao do Autopilot`)}
                  </p>
                </div>
              </div>

              {runtimeConfig ? (
                <div className="space-y-2">
                  {Object.entries(runtimeConfig).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between p-3 rounded-lg"
                      style={{ backgroundColor: colors.background.surface2 }}
                    >
                      <span className="text-sm" style={{ color: colors.text.secondary }}>
                        {key}
                      </span>
                      <span
                        className="text-sm font-medium"
                        style={{
                          color:
                            value === true
                              ? colors.brand.green
                              : value === false
                                ? colors.semantic.error
                                : colors.text.primary,
                          fontFamily:
                            typeof value === 'number' ? "'JetBrains Mono', monospace" : undefined,
                        }}
                      >
                        {value === true ? 'true' : value === false ? 'false' : String(value ?? '—')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="p-6 rounded-lg text-center"
                  style={{ backgroundColor: colors.background.surface2 }}
                >
                  <Database
                    size={32}
                    className="mx-auto mb-2"
                    style={{ color: colors.text.muted }}
                    aria-hidden="true"
                  />
                  <p className="text-sm" style={{ color: colors.text.muted }}>
                    {kloelT(`Configuracao de runtime indisponivel`)}
                  </p>
                </div>
              )}
            </div>

            {/* Config Editor */}
            <div
              className="p-5 rounded-xl border"
              style={{
                backgroundColor: colors.background.surface1,
                borderColor: colors.stroke,
              }}
            >
              <div className="flex items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: `${colors.brand.green}20` }}
                  >
                    <Settings2 size={20} style={{ color: colors.brand.green }} aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                      {kloelT(`Configuração`)}
                    </h2>
                    <p className="text-sm" style={{ color: colors.text.muted }}>
                      {kloelT(`Ajustes do Autopilot`)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (isEditingConfig) {
                      setConfigDraft(config || {});
                    }
                    setIsEditingConfig(!isEditingConfig);
                  }}
                  className="p-2 rounded-lg transition-colors hover:bg-white/5"
                  style={{
                    color: isEditingConfig
                      ? colors.semantic.error
                      : colors.text.muted,
                  }}
                >
                  {isEditingConfig ? (
                    <XCircle size={18} aria-hidden="true" />
                  ) : (
                    <Settings2 size={18} aria-hidden="true" />
                  )}
                </button>
              </div>

              {config ? (
                <div className="space-y-3">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span style={{ color: colors.text.secondary }}>
                      {kloelT(`Flow de Conversão (ID)`)}
                    </span>
                    <input
                      value={configDraft.conversionFlowId || ''}
                      onChange={(e) =>
                        setConfigDraft((prev) => ({
                          ...prev,
                          conversionFlowId: e.target.value || null,
                        }))
                      }
                      disabled={!isEditingConfig}
                      placeholder={kloelT(`ID do flow`)}
                      className="px-3 py-2.5 rounded-lg border outline-none text-sm"
                      style={{
                        backgroundColor: isEditingConfig
                          ? colors.background.surface2
                          : colors.background.obsidian,
                        borderColor: colors.stroke,
                        color: colors.text.primary,
                        opacity: isEditingConfig ? 1 : 0.7,
                      }}
                    />
                  </label>

                  <label className="flex flex-col gap-1.5 text-sm">
                    <span style={{ color: colors.text.secondary }}>{kloelT(`Moeda Padrão`)}</span>
                    <input
                      value={configDraft.currencyDefault || ''}
                      onChange={(e) =>
                        setConfigDraft((prev) => ({ ...prev, currencyDefault: e.target.value }))
                      }
                      disabled={!isEditingConfig}
                      placeholder="BRL"
                      className="px-3 py-2.5 rounded-lg border outline-none text-sm"
                      style={{
                        backgroundColor: isEditingConfig
                          ? colors.background.surface2
                          : colors.background.obsidian,
                        borderColor: colors.stroke,
                        color: colors.text.primary,
                        opacity: isEditingConfig ? 1 : 0.7,
                      }}
                    />
                  </label>

                  <label className="flex flex-col gap-1.5 text-sm">
                    <span style={{ color: colors.text.secondary }}>
                      {kloelT(`Template de Recuperação`)}
                    </span>
                    <input
                      value={configDraft.recoveryTemplateName || ''}
                      onChange={(e) =>
                        setConfigDraft((prev) => ({
                          ...prev,
                          recoveryTemplateName: e.target.value || null,
                        }))
                      }
                      disabled={!isEditingConfig}
                      placeholder={kloelT(`Nome do template`)}
                      className="px-3 py-2.5 rounded-lg border outline-none text-sm"
                      style={{
                        backgroundColor: isEditingConfig
                          ? colors.background.surface2
                          : colors.background.obsidian,
                        borderColor: colors.stroke,
                        color: colors.text.primary,
                        opacity: isEditingConfig ? 1 : 0.7,
                      }}
                    />
                  </label>

                  {isEditingConfig && (
                    <div className="flex gap-3 pt-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleSaveConfig}
                        isLoading={isSavingConfig}
                        leftIcon={
                          !isSavingConfig ? <Save size={14} aria-hidden="true" /> : undefined
                        }
                      >
                        {isSavingConfig ? 'Salvando...' : 'Salvar'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setConfigDraft(config || {});
                          setIsEditingConfig(false);
                        }}
                      >
                        {kloelT(`Cancelar`)}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className="p-6 rounded-lg text-center"
                  style={{ backgroundColor: colors.background.surface2 }}
                >
                  <Settings2
                    size={32}
                    className="mx-auto mb-2"
                    style={{ color: colors.text.muted }}
                    aria-hidden="true"
                  />
                  <p className="text-sm" style={{ color: colors.text.muted }}>
                    {kloelT(`Configuração indisponível`)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </CenterStage>
      </Section>

      {/* Help Section */}
      <Section spacing="lg">
        <CenterStage size="XL">
          <div
            className="p-6 rounded-xl text-center"
            style={{
              background: `linear-gradient(135deg, ${colors.brand.green}10, ${colors.brand.cyan}10)`,
              border: `1px solid ${colors.stroke}`,
            }}
          >
            <Bot
              size={40}
              className="mx-auto mb-4"
              style={{ color: colors.brand.green }}
              aria-hidden="true"
            />
            <h3 className="text-lg font-semibold mb-2" style={{ color: colors.text.primary }}>
              {kloelT(`Precisa de ajuda com o Autopilot?`)}
            </h3>
            <p className="text-sm mb-4 max-w-md mx-auto" style={{ color: colors.text.muted }}>
              {kloelT(`O Autopilot usa IA para responder automaticamente, qualificar leads e direcionar para
              conversão. Configure fluxos personalizados para maximizar resultados.`)}
            </p>
            <div className="flex justify-center gap-3">
              <Button variant="secondary" size="sm" onClick={() => navigate('/flow')}>
                <Settings2 size={16} className="mr-2" aria-hidden="true" />

                {kloelT(`Configurar Fluxos`)}
              </Button>
              <Button variant="primary" size="sm" onClick={() => navigate('/chat')}>
                <MessageSquare size={16} className="mr-2" aria-hidden="true" />

                {kloelT(`Falar com KLOEL`)}
              </Button>
            </div>
          </div>
        </CenterStage>
      </Section>
    </div>
  );
}
