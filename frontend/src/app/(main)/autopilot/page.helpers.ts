import {
  apiFetch,
  buildQuery,
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
} from '@/lib/api';
import type { RuntimeConfig } from '@/lib/api';
import type {
  AutopilotAction,
  AutopilotConfigData,
  AutopilotImpact,
  AutopilotInsight,
  AutopilotPipeline,
  AutopilotStats,
  AutopilotStatus,
  MoneyReport,
  QueueStats,
  RevenueEvent,
  SystemHealth,
} from './page.types';

export function unwrapSettled<T>(
  result: PromiseSettledResult<unknown>,
  transform: (value: unknown) => T,
  fallback: T,
): T {
  return result.status === 'fulfilled' ? transform(result.value) : fallback;
}

export function unwrapDataEnvelope<T>(value: unknown): T | null {
  if (!value || typeof value !== 'object') {
    return (value ?? null) as T | null;
  }
  const inner = (value as { data?: T }).data;
  return (inner !== undefined ? inner : (value as T)) ?? null;
}

export function unwrapArrayEnvelope<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  const inner = (value as { data?: T[] } | null | undefined)?.data;
  return Array.isArray(inner) ? (inner as T[]) : [];
}

export interface AutopilotDataBundle {
  status: AutopilotStatus | null;
  stats: AutopilotStats | null;
  impact: AutopilotImpact | null;
  actions: AutopilotAction[];
  pipeline: AutopilotPipeline | null;
  systemHealth: SystemHealth | null;
  moneyReport: MoneyReport | null;
  revenueEvents: RevenueEvent[];
  insights: AutopilotInsight[];
  queueStats: QueueStats | null;
  config: AutopilotConfigData | null;
  runtimeConfig: RuntimeConfig | null;
  partialError: boolean;
}

export async function fetchAutopilotDataBundle(
  effectiveWorkspaceId: string,
  token: string,
): Promise<AutopilotDataBundle> {
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

  const partialError =
    statsResult.status === 'rejected' ||
    impactResult.status === 'rejected' ||
    actionsResult.status === 'rejected' ||
    pipelineResult.status === 'rejected' ||
    systemHealthResult.status === 'rejected';

  return {
    status: statusData,
    stats: unwrapSettled<AutopilotStats | null>(
      statsResult,
      (v) => (v as AutopilotStats) || null,
      null,
    ),
    impact: unwrapSettled<AutopilotImpact | null>(
      impactResult,
      (v) => (v as AutopilotImpact) || null,
      null,
    ),
    actions: unwrapSettled<AutopilotAction[]>(actionsResult, unwrapArrayEnvelope, []),
    pipeline: unwrapSettled<AutopilotPipeline | null>(
      pipelineResult,
      (v) => (v as AutopilotPipeline) || null,
      null,
    ),
    systemHealth: unwrapSettled<SystemHealth | null>(
      systemHealthResult,
      (v) => (v as SystemHealth) || null,
      null,
    ),
    moneyReport: unwrapSettled<MoneyReport | null>(moneyReportResult, unwrapDataEnvelope, null),
    revenueEvents: unwrapSettled<RevenueEvent[]>(revenueEventsResult, unwrapArrayEnvelope, []),
    insights: unwrapSettled<AutopilotInsight[]>(insightsResult, unwrapArrayEnvelope, []),
    queueStats: unwrapSettled<QueueStats | null>(queueStatsResult, unwrapDataEnvelope, null),
    config: unwrapSettled<AutopilotConfigData | null>(configResult, unwrapDataEnvelope, null),
    runtimeConfig: unwrapSettled<RuntimeConfig | null>(
      runtimeConfigResult,
      (v) => (v as RuntimeConfig) || null,
      null,
    ),
    partialError,
  };
}

export function askResultToSummary(value: Record<string, unknown>): string {
  if (!value) {
    return 'Sem dados disponíveis.';
  }
  const answer = value.answer;
  if (typeof answer === 'string') {
    return answer;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) {
    return 'Resultado vazio.';
  }
  const parts = keys.slice(0, 3).map((k) => {
    const v = value[k];
    if (typeof v === 'string') {
      return v.length > 80 ? v.slice(0, 80) + '…' : v;
    }
    if (typeof v === 'number') {
      return String(v);
    }
    return k;
  });
  return parts.join(' · ') || 'Dados disponíveis.';
}
export interface DerivedMissionDefinition {
  id: string;
  title: string;
  description: string;
  priority: boolean;
  severity: 'info' | 'warning' | 'critical';
}

