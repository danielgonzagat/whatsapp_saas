'use client';

import type {
  DashboardHomePeriod,
  DashboardHomeResponse,
  DashboardPostPaymentResponse,
} from '@/lib/api/home';
import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';

function buildDashboardHomeUrl(params?: {
  period?: DashboardHomePeriod;
  startDate?: string;
  endDate?: string;
}) {
  const search = new URLSearchParams();
  if (params?.period) {
    search.set('period', params.period);
  }
  if (params?.startDate) {
    search.set('startDate', params.startDate);
  }
  if (params?.endDate) {
    search.set('endDate', params.endDate);
  }
  const query = search.toString();
  return `/dashboard/home${query ? `?${query}` : ''}`;
}

/** Use dashboard home. */
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

/** Use dashboard post-payment snapshot. */
export function useDashboardPostPayment() {
  const { data, error, isLoading, mutate } = useSWR<DashboardPostPaymentResponse>(
    '/dashboard/post-payment',
    swrFetcher,
    {
      refreshInterval: 60_000,
      keepPreviousData: true,
    },
  );

  return { postPayment: data, isLoading, error, mutate };
}
