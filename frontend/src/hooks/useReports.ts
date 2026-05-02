'use client';
import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';

/* ── Response types ── */
/**
 * Analytics payload shapes. Backend evolves, so known-accessed branches are
 * declared explicitly as optional while extra keys remain permissive — this
 * keeps hooks typed without cascading forced edits through analytics views.
 */
interface ReportSentiment {
  positive?: number;
  neutral?: number;
  negative?: number;
}
interface ReportLeadScore {
  high?: number;
  medium?: number;
  low?: number;
}

/** Shape returned by GET /analytics/reports (getFullReport). */
export interface FullReportKpi {
  totalRevenue: number;
  revenueTrend: number;
  totalSales: number;
  salesTrend: number;
  totalLeads: number;
  leadsTrend: number;
  conversionRate: number;
  avgTicket: number;
  totalPending: number;
  adSpend: number;
  roas: number | null;
}

export interface FullReportResponse {
  period: string;
  kpi: FullReportKpi;
  revenueChart: { current: number[]; previous: number[] };
  topProducts: Array<{ name: string; sales: number; revenue: number }>;
  funnel: {
    visitors: number;
    leads: number;
    qualified: number;
    negotiation: number;
    converted: number;
  };
  paymentMethods: Array<{ method: string; count: number; revenue: number }>;
  salesByHour: number[];
  salesByWeekday: number[];
  aiPerformance: { totalMessages: number; aiMessages: number };
  financial: {
    available: number;
    pending: number;
    refunds: number;
    refundCount: number;
  };
}

interface ReportResponse {
  messages?: { total: number; inbound: number; outbound: number };
  leads?: { newContacts: number };
  flows?: { executions: number; completed: number };
  sales?: { revenue: number };
  [key: string]: unknown;
}

/** Map backend FullReportResponse to the legacy ReportResponse shape used by EngajamentoTab. */
function mapFullReportToReportResponse(full: FullReportResponse): ReportResponse {
  return {
    messages: {
      total: full.aiPerformance?.totalMessages ?? 0,
      inbound: 0,
      outbound: full.aiPerformance?.aiMessages ?? 0,
    },
    leads: {
      newContacts: full.kpi?.totalLeads ?? 0,
    },
    flows: {
      executions: 0,
      completed: 0,
    },
    sales: {
      revenue: full.kpi?.totalRevenue ?? 0,
    },
  };
}

interface AnalyticsStatsResponse {
  messages?: number;
  contacts?: number;
  deliveryRate?: number;
  readRate?: number;
  flows?: number;
  flowCompleted?: number;
  sentiment?: ReportSentiment;
  leadScore?: ReportLeadScore;
  [key: string]: unknown;
}

type AIReportResponse = Record<string, unknown>;

/** Use reports — fetches GET /analytics/reports and maps to legacy shape. */
export function useReports(period = '30d') {
  const isCustom = period.startsWith('custom:');
  const url = isCustom
    ? (() => {
        const [, start, end] = period.split(':');
        return `/analytics/reports?startDate=${start}&endDate=${end}`;
      })()
    : `/analytics/reports?period=${period}`;
  const { data, isLoading, error, mutate } = useSWR(url, swrFetcher, {
    refreshInterval: 120_000,
    keepPreviousData: true,
  });
  const raw = data as FullReportResponse | null | undefined;
  const report: ReportResponse | null = raw?.kpi ? mapFullReportToReportResponse(raw) : null;
  return { report, isLoading, error, mutate };
}

/** Use ai report. */
export function useAIReport() {
  const { data, isLoading } = useSWR('/analytics/reports/ai', swrFetcher, {
    refreshInterval: 300_000,
    dedupingInterval: 10_000,
    keepPreviousData: true,
  });
  return { aiReport: (data || {}) as AIReportResponse, isLoading };
}

// ── Smart Time ──

export interface SmartTimeData {
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

/** Use smart time. */
export function useSmartTime() {
  const { data, isLoading, error } = useSWR<SmartTimeData>('/analytics/smart-time', swrFetcher, {
    refreshInterval: 3_600_000, // 1 hour — rarely changes
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  return { smartTime: data || null, isLoading, error };
}

// ── Analytics Stats ──

export function useAnalyticsStats() {
  const { data, isLoading, error, mutate } = useSWR('/analytics/stats', swrFetcher, {
    refreshInterval: 120_000,
    keepPreviousData: true,
  });
  return { stats: (data || {}) as AnalyticsStatsResponse, isLoading, error, mutate };
}

// ── Flow Analytics ──

export interface FlowAnalyticsData {
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

/** Use flow analytics. */
export function useFlowAnalytics(flowId: string | null) {
  const { data, isLoading, error } = useSWR<FlowAnalyticsData>(
    flowId ? `/analytics/flow/${flowId}` : null,
    swrFetcher,
    { keepPreviousData: true, revalidateOnFocus: false },
  );
  return { flowStats: data || null, isLoading, error };
}
