'use client';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';

/* ── Response types ── */
type ReportResponse = Record<string, any>;
type AIReportResponse = Record<string, any>;

export function useReports(period: string = '30d') {
  // Support custom period format: "custom:YYYY-MM-DD:YYYY-MM-DD"
  const isCustom = period.startsWith('custom:');
  const url = isCustom
    ? (() => { const [, start, end] = period.split(':'); return `/analytics/reports?startDate=${start}&endDate=${end}`; })()
    : `/analytics/reports?period=${period}`;
  const { data, isLoading, error, mutate } = useSWR(url, swrFetcher, { refreshInterval: 120_000, keepPreviousData: true });
  return { report: (data || {}) as ReportResponse, isLoading, error, mutate };
}

export function useAIReport() {
  const { data, isLoading } = useSWR('/analytics/reports/ai', swrFetcher, { refreshInterval: 300_000, dedupingInterval: 10_000, keepPreviousData: true });
  return { aiReport: (data || {}) as AIReportResponse, isLoading };
}
