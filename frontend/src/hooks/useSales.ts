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
  return { sales: data?.sales || [], total: data?.count || 0, isLoading, error, mutate };
}

export function useSalesStats() {
  const { data, isLoading } = useSWR('/sales/stats', swrFetcher, { refreshInterval: 60_000 });
  return { stats: data || {}, isLoading };
}

export function useSalesChart() {
  const { data, isLoading } = useSWR('/sales/chart', swrFetcher);
  return { chart: data?.chart || [], isLoading };
}

export function useSubscriptions(params?: { status?: string }) {
  const q = params?.status && params.status !== 'todos' ? `?status=${params.status}` : '';
  const { data, isLoading, mutate } = useSWR(`/sales/subscriptions${q}`, swrFetcher);
  return { subscriptions: data?.subscriptions || [], total: data?.count || 0, isLoading, mutate };
}

export function useSubscriptionStats() {
  const { data, isLoading } = useSWR('/sales/subscriptions/stats', swrFetcher, { refreshInterval: 60_000 });
  return { stats: data || {}, isLoading };
}

export function useOrders(params?: { status?: string }) {
  const q = params?.status && params.status !== 'todos' ? `?status=${params.status}` : '';
  const { data, isLoading, mutate } = useSWR(`/sales/orders${q}`, swrFetcher);
  return { orders: data?.orders || [], total: data?.count || 0, isLoading, mutate };
}

export function useOrderStats() {
  const { data, isLoading } = useSWR('/sales/orders/stats', swrFetcher);
  return { stats: data || {}, isLoading };
}

export function useOrderPipeline() {
  const { data, isLoading } = useSWR('/sales/orders/pipeline', swrFetcher);
  return { pipeline: data || {}, isLoading };
}
