'use client';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';

/* ── Response types ── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReportResponse = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AIReportResponse = Record<string, any>;

export function useReports(period: string = '30d') {
  const { data, isLoading, error, mutate } = useSWR(`/analytics/reports?period=${period}`, swrFetcher, { refreshInterval: 120_000 });
  return { report: (data || {}) as ReportResponse, isLoading, error, mutate };
}

export function useAIReport() {
  const { data, isLoading } = useSWR('/analytics/reports/ai', swrFetcher, { refreshInterval: 60_000 });
  return { aiReport: (data || {}) as AIReportResponse, isLoading };
}
