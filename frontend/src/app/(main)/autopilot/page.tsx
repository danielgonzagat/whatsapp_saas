'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  Power,
  Activity,
  TrendingUp,
  Users,
  MessageSquare,
  Zap,
  RefreshCw,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  BarChart3,
  Settings2,
  Play,
  Pause,
  ArrowUpRight,
  Sparkles,
  Calendar,
  Filter,
  Server,
  Database,
  Cable,
  Workflow,
  Stethoscope,
  Send,
  DollarSign,
  Lightbulb,
  Layers,
  Save,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  CenterStage,
  Section,
  StageHeadline,
  MissionCards,
  Button,
  type MissionCardData,
} from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import {
  getAutopilotStatus,
  getAutopilotStats,
  getAutopilotImpact,
  getAutopilotActions,
  getAutopilotPipeline,
  getSystemHealth,
  runAutopilotSmokeTest,
  toggleAutopilot,
  exportAutopilotActions,
  getAutopilotMoneyReport,
  getAutopilotRevenueEvents,
  getAutopilotConfig,
  updateAutopilotConfig,
  activateMoneyMachine,
  askAutopilotInsights,
  sendAutopilotDirectMessage,
  getAutopilotRuntimeConfig,
  apiFetch,
  buildQuery,
  tokenStorage,
} from '@/lib/api';
import type { MoneyMachineResult, AskInsightsResult, RuntimeConfig } from '@/lib/api';

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
  [key: string]: any;
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
  [key: string]: any;
}

interface AutopilotInsight {
  id?: string;
  type?: string;
  title?: string;
  description?: string;
  severity?: 'info' | 'warning' | 'critical' | 'success';
  recommendation?: string;
  createdAt?: string;
  [key: string]: any;
}

interface QueueStats {
  waiting?: number;
  active?: number;
  delayed?: number;
  completed?: number;
  failed?: number;
  paused?: number;
  [key: string]: any;
}

interface AutopilotConfigData {
  conversionFlowId?: string | null;
  currencyDefault?: string;
  recoveryTemplateName?: string | null;
  [key: string]: any;
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
          />
        )}
      </div>
    </div>
  );
}

