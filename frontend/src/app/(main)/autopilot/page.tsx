'use client';

import { kloelT } from '@/lib/i18n/t';
/** Dynamic. */
export const dynamic = 'force-dynamic';

import { type MissionCardData } from '@/components/kloel';
import { AutopilotOverview } from './AutopilotOverview';
import { AutopilotRulesPanel } from './AutopilotRulesPanel';
import { AutopilotPlanList } from './AutopilotPlanList';
import { AutopilotHistoryPanel } from './AutopilotHistoryPanel';
import { AutopilotMissionGrid } from './AutopilotMissionGrid';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import {
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
  toggleAutopilot,
  tokenStorage,
  updateAutopilotConfig,
} from '@/lib/api';
import type { AskInsightsResult, RuntimeConfig } from '@/lib/api';
import { unwrapArrayEnvelope, unwrapDataEnvelope, unwrapSettled } from './page.helpers';
import { colors } from '@/lib/design-tokens';
import {
  BarChart3,
  MessageSquare,
  RefreshCw,
  Users,
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

  // Smoke Test
  const [smokeResult, setSmokeResult] = useState<AutopilotSmokeTestResult | null>(null);

  const [isTesting, setIsTesting] = useState(false);

  const [testPhone, setTestPhone] = useState('');

  const [testMessage, setTestMessage] = useState(

    'Olá, quero validar se o Kloel está respondendo corretamente no WhatsApp.',

  );

  const [testLiveSend, setTestLiveSend] = useState(false);

  // Ask AI Insights
  const [askQuestion, setAskQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [askResult, setAskResult] = useState<AskInsightsResult | null>(null);

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

  const handleSmokeTest = async () => {
    if (!effectiveWorkspaceId || !token) {
      return;
    }
    try {
      setIsTesting(true);
      setError(null);
      const params: Record<string, unknown> = {
        workspaceId: effectiveWorkspaceId,
        liveSend: testLiveSend,
        waitMs: 12000,
        token,
      };
      if (testPhone) { params.phone = testPhone; }
      if (testMessage) { params.message = testMessage; }
      const data = await runAutopilotSmokeTest(params as {
        workspaceId: string;
        phone?: string;
        message?: string;
        liveSend?: boolean;
        waitMs?: number;
        token?: string;
      });
      setSmokeResult(data as never as AutopilotSmokeTestResult);
      await fetchAutopilotData();
    } catch (err: unknown) {
      console.error('Error running autopilot smoke test:', err);
      setError(err instanceof Error ? err.message : 'Erro ao executar smoke test do Autopilot');
    } finally {
      setIsTesting(false);
    }
  };

  const handleExportActions = async () => {
    if (!effectiveWorkspaceId || !token) {
      return;
    }
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
      <AutopilotOverview
        status={status}
        stats={stats}
        impact={impact}
        pipeline={pipeline}
        systemHealth={systemHealth}
        missionCards={missionCards}
        isLoading={isLoading}
        error={error}
        isToggling={isToggling}
        handleToggle={handleToggle}
        onDismissError={() => setError(null)}
        onRefresh={fetchAutopilotData}
        onNavigate={navigate}
      />
      <AutopilotRulesPanel
        actions={actions}
        impact={impact}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        isLoading={isLoading}
        isEnabled={status?.enabled ?? false}
        moneyReport={moneyReport}
        onRefresh={fetchAutopilotData}
        onExport={handleExportActions}
      />
      <AutopilotPlanList
        revenueEvents={revenueEvents}
      />
      <AutopilotHistoryPanel
        insights={insights}
        askQuestion={askQuestion}
        setAskQuestion={setAskQuestion}
        handleAskInsights={handleAskInsights}
        isAsking={isAsking}
        askResult={askResult}
      />
      <AutopilotMissionGrid
        queueStats={queueStats}
        runtimeConfig={runtimeConfig}
        smokeResult={smokeResult}
        testPhone={testPhone}
        testMessage={testMessage}
        testLiveSend={testLiveSend}
        isTesting={isTesting}
        onTestPhoneChange={setTestPhone}
        onTestMessageChange={setTestMessage}
        onTestLiveSendChange={setTestLiveSend}
        onSmokeTest={handleSmokeTest}
        config={config}
        isEditingConfig={isEditingConfig}
        configDraft={configDraft}
        isSavingConfig={isSavingConfig}
        onConfigDraftChange={(updater) => setConfigDraft((prev) => updater(prev) as AutopilotConfigData)}
        onToggleEditingConfig={() => {
          if (isEditingConfig) { setConfigDraft(config || {}); }
          setIsEditingConfig(!isEditingConfig);
        }}
        onSaveConfig={handleSaveConfig}
        onNavigate={navigate}
      />
    </div>
  );
}
