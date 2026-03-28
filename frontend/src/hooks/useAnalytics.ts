'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';

/* ── Response types ── */
interface AnalyticsDashboard {
  messagesSent?: number;
  messages?: number;
  conversations?: number;
  chats?: number;
  newLeads?: number;
  leads?: number;
  sales?: number;
  conversions?: number;
  responseRate?: number;
  replyRate?: number;
  revenue?: number;
  avgResponseTime?: number;
  responseTime?: number;
  satisfaction?: number;
  messagesPerChat?: number;
  avgMessages?: number;
  closeRate?: number;
  hotLeads?: number;
  automationsRun?: number;
  automations?: number;
  followupsSent?: number;
  followups?: number;
}

interface AnalyticsActivity {
  items?: unknown[];
  events?: unknown[];
}

/* ── Dashboard overview (auto-refresh every 60s) ── */
export function useAnalyticsDashboard() {
  const { data, error, isLoading, mutate } = useSWR('/analytics/dashboard', swrFetcher, {
    refreshInterval: 60_000,
  });
  return { dashboard: data as AnalyticsDashboard | undefined, isLoading, error, mutate };
}

/* ── Activity feed ── */
export function useAnalyticsActivity() {
  const { data, error, isLoading, mutate } = useSWR('/analytics/activity', swrFetcher);
  return { activity: data as AnalyticsActivity | unknown[] | undefined, isLoading, error, mutate };
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