function asPct(n: number) {
  const pct = Math.round(n * 100);
  return Number.isFinite(pct) ? `${pct}%` : '0%';
}

export function deriveAutopilotMissions(bundle: {
  status: AutopilotStatus | null;
  stats: AutopilotStats | null;
  impact: AutopilotImpact | null;
  pipeline: AutopilotPipeline | null;
  insights: AutopilotInsight[];
}): DerivedMissionDefinition[] {
  const missions: DerivedMissionDefinition[] = [];

  if (bundle.status && !bundle.status.enabled) {
    missions.push({
      id: 'activate-autopilot',
      title: 'Ativar o Autopilot',
      description:
        'O Autopilot está pausado. Ative para começar a responder e qualificar leads automaticamente.',
      priority: true,
      severity: 'warning',
    });
  }

  if (bundle.status?.billingSuspended) {
    missions.push({
      id: 'resolve-billing',
      title: 'Regularizar cobrança',
      description: 'O faturamento está suspenso. Regularize para reativar o Autopilot.',
      priority: true,
      severity: 'critical',
    });
  }

  const whatsappStatus = bundle.pipeline?.autonomy?.whatsappStatus?.toLowerCase();
  if (whatsappStatus === 'down' || bundle.pipeline?.autonomy?.connected === false) {
    missions.push({
      id: 'connect-whatsapp',
      title: 'Conectar WhatsApp',
      description:
        'O WhatsApp não está conectado. Configure a conexão para que o Autopilot possa enviar mensagens.',
      priority: true,
      severity: 'critical',
    });
  } else if (whatsappStatus === 'degraded') {
    missions.push({
      id: 'check-whatsapp',
      title: 'Verificar WhatsApp',
      description: 'A conexão com o WhatsApp está degradada. Verifique o status da sessão.',
      priority: false,
      severity: 'warning',
    });
  }

  if (bundle.stats) {
    if (bundle.stats.errorsLast7d > 3) {
      missions.push({
        id: 'review-errors',
        title: 'Revisar erros do Autopilot',
        description: `${bundle.stats.errorsLast7d} erros nos últimos 7 dias. Revise o log de ações para identificar a causa.`,
        priority: false,
        severity: 'warning',
      });
    }

    if (bundle.stats.contactsTracked >= 5 && bundle.stats.conversionsLast7d === 0) {
      missions.push({
        id: 'check-conversion',
        title: 'Revisar taxa de conversão',
        description: `${bundle.stats.contactsTracked} contatos rastreados mas nenhuma conversão nos últimos 7 dias. Verifique os fluxos e ofertas.`,
        priority: false,
        severity: 'info',
      });
    }

    if (bundle.stats.contactsTracked > 0 && bundle.impact) {
      const rate = asPct(bundle.impact.replyRate);
      if (bundle.impact.replyRate < 0.3) {
        missions.push({
          id: 'improve-reply-rate',
          title: 'Melhorar taxa de resposta',
          description: `Taxa de resposta em ${rate}. Revise as mensagens automáticas para aumentar o engajamento.`,
          priority: false,
          severity: 'info',
        });
      }
    }
  }

  if (bundle.insights.length > 0) {
    const latestTime = bundle.insights
      .filter((i) => i.createdAt)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())[0];
    if (latestTime?.createdAt) {
      const minutesAgo = Math.round(
        (Date.now() - new Date(latestTime.createdAt).getTime()) / 60000,
      );
      if (minutesAgo > 120) {
        missions.push({
          id: 'insights-stale',
          title: 'Insights desatualizados',
          description: `Último insight gerado há mais de ${Math.round(minutesAgo / 60)}h. Execute uma análise para atualizar.`,
          priority: false,
          severity: 'info',
        });
      }
    }
  }

  return missions;
}
