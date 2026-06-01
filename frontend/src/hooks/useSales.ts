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

type SalesMutationResponse = {
  error?: string | undefined;
  success?: boolean | undefined;
};

type CountedListPayload = Record<string, unknown> | undefined;

type ResolvedRecord<T> = { value: T; payloadError?: Error };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasFiniteNumberKeys(record: Record<string, unknown>, keys: string[]) {
  return keys.every((key) => typeof record[key] === 'number' && Number.isFinite(record[key]));
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'number' && Number.isFinite(item));
}

function resolveCountedListPayload(
  payload: CountedListPayload,
  key: string,
  isLoading: boolean,
  invalidMessage: string,
): { items: unknown[]; total: number; payloadError?: Error } {
  if (payload === undefined) {
    return isLoading
      ? { items: [], total: 0 }
      : { items: [], total: 0, payloadError: new Error(invalidMessage) };
  }

  const items = payload[key];
  const total = payload.count;
  if (Array.isArray(items) && typeof total === 'number' && Number.isFinite(total)) {
    return { items, total };
  }

  return { items: [], total: 0, payloadError: new Error(invalidMessage) };
}

function resolveRecordPayload<T extends Record<string, unknown>>(
  payload: unknown,
  isLoading: boolean,
  invalidMessage: string,
  requiredNumberKeys: string[],
  requiredRecordKeys: string[] = [],
): ResolvedRecord<T> {
  if (payload === undefined) {
    if (isLoading) {
      return { value: {} as T };
    }
    return { value: {} as T, payloadError: new Error(invalidMessage) };
  }

  if (!isRecord(payload) || !hasFiniteNumberKeys(payload, requiredNumberKeys)) {
    return { value: {} as T, payloadError: new Error(invalidMessage) };
  }

  if (!requiredRecordKeys.every((key) => isRecord(payload[key]))) {
    return { value: {} as T, payloadError: new Error(invalidMessage) };
  }

  return { value: payload as T };
}

function resolveChartPayload(
  payload: SalesChartResponse | undefined,
  isLoading: boolean,
): { chart: number[]; payloadError?: Error } {
  if (payload === undefined) {
    return isLoading ? { chart: [] } : { chart: [], payloadError: new Error('Invalid sales chart payload') };
  }

  if (!isRecord(payload) || !Array.isArray(payload.chart)) {
    return { chart: [], payloadError: new Error('Invalid sales chart payload') };
  }

  const chart = payload.chart;
  if (!chart.every((value): value is number => typeof value === 'number' && Number.isFinite(value))) {
    return { chart: [], payloadError: new Error('Invalid sales chart payload') };
  }

  return { chart };
}

function requireSalesMutationSuccess<T extends SalesMutationResponse>(response: T, fallback: string): T {
  if (response.error) {
    throw new Error(response.error);
  }
  if (response.success === false) {
    throw new Error(fallback);
  }
  return response;
}

/** Use sales. */
export function useSales(params?: { status?: string; search?: string; method?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== 'todos') {
    qs.set('status', params.status);
  }
  if (params?.search) {
    qs.set('search', params.search);
  }
  if (params?.method) {
    qs.set('method', params.method);
  }
  const q = qs.toString();
  const { data, isLoading, error, mutate } = useSWR<SalesResponse>(
    `/sales${q ? `?${q}` : ''}`,
    swrFetcher,
  );
  const { items, total, payloadError } = resolveCountedListPayload(
    data as CountedListPayload,
    'sales',
    isLoading,
    'Invalid sales payload',
  );
  return { sales: items, total, isLoading, error: error ?? payloadError, mutate };
}

/** Use sales stats. */
export function useSalesStats() {
  const { data, isLoading, error } = useSWR<SalesStatsResponse>('/sales/stats', swrFetcher, {
    refreshInterval: 60_000,
  });
  const { value: stats, payloadError } = resolveRecordPayload<SalesStatsResponse>(
    data,
    isLoading,
    'Invalid sales stats payload',
    ['totalRevenue', 'totalTransactions', 'totalPending', 'pendingCount', 'avgTicket', 'revenueTrend'],
  );
  return { stats, isLoading, error: error ?? payloadError };
}

/** Use sales chart. */
export function useSalesChart() {
  const { data, isLoading, error } = useSWR<SalesChartResponse>('/sales/chart', swrFetcher);
  const { chart, payloadError } = resolveChartPayload(data, isLoading);
  return { chart, isLoading, error: error ?? payloadError };
}

