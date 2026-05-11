'use client';

import { kloelT } from '@/lib/i18n/t';
/** Dynamic. */
export const dynamic = 'force-dynamic';

import { CenterStage, type MissionCardData, Section } from '@/components/kloel';
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
import { colors } from '@/lib/design-tokens';
import { AlertCircle, BarChart3, MessageSquare, RefreshCw, Users, Zap } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, useCallback, useEffect, useState } from 'react';
import { KloelMushroomMark } from '@/components/kloel/KloelBrand';
import { AiInsightsSection } from './page.ai-insights-section';
import { QueueConfigSection } from './page.ai-section';
import {
  readSmokeResult,
  unwrapArrayEnvelope,
  unwrapDataEnvelope,
  unwrapSettled,
} from './page.helpers';
import { HelpSection } from './page.help-section';
import { MoneyMachineSection, SmokeTestSection } from './page.operations-section';
import { PipelineSection } from './page.pipeline-section';
import { MoneyReportSection, RevenueEventsSection } from './page.report-section';
import { DirectSendSection, ImpactSection, RecentActionsSection } from './page.send-section';
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
} from './page.ui';

interface DirectSendResult {
  success?: boolean;
  messageId?: string;
  error?: string;
}

/** Autopilot page. */
export default function AutopilotPage() {
  const workspaceId = useWorkspaceId();
  const router = useRouter();
  const pathname = usePathname();
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
  const [isRunningMoneyMachine, setIsRunningMoneyMachine] = useState(false);
  const [moneyMachineResult, setMoneyMachineResult] = useState<MoneyMachineResult | null>(null);
  const [moneyMachineTopN, setMoneyMachineTopN] = useState(200);
  const [moneyMachineAutoSend, setMoneyMachineAutoSend] = useState(false);
  const [moneyMachineSmartTime, setMoneyMachineSmartTime] = useState(false);
  const [askQuestion, setAskQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [askResult, setAskResult] = useState<AskInsightsResult | null>(null);
  const [sendContactId, setSendContactId] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<DirectSendResult | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);

  const token = tokenStorage.getToken();
  const effectiveWorkspaceId = workspaceId || tokenStorage.getWorkspaceId() || '';

  const navigate = useCallback(
    (href: string) => {
      if (!href || pathname === href) {
        return;
      }
      startTransition(() => router.push(href));
    },
    [pathname, router],
  );

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
        (value) => (value as AutopilotStatus) || null,
        null,
      );
      const cfgData = unwrapSettled<AutopilotConfigData | null>(
        configResult,
        unwrapDataEnvelope,
        null,
      );

      setStatus(statusData);
      setStats(
        unwrapSettled<AutopilotStats | null>(
          statsResult,
          (value) => (value as AutopilotStats) || null,
          null,
        ),
      );
      setImpact(
        unwrapSettled<AutopilotImpact | null>(
          impactResult,
          (value) => (value as AutopilotImpact) || null,
          null,
        ),
      );
      setActions(unwrapSettled<AutopilotAction[]>(actionsResult, unwrapArrayEnvelope, []));
      setPipeline(
        unwrapSettled<AutopilotPipeline | null>(
          pipelineResult,
          (value) => (value as AutopilotPipeline) || null,
          null,
        ),
      );
      setSystemHealth(
        unwrapSettled<SystemHealth | null>(
          systemHealthResult,
          (value) => (value as SystemHealth) || null,
          null,
        ),
      );
      setMoneyReport(
        unwrapSettled<MoneyReport | null>(moneyReportResult, unwrapDataEnvelope, null),
      );
      setRevenueEvents(unwrapSettled<RevenueEvent[]>(revenueEventsResult, unwrapArrayEnvelope, []));
      setInsights(unwrapSettled<AutopilotInsight[]>(insightsResult, unwrapArrayEnvelope, []));
      setQueueStats(unwrapSettled<QueueStats | null>(queueStatsResult, unwrapDataEnvelope, null));
      setConfig(cfgData);
      if (cfgData) {
        setConfigDraft(cfgData);
      }
      setRuntimeConfig(
        unwrapSettled<RuntimeConfig | null>(
          runtimeConfigResult,
          (value) => (value as RuntimeConfig) || null,
          null,
        ),
      );

      const partialError =
        statsResult.status === 'rejected' ||
        impactResult.status === 'rejected' ||
        actionsResult.status === 'rejected' ||
        pipelineResult.status === 'rejected' ||
        systemHealthResult.status === 'rejected';

      if (statusData?.billingSuspended) {
        setError(null);
      } else if (!statusData || partialError) {
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

  const handleSmokeTest = async () => {
    if (!effectiveWorkspaceId || !token) {
      return;
    }
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
      setSmokeResult(readSmokeResult(data));
      await fetchAutopilotData();
    } catch (err: unknown) {
      console.error('Error running autopilot smoke test:', err);
      setError(err instanceof Error ? err.message : 'Erro ao executar smoke test do Autopilot');
    } finally {
      setIsTesting(false);
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

  const handleMoneyMachine = async () => {
    if (!effectiveWorkspaceId) {
      return;
    }
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao executar Money Machine');
    } finally {
      setIsRunningMoneyMachine(false);
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

  const handleSendDirect = async () => {
    if (!effectiveWorkspaceId || !sendContactId.trim() || !sendMessage.trim()) {
      return;
    }
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
    } catch (err: unknown) {
      setSendResult({
        success: false,
        error: err instanceof Error ? err.message : 'Erro ao enviar mensagem',
      });
    } finally {
      setIsSending(false);
    }
  };

  const filteredActions = actions.filter((action) =>
    statusFilter === 'all' ? true : action.status === statusFilter,
  );
  const queueTotal = queueStats
    ? (queueStats.waiting || 0) +
      (queueStats.active || 0) +
      (queueStats.delayed || 0) +
      (queueStats.failed || 0)
    : 0;
  const queueHealthStatus = !queueStats
    ? 'unknown'
    : (queueStats.failed || 0) > 10
      ? 'critical'
      : (queueStats.waiting || 0) > 50 || (queueStats.delayed || 0) > 20
        ? 'degraded'
        : 'healthy';
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
          <KloelMushroomMark
            size={32}
            title="Carregando Autopilot"
            traceColor={colors.brand.green}
          />
          <span style={{ color: colors.text.muted }}>{kloelT('Carregando Autopilot...')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-20" style={{ backgroundColor: colors.background.obsidian }}>
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
              <AlertCircle size={20} style={{ color: colors.state.error }} aria-hidden="true" />
              <span style={{ color: colors.state.error }}>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="ml-auto text-sm underline"
                style={{ color: colors.text.muted }}
              >
                {kloelT('Fechar')}
              </button>
            </div>
          </CenterStage>
        </Section>
      )}

      <PipelineSection
        status={status}
        isToggling={isToggling}
        onToggle={handleToggle}
        stats={stats}
        impact={impact}
        pipeline={pipeline}
        systemHealth={systemHealth}
        missionCards={missionCards}
        isLoading={isLoading}
        onRefresh={fetchAutopilotData}
      />
      <SmokeTestSection
        testPhone={testPhone}
        setTestPhone={setTestPhone}
        testMessage={testMessage}
        setTestMessage={setTestMessage}
        testLiveSend={testLiveSend}
        setTestLiveSend={setTestLiveSend}
        isTesting={isTesting}
        onSmokeTest={handleSmokeTest}
        smokeResult={smokeResult}
      />
      <MoneyMachineSection
        moneyMachineTopN={moneyMachineTopN}
        setMoneyMachineTopN={setMoneyMachineTopN}
        moneyMachineAutoSend={moneyMachineAutoSend}
        setMoneyMachineAutoSend={setMoneyMachineAutoSend}
        moneyMachineSmartTime={moneyMachineSmartTime}
        setMoneyMachineSmartTime={setMoneyMachineSmartTime}
        isRunningMoneyMachine={isRunningMoneyMachine}
        onExecute={handleMoneyMachine}
        moneyMachineResult={moneyMachineResult}
      />
      <MoneyReportSection moneyReport={moneyReport} />
      <RevenueEventsSection revenueEvents={revenueEvents} />
      <DirectSendSection
        sendContactId={sendContactId}
        setSendContactId={setSendContactId}
        sendMessage={sendMessage}
        setSendMessage={setSendMessage}
        isSending={isSending}
        onSend={handleSendDirect}
        sendResult={sendResult}
      />
      <RecentActionsSection
        actions={actions}
        filteredActions={filteredActions}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        status={status}
        isLoading={isLoading}
        onRefresh={fetchAutopilotData}
        onExport={handleExportActions}
      />
      <ImpactSection impact={impact} />
      <AiInsightsSection
        askQuestion={askQuestion}
        setAskQuestion={setAskQuestion}
        isAsking={isAsking}
        onAsk={handleAskInsights}
        askResult={askResult}
        insights={insights}
      />
      <QueueConfigSection
        queueStats={queueStats}
        queueTotal={queueTotal}
        queueHealthStatus={queueHealthStatus}
        runtimeConfig={runtimeConfig}
        config={config}
        configDraft={configDraft}
        setConfigDraft={setConfigDraft}
        isEditingConfig={isEditingConfig}
        setIsEditingConfig={setIsEditingConfig}
        isSavingConfig={isSavingConfig}
        onSaveConfig={handleSaveConfig}
        onNavigate={navigate}
      />
      <HelpSection onNavigate={navigate} />
    </div>
  );
}
