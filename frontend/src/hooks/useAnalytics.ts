'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';

/* ── Dashboard overview (auto-refresh every 60s) ── */
export function useAnalyticsDashboard() {
  const { data, error, isLoading, mutate } = useSWR('/analytics/dashboard', swrFetcher, {
    refreshInterval: 60_000,
  });
  return { dashboard: data, isLoading, error, mutate };
}

/* ── Activity feed ── */
export function useAnalyticsActivity() {
  const { data, error, isLoading, mutate } = useSWR('/analytics/activity', swrFetcher);
  return { activity: data, isLoading, error, mutate };
}

/* ── Advanced analytics with date range ── */
export function useAnalyticsAdvanced(dateRange?: { start?: string; end?: string }) {
  const qs = dateRange
    ? '?' + new URLSearchParams(
        Object.entries(dateRange).filter(([, v]) => v) as [string, string][]
      ).toString()
    : '';
  const { data, error, isLoading, mutate } = useSWR(`/analytics/advanced${qs}`, swrFetcher);
  return { analytics: data, isLoading, error, mutate };
}
