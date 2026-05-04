import { apiFetch } from './core';

export interface DashboardStatsResponse {
  contacts: number;
  campaigns: number;
  flows: number;
  messages: number;
  deliveryRate: number;
  readRate: number;
  errorRate: number;
  activeConversations: number;
  healthScore: number;
  avgLatency: number;
  flowCompleted: number;
  flowRunning: number;
  flowFailed: number;
  billingSuspended: boolean;
}

export async function getDashboardStats(): Promise<DashboardStatsResponse> {
  const res = await apiFetch<DashboardStatsResponse>('/dashboard/stats');
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data as DashboardStatsResponse;
}