/** Use subscriptions. */
export function useSubscriptions(params?: { status?: string }) {
  const q = params?.status && params.status !== 'todos' ? `?status=${params.status}` : '';
  const { data, isLoading, error, mutate } = useSWR<SubscriptionsResponse>(
    `/sales/subscriptions${q}`,
    swrFetcher,
  );
  const { items, total, payloadError } = resolveCountedListPayload(
    data as CountedListPayload,
    'subscriptions',
    isLoading,
    'Invalid subscriptions payload',
  );
  return { subscriptions: items, total, isLoading, error: error ?? payloadError, mutate };
}

/** Use subscription stats. */
export function useSubscriptionStats() {
  const { data, isLoading, error } = useSWR<SalesStatsResponse>(
    '/sales/subscriptions/stats',
    swrFetcher,
    {
      refreshInterval: 60_000,
    },
  );
  const { value: stats, payloadError } = resolveRecordPayload<SalesStatsResponse>(
    data,
    isLoading,
    'Invalid subscription stats payload',
    ['mrr', 'arr', 'activeCount', 'totalCount', 'churnRate', 'avgLtv'],
    ['lifecycle'],
  );
  return { stats, isLoading, error: error ?? payloadError };
}

/** Use orders. */
export function useOrders(params?: { status?: string }) {
  const q = params?.status && params.status !== 'todos' ? `?status=${params.status}` : '';
  const { data, isLoading, error, mutate } = useSWR<OrdersResponse>(
    `/sales/orders${q}`,
    swrFetcher,
  );
  const { items, total, payloadError } = resolveCountedListPayload(
    data as CountedListPayload,
    'orders',
    isLoading,
    'Invalid orders payload',
  );
  return { orders: items, total, isLoading, error: error ?? payloadError, mutate };
}

/** Use order stats. */
export function useOrderStats() {
  const { data, isLoading, error } = useSWR<SalesStatsResponse>('/sales/orders/stats', swrFetcher);
  const { value: stats, payloadError } = resolveRecordPayload<SalesStatsResponse>(
    data,
    isLoading,
    'Invalid order stats payload',
    ['total', 'processing', 'shipped', 'delivered'],
  );
  return { stats, isLoading, error: error ?? payloadError };
}

/** Use order pipeline. */
export function useOrderPipeline() {
  const { data, isLoading, error } = useSWR<OrderPipelineResponse>(
    '/sales/orders/pipeline',
    swrFetcher,
  );
  const { value: pipeline, payloadError } = resolveRecordPayload<OrderPipelineResponse>(
    data,
    isLoading,
    'Invalid order pipeline payload',
    ['processing', 'shipped', 'delivered', 'returned', 'cancelled'],
  );
  return { pipeline, isLoading, error: error ?? payloadError };
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

function resolveAlertsPayload(
  payload: AlertsResponse | undefined,
  isLoading: boolean,
): { alerts: OrderAlert[]; counts: Record<string, number>; payloadError?: Error } {
  if (payload === undefined) {
    return isLoading
      ? { alerts: [], counts: {} }
      : { alerts: [], counts: {}, payloadError: new Error('Invalid order alerts payload') };
  }

  if (!isRecord(payload) || !Array.isArray(payload.alerts) || !isNumberRecord(payload.counts)) {
    return { alerts: [], counts: {}, payloadError: new Error('Invalid order alerts payload') };
  }

  return { alerts: payload.alerts as OrderAlert[], counts: payload.counts };
}

/** Use order alerts. */
export function useOrderAlerts(resolved?: boolean) {
  const qs = resolved !== undefined ? `?resolved=${resolved}` : '';
  const { data, isLoading, error, mutate } = useSWR<AlertsResponse>(
    `/sales/orders/alerts${qs}`,
    swrFetcher,
    { refreshInterval: 300_000 },
  );
  const { alerts, counts, payloadError } = resolveAlertsPayload(data, isLoading);

  const generateAlerts = useCallback(async () => {
    const res = requireSalesMutationSuccess(
      await apiFetch('/sales/orders/alerts/generate', { method: 'POST' }),
      'Não foi possível gerar alertas de pedidos.',
    );
    await mutate();
    return res;
  }, [mutate]);

  const resolveAlert = useCallback(
    async (id: string) => {
      const res = requireSalesMutationSuccess(
        await apiFetch(`/sales/orders/alerts/${id}/resolve`, { method: 'POST' }),
        'Não foi possível resolver o alerta de pedido.',
      );
      await mutate();
      return res;
    },
    [mutate],
  );

  return {
    alerts,
    counts,
    isLoading,
    error: error ?? payloadError,
    mutate,
    generateAlerts,
    resolveAlert,
  };
}

/* ── Return physical order ── */
export function useReturnOrder() {
  const returnOrder = useCallback(async (id: string) => {
    const res = requireSalesMutationSuccess(
      await apiFetch(`/sales/orders/${id}/return`, { method: 'PUT' }),
      'Não foi possível solicitar devolução do pedido.',
    );
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
