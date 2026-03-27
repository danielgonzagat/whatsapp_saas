'use client';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';

export function useSales(params?: { status?: string; search?: string; method?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== 'todos') qs.set('status', params.status);
  if (params?.search) qs.set('search', params.search);
  if (params?.method) qs.set('method', params.method);
  const q = qs.toString();
  const { data, isLoading, error, mutate } = useSWR(`/sales${q ? `?${q}` : ''}`, swrFetcher);
  const d = data as any;
  return { sales: d?.sales || [], total: d?.count || 0, isLoading, error, mutate };
}

export function useSalesStats() {
  const { data, isLoading } = useSWR('/sales/stats', swrFetcher, { refreshInterval: 60_000 });
  return { stats: (data || {}) as any, isLoading };
}

export function useSalesChart() {
  const { data, isLoading } = useSWR('/sales/chart', swrFetcher);
  return { chart: (data as any)?.chart || [], isLoading };
}

export function useSubscriptions(params?: { status?: string }) {
  const q = params?.status && params.status !== 'todos' ? `?status=${params.status}` : '';
  const { data, isLoading, mutate } = useSWR(`/sales/subscriptions${q}`, swrFetcher);
  const d = data as any;
  return { subscriptions: d?.subscriptions || [], total: d?.count || 0, isLoading, mutate };
}

export function useSubscriptionStats() {
  const { data, isLoading } = useSWR('/sales/subscriptions/stats', swrFetcher, { refreshInterval: 60_000 });
  return { stats: (data || {}) as any, isLoading };
}

export function useOrders(params?: { status?: string }) {
  const q = params?.status && params.status !== 'todos' ? `?status=${params.status}` : '';
  const { data, isLoading, mutate } = useSWR(`/sales/orders${q}`, swrFetcher);
  const d = data as any;
  return { orders: d?.orders || [], total: d?.count || 0, isLoading, mutate };
}

export function useOrderStats() {
  const { data, isLoading } = useSWR('/sales/orders/stats', swrFetcher);
  return { stats: (data || {}) as any, isLoading };
}

export function useOrderPipeline() {
  const { data, isLoading } = useSWR('/sales/orders/pipeline', swrFetcher);
  return { pipeline: (data || {}) as any, isLoading };
}
