'use client';

import { kloelT } from '@/lib/i18n/t';
/** Dynamic. */
export const dynamic = 'force-dynamic';

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
import type {
  AutopilotAction,
  AutopilotConfigData,
  AutopilotImpact,
  AutopilotInsight,
  AutopilotPipeline,
  AutopilotSmokeTestResult,
  AutopilotStats,
  AutopilotStatus,
  MoneyReport,
  QueueStats,
  RevenueEvent,
  SystemHealth,
} from './page.types';
import { colors } from '@/lib/design-tokens';
import {
  RefreshCw,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, useCallback, useEffect, useState } from 'react';

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
        missionCards={[]}
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
