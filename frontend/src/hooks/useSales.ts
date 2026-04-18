'use client';
import { apiFetch } from '@/lib/api';
import { swrFetcher } from '@/lib/fetcher';
import { useCallback } from 'react';
import useSWR from 'swr';

/* ── Response types ── */
interface SalesResponse {
  sales: unknown[];
  count: number;
}

interface SalesStatsResponse {
  totalRevenue?: number;
  totalTransactions?: number;
  pendingCount?: number;
  activeCount?: number;
  pastDueCount?: number;
  processing?: number;
  shipped?: number;
  [key: string]: unknown;
}

interface SalesChartResponse {
  chart: number[];
}

interface SubscriptionsResponse {
  subscriptions: unknown[];
  count: number;
}

interface OrdersResponse {
  orders: unknown[];
  count: number;
}

type OrderPipelineResponse = Record<string, unknown>;

export function useSales(params?: { status?: string; search?: string; method?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== 'todos') qs.set('status', params.status);
  if (params?.search) qs.set('search', params.search);
  if (params?.method) qs.set('method', params.method);
  const q = qs.toString();
  const { data, isLoading, error, mutate } = useSWR(`/sales${q ? `?${q}` : ''}`, swrFetcher);
  const d = data as SalesResponse | undefined;
  return { sales: d?.sales || [], total: d?.count || 0, isLoading, error, mutate };
}

export function useSalesStats() {
  const { data, isLoading } = useSWR('/sales/stats', swrFetcher, { refreshInterval: 60_000 });
  return { stats: (data || {}) as SalesStatsResponse, isLoading };
}

export function useSalesChart() {
  const { data, isLoading } = useSWR('/sales/chart', swrFetcher);
  return { chart: (data as SalesChartResponse)?.chart || [], isLoading };
}

export function useSubscriptions(params?: { status?: string }) {
  const q = params?.status && params.status !== 'todos' ? `?status=${params.status}` : '';
  const { data, isLoading, mutate } = useSWR(`/sales/subscriptions${q}`, swrFetcher);
  const d = data as SubscriptionsResponse | undefined;
  return { subscriptions: d?.subscriptions || [], total: d?.count || 0, isLoading, mutate };
}

export function useSubscriptionStats() {
  const { data, isLoading } = useSWR('/sales/subscriptions/stats', swrFetcher, {
    refreshInterval: 60_000,
  });
  return { stats: (data || {}) as SalesStatsResponse, isLoading };
}

export function useOrders(params?: { status?: string }) {
  const q = params?.status && params.status !== 'todos' ? `?status=${params.status}` : '';
  const { data, isLoading, mutate } = useSWR(`/sales/orders${q}`, swrFetcher);
  const d = data as OrdersResponse | undefined;
  return { orders: d?.orders || [], total: d?.count || 0, isLoading, mutate };
}

export function useOrderStats() {
  const { data, isLoading } = useSWR('/sales/orders/stats', swrFetcher);
  return { stats: (data || {}) as SalesStatsResponse, isLoading };
}

export function useOrderPipeline() {
  const { data, isLoading } = useSWR('/sales/orders/pipeline', swrFetcher);
  return { pipeline: (data || {}) as OrderPipelineResponse, isLoading };
}

/* ── Order alerts ── */
interface OrderAlert {
  id: string;
  type: string;
  severity: string;
  message: string;
  orderId?: string;
  resolved: boolean;
  createdAt: string;
}

interface AlertsResponse {
  alerts: OrderAlert[];
  counts: Record<string, number>;
}

export function useOrderAlerts(resolved?: boolean) {
  const qs = resolved !== undefined ? `?resolved=${resolved}` : '';
  const { data, isLoading, mutate } = useSWR<AlertsResponse>(
    `/sales/orders/alerts${qs}`,
    swrFetcher,
    { refreshInterval: 300_000 },
  );
  const d = data as AlertsResponse | undefined;

  const generateAlerts = useCallback(async () => {
    const res = await apiFetch('/sales/orders/alerts/generate', { method: 'POST' });
    await mutate();
    return res;
  }, [mutate]);

  const resolveAlert = useCallback(
    async (id: string) => {
      const res = await apiFetch(`/sales/orders/alerts/${id}/resolve`, { method: 'POST' });
      await mutate();
      return res;
    },
    [mutate],
  );

  return {
    alerts: d?.alerts || [],
    counts: d?.counts || {},
    isLoading,
    mutate,
    generateAlerts,
    resolveAlert,
  };
}

/* ── Return physical order ── */
export function useReturnOrder() {
  const returnOrder = useCallback(async (id: string) => {
    const res = await apiFetch(`/sales/orders/${id}/return`, { method: 'PUT' });
    return res;
  }, []);
  return { returnOrder };
}

/* ── Sale detail (GET /sales/:id) ── */
export function useSaleDetail(id: string | null) {
  const { data, isLoading, error, mutate } = useSWR(id ? `/sales/${id}` : null, swrFetcher, {
    revalidateOnFocus: false,
  });
  const sale: unknown = data ?? null;
  return { sale, isLoading, error, mutate };
}
