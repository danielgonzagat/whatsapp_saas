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

function confirmDashboardStatsPayload(res: {
  data?: DashboardStatsResponse;
  error?: string;
  status?: number;
}): DashboardStatsResponse {
  if (res.error) {
    throw new Error(res.error);
  }
  if (typeof res.status === 'number' && res.status >= 400) {
    throw new Error('Erro ao carregar dashboard');
  }
  if (!res.data) {
    throw new Error('Dashboard stats did not return a confirmed payload');
  }
  return res.data;
}

export async function getDashboardStats(): Promise<DashboardStatsResponse> {
  const res = await apiFetch<DashboardStatsResponse>('/dashboard/stats');
  return confirmDashboardStatsPayload(res);
}
