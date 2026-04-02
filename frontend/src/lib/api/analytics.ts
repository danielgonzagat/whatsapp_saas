// Analytics interfaces and functions
import { apiFetch, buildQuery } from './core';

export interface AnalyticsDashboardStats {
  messages: number;
  contacts: number;
  flows: number;
  flowCompleted: number;
  flowFailed: number;
  flowRunning: number;
  deliveryRate: number;
  readRate: number;
  errorRate: number;
  sentiment: { positive: number; negative: number; neutral: number };
  leadScore: { high: number; medium: number; low: number };
}

export interface AnalyticsDailyActivityItem {
  date: string;
  inbound: number;
  outbound: number;
}

export interface AnalyticsAdvancedResponse {
  range: { startDate: string; endDate: string };
  sales: {
    totals: {
      totalCount: number;
      totalAmount: number;
      paidCount: number;
      paidAmount: number;
      conversionRate: number;
    };
    byDay: Array<{ day: string; paidAmount: number; paidCount: number; totalCount: number }>;
  };
  leads: { newContacts: number };
  inbox: {
    conversationsByStatus: Record<string, number>;
    waitingByQueue: Array<{ id: string; name: string; waitingCount: number }>;
  };
  funnels: {
    executionsByStatus: Record<string, number>;
    totals: {
      total: number;
      completed: number;
      failed: number;
      completionRate: number;
    };
    topFlows: Array<{ flowId: string; name: string; executions: number }>;
  };
  agents: {
    performance: Array<{ agentId: string | null; messageCount: number; avgResponseTime: number }>;
  };
  queues: { stats: Array<{ id: string; name: string; waitingCount: number }> };
}

export async function getAnalyticsDashboard(): Promise<AnalyticsDashboardStats> {
  const res = await apiFetch<AnalyticsDashboardStats>(`/analytics/dashboard`);
  if (res.error) throw new Error(res.error);
  return res.data as AnalyticsDashboardStats;
}

export async function getAnalyticsDailyActivity(): Promise<AnalyticsDailyActivityItem[]> {
  const res = await apiFetch<AnalyticsDailyActivityItem[]>(`/analytics/activity`);
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

export async function getAnalyticsAdvanced(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<AnalyticsAdvancedResponse> {
  const query = buildQuery({ startDate: params?.startDate, endDate: params?.endDate });
  const res = await apiFetch<AnalyticsAdvancedResponse>(`/analytics/advanced${query}`);
  if (res.error) throw new Error(res.error);
  return res.data as AnalyticsAdvancedResponse;
}

// ── Smart Time ──

export interface SmartTimeResponse {
  bestHours: number[];
  bestDays: string[];
  peakHour: number;
  peakDay: string;
  heatmap: Array<{ hour: number; day: string; score: number }>;
}

export async function getSmartTime(): Promise<SmartTimeResponse> {
  const res = await apiFetch<SmartTimeResponse>(`/analytics/smart-time`);
  if (res.error) throw new Error(res.error);
  return res.data as SmartTimeResponse;
}

// ── Stats (overall workspace stats) ──

export async function getAnalyticsStats(): Promise<AnalyticsDashboardStats> {
  const res = await apiFetch<AnalyticsDashboardStats>(`/analytics/stats`);
  if (res.error) throw new Error(res.error);
  return res.data as AnalyticsDashboardStats;
}

// ── Flow Analytics ──

export interface FlowAnalyticsResponse {
  flowId: string;
  name?: string;
  totalExecutions: number;
  completed: number;
  failed: number;
  running: number;
  completionRate: number;
  byDay?: Array<{ date: string; count: number }>;
}

export async function getFlowAnalytics(flowId: string): Promise<FlowAnalyticsResponse> {
  const res = await apiFetch<FlowAnalyticsResponse>(`/analytics/flow/${flowId}`);
  if (res.error) throw new Error(res.error);
  return res.data as FlowAnalyticsResponse;
}

// ── Full Report ──

export interface AnalyticsFullReport {
  period: string;
  messages: { total: number; inbound: number; outbound: number };
  contacts: { total: number; new: number };
  flows: { executions: number; completed: number; failed: number };
  sales?: { total: number; paid: number; revenue: number };
  [key: string]: unknown;
}

export async function getAnalyticsFullReport(params?: {
  period?: string;
  startDate?: string;
  endDate?: string;
}): Promise<AnalyticsFullReport> {
  const query = buildQuery({
    period: params?.period,
    startDate: params?.startDate,
    endDate: params?.endDate,
  });
  const res = await apiFetch<AnalyticsFullReport>(`/analytics/reports${query}`);
  if (res.error) throw new Error(res.error);
  return res.data as AnalyticsFullReport;
}
