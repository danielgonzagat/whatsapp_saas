'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { unwrapArray } from '@/lib/normalizer';

/* ── Followups list ── */
export function useFollowups() {
  const { data, error, isLoading, mutate } = useSWR('/followups', swrFetcher);
  const items = unwrapArray(data, 'followups');
  return { followups: items, total: (data as any)?.count ?? items.length, isLoading, error, mutate };
}

/* ── Followup stats ── */
export function useFollowupStats() {
  const { data, error, isLoading, mutate } = useSWR('/followups/stats', swrFetcher);
  return { stats: data, isLoading, error, mutate };
}
