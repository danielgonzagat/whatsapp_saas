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

import type { AutopilotSmokeTestResult } from './page.ui';

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
    stats: unwrapSettled<AutopilotStats | null>(statsResult, (v) => (v as AutopilotStats) || null, null),
    impact: unwrapSettled<AutopilotImpact | null>(impactResult, (v) => (v as AutopilotImpact) || null, null),
    actions: unwrapSettled<AutopilotAction[]>(actionsResult, unwrapArrayEnvelope, []),
    pipeline: unwrapSettled<AutopilotPipeline | null>(pipelineResult, (v) => (v as AutopilotPipeline) || null, null),
    systemHealth: unwrapSettled<SystemHealth | null>(systemHealthResult, (v) => (v as SystemHealth) || null, null),
    moneyReport: unwrapSettled<MoneyReport | null>(moneyReportResult, unwrapDataEnvelope, null),
    revenueEvents: unwrapSettled<RevenueEvent[]>(revenueEventsResult, unwrapArrayEnvelope, []),
    insights: unwrapSettled<AutopilotInsight[]>(insightsResult, unwrapArrayEnvelope, []),
    queueStats: unwrapSettled<QueueStats | null>(queueStatsResult, unwrapDataEnvelope, null),
    config: unwrapSettled<AutopilotConfigData | null>(configResult, unwrapDataEnvelope, null),
    runtimeConfig: unwrapSettled<RuntimeConfig | null>(runtimeConfigResult, (v) => (v as RuntimeConfig) || null, null),
    partialError,
  };
}
