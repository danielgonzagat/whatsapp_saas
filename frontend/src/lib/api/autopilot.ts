// Autopilot types and functions, SystemHealth
import { mutate } from 'swr';
import { API_BASE } from '../http';
import { apiFetch, authHeaders, buildQuery } from './core';

const invalidateAutopilot = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/autopilot'));

export type AutopilotStatus = Record<string, unknown>;
export type AutopilotStats = Record<string, unknown>;
export type AutopilotImpact = Record<string, unknown>;
export type AutopilotPipeline = Record<string, unknown>;
export type SystemHealth = Record<string, unknown>;
export type AutopilotSmokeTest = Record<string, unknown>;

export interface AutopilotConfig {
  conversionFlowId?: string | null;
  currencyDefault?: string;
  recoveryTemplateName?: string | null;
  [key: string]: unknown;
}

export interface AutopilotAction {
  createdAt: string;
  contactId?: string;
  contact?: string;
  intent?: string;
  action?: string;
  status?: string;
  reason?: string;
}

export async function getAutopilotStatus(
  workspaceId: string,
  _token?: string,
): Promise<AutopilotStatus> {
  const res = await apiFetch<AutopilotStatus>(`/autopilot/status${buildQuery({ workspaceId })}`);
  if (res.error) throw new Error('Failed to fetch autopilot status');
  return res.data as AutopilotStatus;
}

export async function toggleAutopilot(
  workspaceId: string,
  enabled: boolean,
  _token?: string,
): Promise<AutopilotStatus> {
  const res = await apiFetch<AutopilotStatus>(`/autopilot/toggle`, {
    method: 'POST',
    body: { workspaceId, enabled },
  });
  if (res.error) throw new Error('Failed to toggle autopilot');
  invalidateAutopilot();
  return res.data as AutopilotStatus;
}

export async function getAutopilotConfig(
  workspaceId: string,
  _token?: string,
): Promise<AutopilotConfig> {
  const res = await apiFetch<AutopilotConfig>(`/autopilot/config${buildQuery({ workspaceId })}`);
  if (res.error) throw new Error('Failed to fetch autopilot config');
  return res.data as AutopilotConfig;
}

export async function updateAutopilotConfig(
  workspaceId: string,
  config: AutopilotConfig,
  _token?: string,
): Promise<AutopilotConfig> {
  const res = await apiFetch<AutopilotConfig>(`/autopilot/config`, {
    method: 'POST',
    body: { workspaceId, ...config },
  });
  if (res.error) throw new Error('Failed to update autopilot config');
  invalidateAutopilot();
  return res.data as AutopilotConfig;
}

export async function getAutopilotStats(
  workspaceId: string,
  _token?: string,
): Promise<AutopilotStats> {
  const res = await apiFetch<AutopilotStats>(`/autopilot/stats${buildQuery({ workspaceId })}`);
  if (res.error) throw new Error('Failed to fetch autopilot stats');
  return res.data as AutopilotStats;
}

export async function getAutopilotImpact(
  workspaceId: string,
  _token?: string,
): Promise<AutopilotImpact> {
  const res = await apiFetch<AutopilotImpact>(`/autopilot/impact${buildQuery({ workspaceId })}`);
  if (res.error) throw new Error('Failed to fetch autopilot impact');
  return res.data as AutopilotImpact;
}

export async function getAutopilotPipeline(
  workspaceId: string,
  _token?: string,
): Promise<AutopilotPipeline> {
  const res = await apiFetch<AutopilotPipeline>(
    `/autopilot/pipeline${buildQuery({ workspaceId })}`,
  );
  if (res.error) throw new Error('Failed to fetch autopilot pipeline');
  return res.data as AutopilotPipeline;
}

export async function runAutopilotSmokeTest(params: {
  workspaceId: string;
  phone?: string;
  message?: string;
  waitMs?: number;
  liveSend?: boolean;
  token?: string;
}): Promise<AutopilotSmokeTest> {
  const res = await apiFetch<AutopilotSmokeTest>(`/autopilot/test`, {
    method: 'POST',
    body: {
      workspaceId: params.workspaceId,
      phone: params.phone,
      message: params.message,
      waitMs: params.waitMs,
      liveSend: params.liveSend,
    },
  });
  if (res.error) throw new Error('Failed to run autopilot smoke test');
  return res.data as AutopilotSmokeTest;
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const res = await apiFetch<SystemHealth>(`/health/system`);
  if (res.error) throw new Error('Failed to fetch system health');
  return res.data as SystemHealth;
}

export async function getAutopilotActions(
  workspaceId: string,
  options?: { limit?: number; status?: string; token?: string },
): Promise<AutopilotAction[]> {
  const res = await apiFetch<AutopilotAction[]>(
    `/autopilot/actions${buildQuery({
      workspaceId,
      limit: options?.limit,
      status: options?.status,
    })}`,
  );
  if (res.error) throw new Error('Failed to fetch autopilot actions');
  return res.data ?? [];
}

