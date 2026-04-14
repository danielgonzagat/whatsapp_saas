'use client';
import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';

/* ── Response types ── */
type ReportResponse = Record<string, any>;
type AIReportResponse = Record<string, any>;

export function useReports(period = '30d') {
  // Support custom period format: "custom:YYYY-MM-DD:YYYY-MM-DD"
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
  return { report: (data || {}) as ReportResponse, isLoading, error, mutate };
}

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
  bestHours: number[];
  bestDays: string[];
  peakHour: number;
  peakDay: string;
  heatmap: Array<{ hour: number; day: string; score: number }>;
}

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
  return { stats: (data || {}) as ReportResponse, isLoading, error, mutate };
}

// ── Flow Analytics ──

export interface FlowAnalyticsData {
  flowId: string;
  name?: string;
  totalExecutions: number;
  completed: number;
  failed: number;
  running: number;
  completionRate: number;
  byDay?: Array<{ date: string; count: number }>;
}

export function useFlowAnalytics(flowId: string | null) {
  const { data, isLoading, error } = useSWR<FlowAnalyticsData>(
    flowId ? `/analytics/flow/${flowId}` : null,
    swrFetcher,
    { keepPreviousData: true, revalidateOnFocus: false },
  );
  return { flowStats: data || null, isLoading, error };
}
