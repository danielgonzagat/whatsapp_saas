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
  agents: { performance: Array<{ agentId: string | null; messageCount: number; avgResponseTime: number }> };
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

export async function getAnalyticsAdvanced(params?: { startDate?: string; endDate?: string }): Promise<AnalyticsAdvancedResponse> {
  const query = buildQuery({ startDate: params?.startDate, endDate: params?.endDate });
  const res = await apiFetch<AnalyticsAdvancedResponse>(`/analytics/advanced${query}`);
  if (res.error) throw new Error(res.error);
  return res.data as AnalyticsAdvancedResponse;
}