function ActionRow({ action }: { action: AutopilotAction }) {
  const statusColors: Record<string, string> = {
    success: colors.brand.green,
    error: '#EF4444',
    skipped: colors.brand.cyan,
    scheduled: '#F59E0B',
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
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
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
    return { color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' };
  }
  if (
    ['DOWN', 'FAILED', 'ERROR', 'SKIPPED', 'DISABLED', 'BILLING_SUSPENDED', 'MISSING'].includes(
      normalized,
    )
  ) {
    return { color: '#EF4444', bg: 'rgba(239, 68, 68, 0.12)' };
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

export default function AutopilotPage() {
  const workspaceId = useWorkspaceId();
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [status, setStatus] = useState<AutopilotStatus | null>(null);
  const [stats, setStats] = useState<AutopilotStats | null>(null);
  const [impact, setImpact] = useState<AutopilotImpact | null>(null);
  const [pipeline, setPipeline] = useState<AutopilotPipeline | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [smokeResult, setSmokeResult] = useState<AutopilotSmokeTestResult | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState(
    'Olá, quero validar se o Kloel está respondendo corretamente no WhatsApp.',
  );
  const [testLiveSend, setTestLiveSend] = useState(false);
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

  // Money Machine
  const [isRunningMoneyMachine, setIsRunningMoneyMachine] = useState(false);
  const [moneyMachineResult, setMoneyMachineResult] = useState<MoneyMachineResult | null>(null);
  const [moneyMachineTopN, setMoneyMachineTopN] = useState(200);
  const [moneyMachineAutoSend, setMoneyMachineAutoSend] = useState(false);
  const [moneyMachineSmartTime, setMoneyMachineSmartTime] = useState(false);

  // Ask AI Insights
  const [askQuestion, setAskQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [askResult, setAskResult] = useState<AskInsightsResult | null>(null);

  // Direct Send
  const [sendContactId, setSendContactId] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
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
        apiFetch<any>(`/autopilot/insights${buildQuery({ workspaceId: effectiveWorkspaceId })}`),
        apiFetch<any>(`/autopilot/queue${buildQuery({ workspaceId: effectiveWorkspaceId })}`),
        getAutopilotConfig(effectiveWorkspaceId, token),
        getAutopilotRuntimeConfig(),
      ]);

      const statusData: AutopilotStatus | null =
        statusResult.status === 'fulfilled' ? (statusResult.value as AutopilotStatus) : null;
      setStatus(statusData);

      if (statsResult.status === 'fulfilled') {
        setStats((statsResult.value as AutopilotStats) || null);
      } else {
        setStats(null);
      }

      if (impactResult.status === 'fulfilled') {
        setImpact((impactResult.value as AutopilotImpact) || null);
      } else {
        setImpact(null);
      }

      if (actionsResult.status === 'fulfilled') {
        setActions(
          Array.isArray(actionsResult.value) ? (actionsResult.value as AutopilotAction[]) : [],
        );
      } else {
        setActions([]);
      }

      if (pipelineResult.status === 'fulfilled') {
        setPipeline((pipelineResult.value as AutopilotPipeline) || null);
      } else {
        setPipeline(null);
      }

      if (systemHealthResult.status === 'fulfilled') {
        setSystemHealth((systemHealthResult.value as SystemHealth) || null);
      } else {
        setSystemHealth(null);
      }

      if (moneyReportResult.status === 'fulfilled') {
        const mrVal = moneyReportResult.value as any;
        setMoneyReport((mrVal?.data ?? mrVal) as MoneyReport | null);
      } else {
        setMoneyReport(null);
      }

      if (revenueEventsResult.status === 'fulfilled') {
        const reVal = revenueEventsResult.value as any;
        const eventsData = reVal?.data ?? reVal;
        setRevenueEvents(Array.isArray(eventsData) ? (eventsData as RevenueEvent[]) : []);
      } else {
        setRevenueEvents([]);
      }

      if (insightsResult.status === 'fulfilled') {
        const insVal = insightsResult.value as any;
        const insData = insVal?.data ?? insVal;
        setInsights(Array.isArray(insData) ? (insData as AutopilotInsight[]) : []);
      } else {
        setInsights([]);
      }

      if (queueStatsResult.status === 'fulfilled') {
        const qsVal = queueStatsResult.value as any;
        setQueueStats((qsVal?.data ?? qsVal) as QueueStats | null);
      } else {
        setQueueStats(null);
      }

      if (configResult.status === 'fulfilled') {
        const cfgVal = configResult.value as any;
        const cfgData = (cfgVal?.data ?? cfgVal) as AutopilotConfigData;
        setConfig(cfgData);
        setConfigDraft(cfgData || {});
      } else {
        setConfig(null);
      }

      if (runtimeConfigResult.status === 'fulfilled') {
        setRuntimeConfig(runtimeConfigResult.value as RuntimeConfig);
      } else {
        setRuntimeConfig(null);
      }

      const partialError =
        statsResult.status === 'rejected' ||
        impactResult.status === 'rejected' ||
        actionsResult.status === 'rejected' ||
        pipelineResult.status === 'rejected' ||
        systemHealthResult.status === 'rejected';

      // Se billingSuspended, alguns endpoints podem responder 403/erro — isso não deve bloquear a tela.
      if (statusData && statusData.billingSuspended) {
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
    if (!effectiveWorkspaceId || !token || !status) return;

    try {
      setIsToggling(true);
      setError(null);
      const data = await toggleAutopilot(effectiveWorkspaceId, !status.enabled, token);

      setStatus((prev) => (prev ? { ...prev, enabled: data.enabled } : null));

      await fetchAutopilotData();
    } catch (err: any) {
      console.error('Error toggling autopilot:', err);
      setError(err.message || 'Erro ao alterar status do Autopilot');
    } finally {
      setIsToggling(false);
    }
  };

  const filteredActions = actions.filter((a) =>
    statusFilter === 'all' ? true : a.status === statusFilter,
  );

  const handleExportActions = async () => {
    if (!effectiveWorkspaceId || !token) return;
    try {
      const csv = await exportAutopilotActions(
        effectiveWorkspaceId,
        statusFilter === 'all' ? undefined : statusFilter,
        token,
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

  const handleSmokeTest = async () => {
    if (!effectiveWorkspaceId || !token) return;
    try {
      setIsTesting(true);
      setError(null);
      const data = await runAutopilotSmokeTest({
        workspaceId: effectiveWorkspaceId,
        phone: testPhone || undefined,
        message: testMessage || undefined,
        liveSend: testLiveSend,
        waitMs: 12000,
        token,
      });
      setSmokeResult(data as AutopilotSmokeTestResult);
      await fetchAutopilotData();
    } catch (err: any) {
      console.error('Error running autopilot smoke test:', err);
      setError(err.message || 'Erro ao executar smoke test do Autopilot');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!effectiveWorkspaceId || !token) return;
    try {
      setIsSavingConfig(true);
      setError(null);
      await updateAutopilotConfig(effectiveWorkspaceId, configDraft, token);
      setConfig(configDraft);
      setIsEditingConfig(false);
      await fetchAutopilotData();
    } catch (err: any) {
      console.error('Error saving autopilot config:', err);
      setError(err.message || 'Erro ao salvar configuração');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleMoneyMachine = async () => {
    if (!effectiveWorkspaceId) return;
    try {
      setIsRunningMoneyMachine(true);
      setMoneyMachineResult(null);
      const result = await activateMoneyMachine({
        workspaceId: effectiveWorkspaceId,
        topN: moneyMachineTopN,
        autoSend: moneyMachineAutoSend,
        smartTime: moneyMachineSmartTime,
      });
      setMoneyMachineResult(result);
    } catch (err: any) {
      setError(err.message || 'Erro ao executar Money Machine');
    } finally {
      setIsRunningMoneyMachine(false);
    }
  };

  const handleAskInsights = async () => {
    if (!effectiveWorkspaceId || !askQuestion.trim()) return;
    try {
      setIsAsking(true);
      setAskResult(null);
      const result = await askAutopilotInsights(effectiveWorkspaceId, askQuestion.trim());
      setAskResult(result);
    } catch (err: any) {
      setError(err.message || 'Erro ao consultar insights da IA');
    } finally {
      setIsAsking(false);
    }
  };

  const handleSendDirect = async () => {
    if (!effectiveWorkspaceId || !sendContactId.trim() || !sendMessage.trim()) return;
    try {
      setIsSending(true);
      setSendResult(null);
      const result = await sendAutopilotDirectMessage({
        workspaceId: effectiveWorkspaceId,
        contactId: sendContactId.trim(),
        message: sendMessage.trim(),
      });
      setSendResult({ success: true, messageId: result.messageId });
      setSendMessage('');
    } catch (err: any) {
      setSendResult({ success: false, error: err.message || 'Erro ao enviar mensagem' });
    } finally {
      setIsSending(false);
    }
  };

  const formatCurrency = (value?: number) => {
    if (value == null) return 'R$ 0';
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const queueTotal = queueStats
    ? (queueStats.waiting || 0) +
      (queueStats.active || 0) +
      (queueStats.delayed || 0) +
      (queueStats.failed || 0)
    : 0;

  const queueHealthStatus = (() => {
    if (!queueStats) return 'unknown';
    if ((queueStats.failed || 0) > 10) return 'critical';
    if ((queueStats.waiting || 0) > 50 || (queueStats.delayed || 0) > 20) return 'degraded';
    return 'healthy';
  })();

  const missionCards: MissionCardData[] = [
    {
      id: 'auto-responses',
      title: 'Respostas Automáticas',
      description: 'IA responde leads em segundos',
      icon: MessageSquare,
      status: status?.enabled ? 'completed' : 'pending',
      action: () => (window.location.href = '/whatsapp'),
    },
    {
      id: 'lead-qualification',
      title: 'Qualificação de Leads',
      description: 'Identifica intenção de compra',
      icon: Users,
      status: stats?.actionsLast7d ? 'completed' : 'pending',
      action: () => (window.location.href = '/crm'),
    },
    {
      id: 'sales-flows',
      title: 'Fluxos de Vendas',
      description: 'Direciona para conversão',
      icon: Zap,
      status: 'completed',
      action: () => (window.location.href = '/flow'),
    },
    {
      id: 'analytics',
      title: 'Analytics',
      description: 'Métricas em tempo real',
      icon: BarChart3,
      status: 'completed',
      action: () => (window.location.href = '/analytics'),
    },
  ];

  if (isLoading && !stats) {
    return (
      <div
        className="min-h-full flex items-center justify-center"
        style={{ backgroundColor: colors.background.obsidian }}
      >
        <div className="flex flex-col items-center gap-4">
          <RefreshCw size={32} className="animate-spin" style={{ color: colors.brand.green }} />
          <span style={{ color: colors.text.muted }}>Carregando Autopilot...</span>
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
                VENDAS NO PILOTO AUTOMÁTICO
              </p>
              <StageHeadline
                headline="Autopilot"
                highlight="Autopilot"
                subheadline="IA que responde, qualifica e converte leads 24/7"
              />
            </div>

            {/* Toggle Button */}
            <div className="flex flex-col items-center gap-2">
              <button
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
                    <Play size={20} style={{ color: colors.brand.green }} />
                  ) : (
                    <Pause size={20} style={{ color: colors.text.muted }} />
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
                <span className="text-xs flex items-center gap-1" style={{ color: '#EF4444' }}>
                  <AlertCircle size={12} />
                  Cobrança pendente
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
              <AlertCircle size={20} style={{ color: '#EF4444' }} />
              <span style={{ color: '#EF4444' }}>{error}</span>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-sm underline"
                style={{ color: colors.text.muted }}
              >
                Fechar
              </button>
            </div>
          </CenterStage>
        </Section>
      )}

      {/* Stats Grid */}
      <Section spacing="md">
        <CenterStage size="XL">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={Activity}
              label="Ações (7 dias)"
              value={stats?.actionsLast7d || 0}
              color={colors.brand.green}
            />
            <StatCard
              icon={Users}
              label="Contatos"
              value={stats?.contactsTracked || 0}
              color={colors.brand.cyan}
            />
            <StatCard
              icon={TrendingUp}
              label="Taxa de Resposta"
              value={impact ? `${Math.round(impact.replyRate * 100)}%` : '—'}
              subValue={impact?.repliedContacts ? `${impact.repliedContacts} resp.` : undefined}
              color={colors.brand.green}
            />
            <StatCard
              icon={Sparkles}
              label="Conversões"
              value={stats?.conversionsLast7d || 0}
              subValue={
                stats?.conversionsAmountLast7d
                  ? `R$ ${stats.conversionsAmountLast7d.toLocaleString('pt-BR')}`
                  : undefined
              }
              color="#F59E0B"
            />
          </div>
        </CenterStage>
      </Section>

      <Section spacing="md">
        <CenterStage size="XL">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div
              className="p-5 rounded-xl border"
              style={{
                backgroundColor: colors.background.surface1,
                borderColor: colors.stroke,
              }}
            >
              <div className="flex items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <Workflow size={20} style={{ color: colors.brand.green }} />
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                      Pipeline em Tempo Real
                    </h2>
                    <p className="text-sm" style={{ color: colors.text.muted }}>
                      Meta Cloud API → DB → fila → worker → OpenAI
                    </p>
                  </div>
                </div>
                <button
                  onClick={fetchAutopilotData}
                  disabled={isLoading}
                  className="p-2 rounded-lg transition-colors hover:bg-white/5"
                  style={{ color: colors.text.muted }}
                >
                  <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <StatCard
                  icon={MessageSquare}
                  label="Recebidas (24h)"
                  value={pipeline?.messages?.received || 0}
                  color={colors.brand.cyan}
                />
                <StatCard
                  icon={Send}
                  label="Respondidas (24h)"
                  value={pipeline?.messages?.responded || 0}
                  color={colors.brand.green}
                />
                <StatCard
                  icon={AlertCircle}
                  label="Pendentes"
                  value={pipeline?.messages?.unansweredEstimate || 0}
                  color="#F59E0B"
                />
                <StatCard
                  icon={XCircle}
                  label="Falhas"
                  value={pipeline?.autopilot?.failed || 0}
                  color="#EF4444"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <StatusPill
                  label="Autonomia"
                  status={pipeline?.autonomy?.autopilotEnabled ? 'UP' : 'DOWN'}
                />
                <StatusPill label="WhatsApp" status={pipeline?.autonomy?.whatsappStatus} />
                <StatusPill label="Fila waiting" status={String(pipeline?.queue?.waiting ?? 0)} />
                <StatusPill label="Fila active" status={String(pipeline?.queue?.active ?? 0)} />
              </div>

              <div className="space-y-3 text-sm">
                <div
                  className="p-3 rounded-lg"
                  style={{ backgroundColor: colors.background.surface2 }}
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span style={{ color: colors.text.secondary }}>Última inbound</span>
                    <span style={{ color: colors.text.muted }}>
                      {formatDateTime(pipeline?.messages?.lastInbound?.createdAt)}
                    </span>
                  </div>
                  <p style={{ color: colors.text.primary }}>
                    {pipeline?.messages?.lastInbound?.content ||
                      'Nenhuma mensagem inbound registrada'}
                  </p>
                </div>
                <div
                  className="p-3 rounded-lg"
                  style={{ backgroundColor: colors.background.surface2 }}
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span style={{ color: colors.text.secondary }}>Último evento do Autopilot</span>
                    <span style={{ color: colors.text.muted }}>
                      {formatDateTime(pipeline?.autopilot?.lastEvent?.createdAt)}
                    </span>
                  </div>
                  <p style={{ color: colors.text.primary }}>
                    {pipeline?.autopilot?.lastEvent?.status || 'Sem eventos recentes'}
                    {pipeline?.autopilot?.lastEvent?.reason
                      ? ` — ${pipeline.autopilot.lastEvent.reason}`
                      : ''}
                  </p>
                </div>
              </div>
            </div>

            <div
              className="p-5 rounded-xl border"
              style={{
                backgroundColor: colors.background.surface1,
                borderColor: colors.stroke,
              }}
            >
              <div className="flex items-center gap-3 mb-5">
                <Stethoscope size={20} style={{ color: colors.brand.cyan }} />
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                    Saúde Real do Sistema
                  </h2>
                  <p className="text-sm" style={{ color: colors.text.muted }}>
                    Dependências obrigatórias para o Kloel não ficar silencioso.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <StatusPill label="Sistema" status={systemHealth?.status} />
                <StatusPill label="Banco" status={systemHealth?.details?.database?.status} />
                <StatusPill label="Redis" status={systemHealth?.details?.redis?.status} />
                <StatusPill label="Meta Cloud" status={systemHealth?.details?.whatsapp?.status} />
                <StatusPill label="Worker" status={systemHealth?.details?.worker?.status} />
                <StatusPill label="Config crítica" status={systemHealth?.details?.config?.status} />
                <StatusPill label="OpenAI" status={systemHealth?.details?.openai?.status} />
                <StatusPill
                  label="Google Auth"
                  status={systemHealth?.details?.googleAuth?.status}
                />
              </div>

              {Array.isArray(systemHealth?.details?.config?.missing) &&
                systemHealth?.details?.config?.missing.length > 0 && (
                  <div
                    className="mt-4 p-3 rounded-lg text-sm"
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.18)',
                      color: '#FCA5A5',
                    }}
                  >
                    Configurações ausentes: {systemHealth.details.config.missing.join(', ')}
                  </div>
                )}
            </div>
          </div>
        </CenterStage>
      </Section>

      <Section spacing="md">
        <CenterStage size="XL">
          <div
            className="p-5 rounded-xl border"
            style={{
              backgroundColor: colors.background.surface1,
              borderColor: colors.stroke,
            }}
          >
            <div className="flex items-start justify-between gap-4 mb-5 flex-col md:flex-row">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                  Testar Autopilot
                </h2>
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  Executa um smoke test do pipeline ponta a ponta. O padrão é dry-run, sem enviar
                  nada ao cliente.
                </p>
              </div>
              <Button
                variant={testLiveSend ? 'danger' : 'primary'}
                size="md"
                onClick={handleSmokeTest}
                isLoading={isTesting}
                leftIcon={!isTesting ? <Play size={16} /> : undefined}
              >
                {isTesting
                  ? 'Executando teste...'
                  : testLiveSend
                    ? 'Testar com envio real'
                    : 'Testar Autopilot'}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <label className="flex flex-col gap-2 text-sm">
                <span style={{ color: colors.text.secondary }}>Telefone de teste</span>
                <input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="5511999999999"
                  className="px-4 py-3 rounded-lg border outline-none"
                  style={{
                    backgroundColor: colors.background.surface2,
                    borderColor: colors.stroke,
                    color: colors.text.primary,
                  }}
                />
              </label>

              <label className="flex items-center gap-3 text-sm mt-7 md:mt-0">
                <input
                  type="checkbox"
                  checked={testLiveSend}
                  onChange={(e) => setTestLiveSend(e.target.checked)}
                />
                <span style={{ color: colors.text.secondary }}>
                  Enviar de verdade para esse número
                </span>
              </label>
            </div>

            <label className="flex flex-col gap-2 text-sm">
              <span style={{ color: colors.text.secondary }}>Mensagem de teste</span>
              <textarea
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                rows={3}
                className="px-4 py-3 rounded-lg border outline-none resize-none"
                style={{
                  backgroundColor: colors.background.surface2,
                  borderColor: colors.stroke,
                  color: colors.text.primary,
                }}
              />
            </label>

            {smokeResult && (
              <div
                className="mt-5 p-4 rounded-xl border"
                style={{
                  backgroundColor: colors.background.surface2,
                  borderColor: colors.stroke,
                }}
              >
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <StatusPill label="Modo" status={smokeResult.mode} />
                  <StatusPill label="Resultado" status={smokeResult.result?.status} />
                  <StatusPill
                    label="Fila waiting"
                    status={String(smokeResult.queue?.waiting ?? 0)}
                  />
                  <StatusPill label="Fila failed" status={String(smokeResult.queue?.failed ?? 0)} />
                </div>
                <div className="space-y-2 text-sm">
                  <p style={{ color: colors.text.primary }}>
                    <strong>Telefone:</strong> {smokeResult.phone}
                  </p>
                  <p style={{ color: colors.text.primary }}>
                    <strong>Mensagem:</strong> {smokeResult.message}
                  </p>
                  {smokeResult.result?.previewText && (
                    <div>
                      <p className="mb-1" style={{ color: colors.text.secondary }}>
                        Preview da resposta do Kloel
                      </p>
                      <div
                        className="p-3 rounded-lg"
                        style={{
                          backgroundColor: colors.background.obsidian,
                          color: colors.text.primary,
                        }}
                      >
                        {smokeResult.result.previewText}
                      </div>
                    </div>
                  )}
                  {!smokeResult.result?.previewText && smokeResult.result?.reason && (
                    <p style={{ color: colors.text.primary }}>
                      <strong>Motivo:</strong> {smokeResult.result.reason}
                    </p>
                  )}
                  {smokeResult.result?.error && (
                    <p style={{ color: '#FCA5A5' }}>
                      <strong>Erro:</strong> {smokeResult.result.error}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </CenterStage>
      </Section>

      {/* Secondary Stats */}
      <Section spacing="sm">
        <CenterStage size="XL">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard
              icon={Clock}
              label="Tempo Médio Resposta"
              value={impact?.avgReplyMinutes ? `${impact.avgReplyMinutes}min` : '—'}
              color={colors.brand.cyan}
            />
            <StatCard
              icon={CheckCircle2}
              label="Sucesso"
              value={stats?.actionsByType?.REPLY || stats?.actionsByType?.['SEND_MESSAGE'] || 0}
              color={colors.brand.green}
            />
            <StatCard
              icon={AlertCircle}
              label="Erros"
              value={stats?.errorsLast7d || 0}
              color="#EF4444"
            />
            <StatCard
              icon={XCircle}
              label="Ignorados"
              value={stats?.skippedTotal || 0}
              subValue={stats?.skippedOptin ? `${stats.skippedOptin} opt-in` : undefined}
              color={colors.text.muted}
            />
            <StatCard
              icon={Calendar}
              label="Agendados"
              value={stats?.scheduledCount || 0}
              color="#F59E0B"
            />
          </div>
        </CenterStage>
      </Section>

      {/* Mission Cards */}
      <Section spacing="lg">
        <CenterStage size="XL">
          <h2 className="text-lg font-semibold mb-4" style={{ color: colors.text.primary }}>
            Recursos Ativos
          </h2>
          <MissionCards missions={missionCards} />
        </CenterStage>
      </Section>

      {/* Money Machine */}
      <Section spacing="lg">
        <CenterStage size="XL">
          <div
            className="p-5 rounded-xl border"
            style={{
              backgroundColor: colors.background.surface1,
              borderColor: colors.stroke,
            }}
          >
            <div className="flex items-start justify-between gap-4 mb-5 flex-col md:flex-row">
              <div className="flex items-center gap-3">
                <div
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)' }}
                >
                  <DollarSign size={20} style={{ color: '#F59E0B' }} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                    Money Machine
                  </h2>
                  <p className="text-sm" style={{ color: colors.text.muted }}>
                    Varre conversas e gera campanhas de reativacao e fechamento automaticamente
                  </p>
                </div>
              </div>
              <Button
                variant="primary"
                size="md"
                onClick={handleMoneyMachine}
                isLoading={isRunningMoneyMachine}
                leftIcon={!isRunningMoneyMachine ? <Zap size={16} /> : undefined}
              >
                {isRunningMoneyMachine ? 'Executando...' : 'Executar Money Machine'}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span style={{ color: colors.text.secondary }}>Top N contatos</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={moneyMachineTopN}
                  onChange={(e) => setMoneyMachineTopN(Number(e.target.value) || 200)}
                  className="px-3 py-2.5 rounded-lg border outline-none text-sm"
                  style={{
                    backgroundColor: colors.background.surface2,
                    borderColor: colors.stroke,
                    color: colors.text.primary,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                />
              </label>
              <label className="flex items-center gap-3 text-sm mt-6 md:mt-0">
                <input
                  type="checkbox"
                  checked={moneyMachineAutoSend}
                  onChange={(e) => setMoneyMachineAutoSend(e.target.checked)}
                />
                <span style={{ color: colors.text.secondary }}>Envio automatico</span>
              </label>
              <label className="flex items-center gap-3 text-sm mt-0">
                <input
                  type="checkbox"
                  checked={moneyMachineSmartTime}
                  onChange={(e) => setMoneyMachineSmartTime(e.target.checked)}
                />
                <span style={{ color: colors.text.secondary }}>Horario inteligente</span>
              </label>
            </div>

            {moneyMachineResult && (
              <div
                className="p-4 rounded-lg border"
                style={{
                  backgroundColor: colors.background.surface2,
                  borderColor: colors.stroke,
                }}
              >
                <p
                  className="text-xs font-medium tracking-widest mb-3 uppercase"
                  style={{ color: colors.text.muted }}
                >
                  Resultado
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {moneyMachineResult.processed != null && (
                    <StatCard
                      icon={Users}
                      label="Processados"
                      value={moneyMachineResult.processed}
                      color={colors.brand.cyan}
                    />
                  )}
                  {moneyMachineResult.sent != null && (
                    <StatCard
                      icon={Send}
                      label="Enviados"
                      value={moneyMachineResult.sent}
                      color={colors.brand.green}
                    />
                  )}
                  {moneyMachineResult.scheduled != null && (
                    <StatCard
                      icon={Calendar}
                      label="Agendados"
                      value={moneyMachineResult.scheduled}
                      color="#F59E0B"
                    />
                  )}
                  {moneyMachineResult.skipped != null && (
                    <StatCard
                      icon={XCircle}
                      label="Ignorados"
                      value={moneyMachineResult.skipped}
                      color={colors.text.muted}
                    />
                  )}
                  {moneyMachineResult.errors != null && (
                    <StatCard
                      icon={AlertCircle}
                      label="Erros"
                      value={moneyMachineResult.errors}
                      color="#EF4444"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </CenterStage>
      </Section>

      {/* Direct Message Send */}
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
                <Send size={20} style={{ color: colors.brand.cyan }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                  Envio Direto
                </h2>
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  Envia uma mensagem manualmente para um contato via Autopilot
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span style={{ color: colors.text.secondary }}>ID do Contato</span>
                <input
                  value={sendContactId}
                  onChange={(e) => setSendContactId(e.target.value)}
                  placeholder="ID do contato no CRM"
                  className="px-3 py-2.5 rounded-lg border outline-none text-sm"
                  style={{
                    backgroundColor: colors.background.surface2,
                    borderColor: colors.stroke,
                    color: colors.text.primary,
                  }}
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm">
                <span style={{ color: colors.text.secondary }}>Mensagem</span>
                <input
                  value={sendMessage}
                  onChange={(e) => setSendMessage(e.target.value)}
                  placeholder="Mensagem a enviar..."
                  className="px-3 py-2.5 rounded-lg border outline-none text-sm"
                  style={{
                    backgroundColor: colors.background.surface2,
                    borderColor: colors.stroke,
                    color: colors.text.primary,
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendDirect();
                    }
                  }}
                />
              </label>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSendDirect}
                isLoading={isSending}
                leftIcon={!isSending ? <Send size={14} /> : undefined}
              >
                {isSending ? 'Enviando...' : 'Enviar Mensagem'}
              </Button>

              {sendResult && (
                <div
                  className="px-3 py-2 rounded-lg text-sm flex items-center gap-2"
                  style={{
                    backgroundColor: sendResult.success
                      ? `${colors.brand.green}15`
                      : 'rgba(239, 68, 68, 0.1)',
                    color: sendResult.success ? colors.brand.green : '#EF4444',
                  }}
                >
                  {sendResult.success ? (
                    <>
                      <CheckCircle2 size={14} />
                      Mensagem enviada
                      {sendResult.messageId && (
                        <span style={{ color: colors.text.muted }}>
                          — ID: {sendResult.messageId}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <XCircle size={14} />
                      {sendResult.error || 'Erro ao enviar'}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </CenterStage>
      </Section>

      {/* Recent Actions */}
      <Section spacing="lg">
        <CenterStage size="XL">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
              Ações Recentes
            </h2>
            <div className="flex items-center gap-2">
              <Filter size={16} style={{ color: colors.text.muted }} />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-sm border outline-none"
                style={{
                  backgroundColor: colors.background.surface2,
                  borderColor: colors.stroke,
                  color: colors.text.primary,
                }}
              >
                <option value="all">Todos</option>
                <option value="success">Sucesso</option>
                <option value="error">Erros</option>
                <option value="skipped">Ignorados</option>
                <option value="scheduled">Agendados</option>
              </select>
              <button
                onClick={fetchAutopilotData}
                disabled={isLoading}
                className="p-2 rounded-lg transition-colors hover:bg-white/5"
                style={{ color: colors.text.muted }}
              >
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {filteredActions.length === 0 ? (
              <div
                className="p-8 rounded-xl text-center"
                style={{
                  backgroundColor: colors.background.surface1,
                  border: `1px solid ${colors.stroke}`,
                }}
              >
                <Bot size={48} className="mx-auto mb-4" style={{ color: colors.text.muted }} />
                <p style={{ color: colors.text.muted }}>
                  {statusFilter === 'all'
                    ? 'Nenhuma ação registrada ainda'
                    : `Nenhuma ação com status "${statusFilter}"`}
                </p>
                {!status?.enabled && (
                  <p className="mt-2 text-sm" style={{ color: colors.text.muted }}>
                    Ative o Autopilot para começar a automatizar
                  </p>
                )}
              </div>
            ) : (
              filteredActions.map((action) => <ActionRow key={action.id} action={action} />)
            )}
          </div>

          {actions.length >= 50 && (
            <div className="mt-4 text-center">
              <Button variant="ghost" size="sm" onClick={handleExportActions}>
                <ArrowUpRight size={16} className="mr-2" />
                Exportar todas as ações
              </Button>
            </div>
          )}
        </CenterStage>
      </Section>

      {/* Impact Samples */}
      {impact && impact.samples.length > 0 && (
        <Section spacing="lg">
          <CenterStage size="XL">
            <h2 className="text-lg font-semibold mb-4" style={{ color: colors.text.primary }}>
              Exemplos de Impacto
            </h2>
            <div
              className="p-4 rounded-xl"
              style={{
                backgroundColor: colors.background.surface1,
                border: `1px solid ${colors.stroke}`,
              }}
            >
              <div className="space-y-3">
                {impact.samples.map((sample, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-lg"
                    style={{ backgroundColor: colors.background.surface2 }}
                  >
                    <div>
                      <span className="font-medium" style={{ color: colors.text.primary }}>
                        {sample.contact}
                      </span>
                      <span className="text-sm ml-2" style={{ color: colors.text.muted }}>
                        respondeu em {sample.delayMinutes} min
                      </span>
                    </div>
                    <span className="text-xs" style={{ color: colors.text.muted }}>
                      {new Date(sample.replyAt).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
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
                <DollarSign size={20} style={{ color: colors.brand.green }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                  Relatório Financeiro
                </h2>
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  Receita, custos e ROI gerados pelo Autopilot
                </p>
              </div>
            </div>

            {moneyReport ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  icon={TrendingUp}
                  label="Receita Total"
                  value={formatCurrency(moneyReport.totalRevenue)}
                  color={colors.brand.green}
                />
                <StatCard
                  icon={Activity}
                  label="Custos"
                  value={formatCurrency(moneyReport.totalCosts)}
                  color="#EF4444"
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
                  label="Ticket Médio"
                  value={formatCurrency(moneyReport.avgTicket)}
                  color="#F59E0B"
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
                />
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  Nenhum dado financeiro disponível
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
                <Layers size={20} style={{ color: colors.brand.cyan }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                  Eventos de Receita
                </h2>
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  Vendas e conversões atribuídas ao Autopilot
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
                        ? '#F59E0B'
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
                        <DollarSign size={16} style={{ color: eventColor }} />
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
                <Layers size={32} className="mx-auto mb-2" style={{ color: colors.text.muted }} />
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  Nenhum evento de receita registrado
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
                <Lightbulb size={20} style={{ color: colors.brand.green }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                  Insights da IA
                </h2>
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  Recomendações e observações geradas automaticamente
                </p>
              </div>
            </div>

            {/* Ask AI input */}
            <div className="flex gap-3 mb-5">
              <input
                value={askQuestion}
                onChange={(e) => setAskQuestion(e.target.value)}
                placeholder="Pergunte algo sobre o Autopilot... (ex: Quais leads estao mais propensos a comprar?)"
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
                leftIcon={!isAsking ? <Sparkles size={14} /> : undefined}
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
                    Pergunta: {askResult.question}
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
                    warning: '#F59E0B',
                    critical: '#EF4444',
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
                              <strong>Recomendação:</strong> {insight.recommendation}
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
                />
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  Nenhum insight disponível no momento
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
                  <Server size={20} style={{ color: colors.brand.cyan }} />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                    Saúde da Fila (BullMQ)
                  </h2>
                  <p className="text-sm" style={{ color: colors.text.muted }}>
                    Status do processamento de mensagens
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
                          ? '#F59E0B'
                          : queueHealthStatus === 'critical'
                            ? '#EF4444'
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
                    <StatusPill label="Esperando" status={String(queueStats.waiting ?? 0)} />
                    <StatusPill label="Ativas" status={String(queueStats.active ?? 0)} />
                    <StatusPill label="Atrasadas" status={String(queueStats.delayed ?? 0)} />
                    <StatusPill label="Falhas" status={String(queueStats.failed ?? 0)} />
                  </div>
                  {(queueStats.completed != null || queueStats.paused != null) && (
                    <div className="grid grid-cols-2 gap-3">
                      {queueStats.completed != null && (
                        <StatusPill label="Completadas" status={String(queueStats.completed)} />
                      )}
                      {queueStats.paused != null && (
                        <StatusPill label="Pausadas" status={String(queueStats.paused)} />
                      )}
                    </div>
                  )}
                  <div
                    className="flex items-center justify-between p-3 rounded-lg text-sm"
                    style={{ backgroundColor: colors.background.surface2 }}
                  >
                    <span style={{ color: colors.text.secondary }}>Total na fila</span>
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
                  <Server size={32} className="mx-auto mb-2" style={{ color: colors.text.muted }} />
                  <p className="text-sm" style={{ color: colors.text.muted }}>
                    Dados da fila indisponíveis
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
                  <Database size={20} style={{ color: colors.brand.cyan }} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                    Configuracao de Runtime
                  </h2>
                  <p className="text-sm" style={{ color: colors.text.muted }}>
                    Parametros de execucao do Autopilot
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
                                ? '#EF4444'
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
                  />
                  <p className="text-sm" style={{ color: colors.text.muted }}>
                    Configuracao de runtime indisponivel
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
                    <Settings2 size={20} style={{ color: colors.brand.green }} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                      Configuração
                    </h2>
                    <p className="text-sm" style={{ color: colors.text.muted }}>
                      Ajustes do Autopilot
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (isEditingConfig) {
                      setConfigDraft(config || {});
                    }
                    setIsEditingConfig(!isEditingConfig);
                  }}
                  className="p-2 rounded-lg transition-colors hover:bg-white/5"
                  style={{ color: isEditingConfig ? '#EF4444' : colors.text.muted }}
                >
                  {isEditingConfig ? <XCircle size={18} /> : <Settings2 size={18} />}
                </button>
              </div>

              {config ? (
                <div className="space-y-3">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span style={{ color: colors.text.secondary }}>Flow de Conversão (ID)</span>
                    <input
                      value={configDraft.conversionFlowId || ''}
                      onChange={(e) =>
                        setConfigDraft((prev) => ({
                          ...prev,
                          conversionFlowId: e.target.value || null,
                        }))
                      }
                      disabled={!isEditingConfig}
                      placeholder="ID do flow"
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
                    <span style={{ color: colors.text.secondary }}>Moeda Padrão</span>
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
                    <span style={{ color: colors.text.secondary }}>Template de Recuperação</span>
                    <input
                      value={configDraft.recoveryTemplateName || ''}
                      onChange={(e) =>
                        setConfigDraft((prev) => ({
                          ...prev,
                          recoveryTemplateName: e.target.value || null,
                        }))
                      }
                      disabled={!isEditingConfig}
                      placeholder="Nome do template"
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
                        leftIcon={!isSavingConfig ? <Save size={14} /> : undefined}
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
                        Cancelar
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
                  />
                  <p className="text-sm" style={{ color: colors.text.muted }}>
                    Configuração indisponível
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
            <Bot size={40} className="mx-auto mb-4" style={{ color: colors.brand.green }} />
            <h3 className="text-lg font-semibold mb-2" style={{ color: colors.text.primary }}>
              Precisa de ajuda com o Autopilot?
            </h3>
            <p className="text-sm mb-4 max-w-md mx-auto" style={{ color: colors.text.muted }}>
              O Autopilot usa IA para responder automaticamente, qualificar leads e direcionar para
              conversão. Configure fluxos personalizados para maximizar resultados.
            </p>
            <div className="flex justify-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => (window.location.href = '/flow')}
              >
                <Settings2 size={16} className="mr-2" />
                Configurar Fluxos
              </Button>
              <Button variant="primary" size="sm" onClick={() => (window.location.href = '/chat')}>
                <MessageSquare size={16} className="mr-2" />
                Falar com KLOEL
              </Button>
            </div>
          </div>
        </CenterStage>
      </Section>
    </div>
  );
}
