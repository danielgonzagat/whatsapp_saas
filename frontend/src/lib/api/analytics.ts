// Analytics interfaces and functions
import { apiFetch, buildQuery } from './core';

/** Analytics dashboard stats shape. */
export interface AnalyticsDashboardStats {
  /** Messages property. */
  messages: number;
  /** Contacts property. */
  contacts: number;
  /** Flows property. */
  flows: number;
  /** Flow completed property. */
  flowCompleted: number;
  /** Flow failed property. */
  flowFailed: number;
  /** Flow running property. */
  flowRunning: number;
  /** Delivery rate property. */
  deliveryRate: number;
  /** Read rate property. */
  readRate: number;
  /** Error rate property. */
  errorRate: number;
  /** Sentiment property. */
  sentiment: { positive: number; negative: number; neutral: number };
  /** Lead score property. */
  leadScore: { high: number; medium: number; low: number };
}

/** Analytics daily activity item shape. */
export interface AnalyticsDailyActivityItem {
  /** Date property. */
  date: string;
  /** Inbound property. */
  inbound: number;
  /** Outbound property. */
  outbound: number;
}

/** Analytics advanced response shape. */
export interface AnalyticsAdvancedResponse {
  /** Range property. */
  range: { startDate: string; endDate: string };
  /** Sales property. */
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
  /** Leads property. */
  leads: { newContacts: number };
  /** Inbox property. */
  inbox: {
    conversationsByStatus: Record<string, number>;
    waitingByQueue: Array<{ id: string; name: string; waitingCount: number }>;
  };
  /** Funnels property. */
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
  /** Agents property. */
  agents: {
    performance: Array<{ agentId: string | null; messageCount: number; avgResponseTime: number }>;
  };
  /** Queues property. */
  queues: { stats: Array<{ id: string; name: string; waitingCount: number }> };
}

type AnalyticsApiEnvelope<T> = {
  data?: T;
  error?: string;
  status?: number;
};

function confirmAnalyticsPayload<T>(
  res: AnalyticsApiEnvelope<T>,
  fallbackError: string,
  missingPayloadError: string,
): T {
  if (res.error) {
    throw new Error(res.error);
  }
  if (typeof res.status === 'number' && res.status >= 400) {
    throw new Error(fallbackError);
  }
  if (res.data === undefined || res.data === null) {
    throw new Error(missingPayloadError);
  }
  return res.data;
}

function confirmAnalyticsListPayload<T>(
  res: AnalyticsApiEnvelope<T[]>,
  fallbackError: string,
  missingPayloadError: string,
): T[] {
  const data = confirmAnalyticsPayload(res, fallbackError, missingPayloadError);
  if (!Array.isArray(data)) {
    throw new Error(missingPayloadError);
  }
  return data;
}

/** Get analytics dashboard. */
export async function getAnalyticsDashboard(): Promise<AnalyticsDashboardStats> {
  const res = await apiFetch<AnalyticsDashboardStats>(`/analytics/dashboard`);
  return confirmAnalyticsPayload(
    res,
    'Erro ao carregar analytics dashboard',
    'Analytics dashboard did not return a confirmed payload',
  );
}

/** Get analytics daily activity. */
export async function getAnalyticsDailyActivity(): Promise<AnalyticsDailyActivityItem[]> {
  const res = await apiFetch<AnalyticsDailyActivityItem[]>(`/analytics/activity`);
  return confirmAnalyticsListPayload(
    res,
    'Erro ao carregar analytics daily activity',
    'Analytics daily activity did not return a confirmed payload',
  );
}

/** Get analytics advanced. */
export async function getAnalyticsAdvanced(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<AnalyticsAdvancedResponse> {
  const query = buildQuery({ startDate: params?.startDate, endDate: params?.endDate });
  const res = await apiFetch<AnalyticsAdvancedResponse>(`/analytics/advanced${query}`);
  return confirmAnalyticsPayload(
    res,
    'Erro ao carregar analytics advanced',
    'Analytics advanced did not return a confirmed payload',
  );
}

// ── Smart Time ──

export interface SmartTimeResponse {
  /** Best hours property. */
  bestHours: number[];
  /** Best days property. */
  bestDays: string[];
  /** Peak hour property. */
  peakHour: number;
  /** Peak day property. */
  peakDay: string;
  /** Heatmap property. */
  heatmap: Array<{ hour: number; day: string; score: number }>;
}

/** Get smart time. */
export async function getSmartTime(): Promise<SmartTimeResponse> {
  const res = await apiFetch<SmartTimeResponse>(`/analytics/smart-time`);
  return confirmAnalyticsPayload(
    res,
    'Erro ao carregar smart time',
    'Smart time did not return a confirmed payload',
  );
}

// ── Stats (overall workspace stats) ──

export async function getAnalyticsStats(): Promise<AnalyticsDashboardStats> {
  const res = await apiFetch<AnalyticsDashboardStats>(`/analytics/stats`);
  return confirmAnalyticsPayload(
    res,
    'Erro ao carregar analytics stats',
    'Analytics stats did not return a confirmed payload',
  );
}

// ── Flow Analytics ──

export interface FlowAnalyticsResponse {
  /** Flow id property. */
  flowId: string;
  /** Name property. */
  name?: string;
  /** Total executions property. */
  totalExecutions: number;
  /** Completed property. */
  completed: number;
  /** Failed property. */
  failed: number;
  /** Running property. */
  running: number;
  /** Completion rate property. */
  completionRate: number;
  /** By day property. */
  byDay?: Array<{ date: string; count: number }>;
}

/** Get flow analytics. */
export async function getFlowAnalytics(flowId: string): Promise<FlowAnalyticsResponse> {
  const res = await apiFetch<FlowAnalyticsResponse>(`/analytics/flow/${flowId}`);
  return confirmAnalyticsPayload(
    res,
    'Erro ao carregar flow analytics',
    'Flow analytics did not return a confirmed payload',
  );
}

// ── Full Report ──

export interface AnalyticsFullReport {
  /** Period property. */
  period: string;
  /** Messages property. */
  messages: { total: number; inbound: number; outbound: number };
  /** Contacts property. */
  contacts: { total: number; new: number };
  /** Flows property. */
  flows: { executions: number; completed: number; failed: number };
  /** Sales property. */
  sales?: { total: number; paid: number; revenue: number };
  [key: string]: unknown;
}

/** Get analytics full report. */
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
  return confirmAnalyticsPayload(
    res,
    'Erro ao carregar analytics full report',
    'Analytics full report did not return a confirmed payload',
  );
}
