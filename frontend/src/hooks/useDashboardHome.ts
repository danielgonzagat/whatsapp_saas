'use client';

import useSWR from 'swr';
import type { DashboardHomePeriod, DashboardHomeResponse } from '@/lib/api/home';
import { swrFetcher } from '@/lib/fetcher';

function buildDashboardHomeUrl(params?: {
  period?: DashboardHomePeriod;
  startDate?: string;
  endDate?: string;
}) {
  const search = new URLSearchParams();
  if (params?.period) search.set('period', params.period);
  if (params?.startDate) search.set('startDate', params.startDate);
  if (params?.endDate) search.set('endDate', params.endDate);
  const query = search.toString();
  return `/dashboard/home${query ? `?${query}` : ''}`;
}

export function useDashboardHome(params?: {
  period?: DashboardHomePeriod;
  startDate?: string;
  endDate?: string;
}) {
  const key = buildDashboardHomeUrl(params);
  const { data, error, isLoading, mutate } = useSWR<DashboardHomeResponse>(key, swrFetcher, {
    refreshInterval: 60_000,
    keepPreviousData: true,
  });

  return {
    home: data,
    isLoading,
    error,
    mutate,
  };
}