export async function exportAutopilotActions(
  workspaceId: string,
  status?: string,
  token?: string,
): Promise<string> {
  const res = await fetch(
    `${API_BASE}/autopilot/actions/export${buildQuery({ workspaceId, status })}`,
    {
      headers: authHeaders(token),
    },
  );
  if (!res.ok) throw new Error('Failed to export autopilot actions');
  return res.text();
}

export async function retryAutopilotContact(
  workspaceId: string,
  contactId: string,
  _token?: string,
): Promise<Record<string, unknown>> {
  const res = await apiFetch<Record<string, unknown>>(`/autopilot/retry`, {
    method: 'POST',
    body: { workspaceId, contactId },
  });
  if (res.error) throw new Error('Failed to retry autopilot contact');
  invalidateAutopilot();
  return res.data as Record<string, unknown>;
}

export async function markAutopilotConversion(params: {
  workspaceId: string;
  contactId?: string;
  phone?: string;
  reason?: string;
  meta?: Record<string, unknown>;
  token?: string;
}): Promise<Record<string, unknown>> {
  const res = await apiFetch<Record<string, unknown>>(`/autopilot/conversion`, {
    method: 'POST',
    body: {
      workspaceId: params.workspaceId,
      contactId: params.contactId,
      phone: params.phone,
      reason: params.reason,
      meta: params.meta,
    },
  });
  if (res.error) throw new Error('Failed to mark conversion');
  invalidateAutopilot();
  return res.data as Record<string, unknown>;
}

export async function runAutopilot(params: {
  workspaceId: string;
  phone?: string;
  contactId?: string;
  message?: string;
  forceLocal?: boolean;
  token?: string;
}): Promise<Record<string, unknown>> {
  const res = await apiFetch<Record<string, unknown>>(`/autopilot/run`, {
    method: 'POST',
    body: {
      workspaceId: params.workspaceId,
      phone: params.phone,
      contactId: params.contactId,
      message: params.message,
      forceLocal: params.forceLocal,
    },
  });
  if (res.error) throw new Error('Failed to run autopilot');
  invalidateAutopilot();
  return res.data as Record<string, unknown>;
}

export async function getAutopilotMoneyReport(workspaceId: string) {
  return apiFetch<Record<string, unknown>>(
    `/autopilot/money-report?workspaceId=${encodeURIComponent(workspaceId)}`,
  );
}

export async function getAutopilotRevenueEvents(workspaceId: string, limit = 20) {
  return apiFetch<Record<string, unknown>>(
    `/autopilot/revenue-events?workspaceId=${encodeURIComponent(workspaceId)}&limit=${limit}`,
  );
}

export async function getAutopilotNextBestAction(workspaceId: string, contactId: string) {
  return apiFetch<Record<string, unknown>>(
    `/autopilot/next-best-action?workspaceId=${encodeURIComponent(workspaceId)}&contactId=${encodeURIComponent(contactId)}`,
  );
}

export interface MoneyMachineResult {
  processed?: number;
  sent?: number;
  scheduled?: number;
  skipped?: number;
  errors?: number;
  [key: string]: unknown;
}

export async function activateMoneyMachine(params: {
  workspaceId: string;
  topN?: number;
  autoSend?: boolean;
  smartTime?: boolean;
}): Promise<MoneyMachineResult> {
  const res = await apiFetch<MoneyMachineResult>(`/autopilot/money-machine`, {
    method: 'POST',
    body: {
      workspaceId: params.workspaceId,
      topN: params.topN ?? 200,
      autoSend: params.autoSend ?? false,
      smartTime: params.smartTime ?? false,
    },
  });
  if (res.error) throw new Error((res.error as string) || 'Failed to activate money machine');
  invalidateAutopilot();
  return res.data as MoneyMachineResult;
}

export interface AskInsightsResult {
  answer?: string;
  question?: string;
  [key: string]: unknown;
}

export async function askAutopilotInsights(
  workspaceId: string,
  question: string,
): Promise<AskInsightsResult> {
  const res = await apiFetch<AskInsightsResult>(`/autopilot/ask`, {
    method: 'POST',
    body: { workspaceId, question },
  });
  if (res.error) throw new Error((res.error as string) || 'Failed to ask insights');
  return res.data as AskInsightsResult;
}

export interface SendDirectResult {
  success?: boolean;
  messageId?: string;
  [key: string]: unknown;
}

export async function sendAutopilotDirectMessage(params: {
  workspaceId: string;
  contactId: string;
  message: string;
}): Promise<SendDirectResult> {
  const res = await apiFetch<SendDirectResult>(`/autopilot/send`, {
    method: 'POST',
    body: {
      workspaceId: params.workspaceId,
      contactId: params.contactId,
      message: params.message,
    },
  });
  if (res.error) throw new Error((res.error as string) || 'Failed to send direct message');
  return res.data as SendDirectResult;
}

export interface RuntimeConfig {
  autopilotEnabled?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  windowHours?: number;
  [key: string]: unknown;
}

export async function getAutopilotRuntimeConfig(): Promise<RuntimeConfig> {
  const res = await apiFetch<RuntimeConfig>(`/autopilot/runtime-config`);
  if (res.error) throw new Error((res.error as string) || 'Failed to fetch runtime config');
  return res.data as RuntimeConfig;
}
