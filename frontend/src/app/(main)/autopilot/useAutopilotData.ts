'use client';

import {
  askAutopilotInsights,
  exportAutopilotActions,
  runAutopilotSmokeTest,
  toggleAutopilot,
  updateAutopilotConfig,
  tokenStorage,
} from '@/lib/api';
import type { AskInsightsResult, RuntimeConfig } from '@/lib/api';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ElementType } from 'react';
import type { MissionCardData } from '@/components/kloel';
import { deriveAutopilotMissions, fetchAutopilotDataBundle } from './page.helpers';
import { AlertCircle, Clock, MessageSquare, Play, TrendingUp } from 'lucide-react';
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

export function useAutopilotData(workspaceId: string | null) {
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
  const [smokeResult, setSmokeResult] = useState<AutopilotSmokeTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState(
    'Olá, quero validar se o Kloel está respondendo corretamente no WhatsApp.',
  );
  const [testLiveSend, setTestLiveSend] = useState(false);
  const [askQuestion, setAskQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [askResult, setAskResult] = useState<AskInsightsResult | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);

  const missionCards = useMemo<MissionCardData[]>(() => {
    const definitions = deriveAutopilotMissions({ status, stats, impact, pipeline, insights });
    if (definitions.length === 0) {
      return [];
    }

    const iconMap: Record<string, ElementType> = {
      'activate-autopilot': Play,
      'resolve-billing': AlertCircle,
      'connect-whatsapp': MessageSquare,
      'check-whatsapp': AlertCircle,
      'review-errors': AlertCircle,
      'check-conversion': TrendingUp,
      'improve-reply-rate': TrendingUp,
      'insights-stale': Clock,
    };

    const statusMap: Record<string, MissionCardData['status']> = {
      critical: 'pending',
      warning: 'pending',
      info: 'suggested',
    };

    return definitions.map((d) => {
      const card: MissionCardData = {
        id: d.id,
        title: d.title,
        description: d.description,
        status: statusMap[d.severity] ?? 'suggested',
        priority: d.priority,
      };
      const icon = iconMap[d.id];
      if (icon) {
        card.icon = icon;
      }
      return card;
    });
  }, [status, stats, impact, pipeline, insights]);

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

      const bundle = await fetchAutopilotDataBundle(effectiveWorkspaceId, token);

      setStatus(bundle.status);
      setStats(bundle.stats);
      setImpact(bundle.impact);
      setActions(bundle.actions);
      setPipeline(bundle.pipeline);
      setSystemHealth(bundle.systemHealth);
      setMoneyReport(bundle.moneyReport);
      setRevenueEvents(bundle.revenueEvents);
      setInsights(bundle.insights);
      setQueueStats(bundle.queueStats);

      if (bundle.config) {
        setConfig(bundle.config);
        setConfigDraft(bundle.config);
      } else {
        setConfig(null);
      }

      setRuntimeConfig(bundle.runtimeConfig);

      if (bundle.status?.billingSuspended) {
        setError(null);
      } else if (!bundle.status) {
        setError('Erro ao carregar dados do Autopilot');
      } else if (bundle.partialError) {
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

  const handleToggle = useCallback(async () => {
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
  }, [effectiveWorkspaceId, fetchAutopilotData, status, token]);

  const handleSmokeTest = useCallback(async () => {
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
      if (testPhone) {
        params.phone = testPhone;
      }
      if (testMessage) {
        params.message = testMessage;
      }
      const data = await runAutopilotSmokeTest(
        params as {
          workspaceId: string;
          phone?: string;
          message?: string;
          liveSend?: boolean;
          waitMs?: number;
          token?: string;
        },
      );
      setSmokeResult(data as never as AutopilotSmokeTestResult);
      await fetchAutopilotData();
    } catch (err: unknown) {
      console.error('Error running autopilot smoke test:', err);
      setError(err instanceof Error ? err.message : 'Erro ao executar smoke test do Autopilot');
    } finally {
      setIsTesting(false);
    }
  }, [effectiveWorkspaceId, fetchAutopilotData, testLiveSend, testMessage, testPhone, token]);

  const handleExportActions = useCallback(async () => {
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
  }, [effectiveWorkspaceId, statusFilter, token, workspaceId]);

  const handleSaveConfig = useCallback(async () => {
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
  }, [configDraft, effectiveWorkspaceId, fetchAutopilotData, token]);

  const handleAskInsights = useCallback(async () => {
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
  }, [askQuestion, effectiveWorkspaceId]);

  return {
    isLoading,
    isToggling,
    status,
    stats,
    impact,
    pipeline,
    systemHealth,
    actions,
    moneyReport,
    revenueEvents,
    insights,
    queueStats,
    config,
    isEditingConfig,
    setIsEditingConfig,
    configDraft,
    isSavingConfig,
    statusFilter,
    setStatusFilter,
    error,
    setError,
    smokeResult,
    isTesting,
    testPhone,
    setTestPhone,
    testMessage,
    setTestMessage,
    testLiveSend,
    setTestLiveSend,
    askQuestion,
    setAskQuestion,
    isAsking,
    askResult,
    runtimeConfig,
    missionCards,
    fetchAutopilotData,
    handleToggle,
    handleSmokeTest,
    handleExportActions,
    handleSaveConfig,
    handleAskInsights,
    setConfigDraft,
  };
}
