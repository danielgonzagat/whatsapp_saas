'use client';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';

export function useReports(period: string = '30d') {
  const { data, isLoading, error, mutate } = useSWR(`/analytics/reports?period=${period}`, swrFetcher, { refreshInterval: 120_000 });
  return { report: data || {}, isLoading, error, mutate };
}

export function useAIReport() {
  const { data, isLoading } = useSWR('/analytics/reports/ai', swrFetcher, { refreshInterval: 60_000 });
  return { aiReport: data || {}, isLoading };
}
