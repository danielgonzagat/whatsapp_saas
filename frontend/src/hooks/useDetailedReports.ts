'use client';

import { apiFetch } from '@/lib/api/core';
import { swrFetcher } from '@/lib/fetcher';
import useSWR, { useSWRConfig } from 'swr';

interface ReportFilters {
  startDate?: string;
  endDate?: string;
  product?: string;
  status?: string;
  paymentMethod?: string;
  affiliateEmail?: string;
  buyerEmail?: string;
  utmSource?: string;
  page?: number;
  perPage?: number;
}

function buildUrl(endpoint: string, filters: ReportFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  });
  const qs = params.toString();
  return `/reports/${endpoint}${qs ? `?${qs}` : ''}`;
}

const opts = { keepPreviousData: true, revalidateOnFocus: false };

export function useVendas(f: ReportFilters = {}) {
  const { data, isLoading, mutate } = useSWR<any>(buildUrl('vendas', f), swrFetcher, opts);
  return { vendas: data?.data || [], total: data?.total || 0, isLoading, mutate };
}

export function useVendasSummary(f: ReportFilters = {}) {
  const { data, isLoading } = useSWR<any>(buildUrl('vendas/summary', f), swrFetcher, opts);
  return { summary: data || {}, isLoading };
}

export function useVendasDaily(f: ReportFilters = {}) {
  const { data, isLoading } = useSWR<any>(buildUrl('vendas/daily', f), swrFetcher, opts);
  return { daily: Array.isArray(data) ? data : [], isLoading };
}

export function useAfterPay(f: ReportFilters = {}) {
  const { data, isLoading } = useSWR<any>(buildUrl('afterpay', f), swrFetcher, opts);
  return { afterpay: data?.data || [], total: data?.total || 0, isLoading };
}

export function useChurn(f: ReportFilters = {}) {
  const { data, isLoading } = useSWR<any>(buildUrl('churn', f), swrFetcher, opts);
  return { churn: data || { total: 0, data: [], monthly: [] }, isLoading };
}

export function useAbandonos(f: ReportFilters = {}) {
  const { data, isLoading } = useSWR<any>(buildUrl('abandonos', f), swrFetcher, opts);
  return { abandonos: data?.data || [], total: data?.total || 0, isLoading };
}

export function useAfiliados(f: ReportFilters = {}) {
  const { data, isLoading } = useSWR<any>(buildUrl('afiliados', f), swrFetcher, opts);
  return { afiliados: Array.isArray(data) ? data : [], isLoading };
}

export function useIndicadores(f: ReportFilters = {}) {
  const { data, isLoading } = useSWR<any>(buildUrl('indicadores', f), swrFetcher, opts);
  return { indicadores: Array.isArray(data) ? data : [], isLoading };
}

export function useAssinaturas(f: ReportFilters = {}) {
  const { data, isLoading } = useSWR<any>(buildUrl('assinaturas', f), swrFetcher, opts);
  return {
    assinaturas: data?.data || [],
    total: data?.total || 0,
    summary: data?.summary || [],
    isLoading,
  };
}

export function useIndicadoresProduto(f: ReportFilters = {}) {
  const { data, isLoading } = useSWR<any>(buildUrl('indicadores-produto', f), swrFetcher, opts);
  return { indicadoresProduto: Array.isArray(data) ? data : [], isLoading };
}

export function useRecusa(f: ReportFilters = {}) {
  const { data, isLoading } = useSWR<any>(buildUrl('recusa', f), swrFetcher, opts);
  return { recusa: data?.data || [], total: data?.total || 0, isLoading };
}

export function useOrigem(f: ReportFilters = {}) {
  const { data, isLoading } = useSWR<any>(buildUrl('origem', f), swrFetcher, opts);
  return { origem: Array.isArray(data) ? data : [], isLoading };
}

export function useMetricas(f: ReportFilters = {}) {
  const { data, isLoading } = useSWR<any>(buildUrl('metricas', f), swrFetcher, opts);
  return {
    metricas: data || { totalSales: 0, paidSales: 0, conversao: 0, byMethod: {} },
    isLoading,
  };
}

export function useEstornos(f: ReportFilters = {}) {
  const { data, isLoading } = useSWR<any>(buildUrl('estornos', f), swrFetcher, opts);
  return { estornos: data?.data || [], total: data?.total || 0, isLoading };
}

export function useChargeback(f: ReportFilters = {}) {
  const { data, isLoading } = useSWR<any>(buildUrl('chargeback', f), swrFetcher, opts);
  return { chargebacks: data?.data || [], total: data?.total || 0, isLoading };
}

// ── Ad Spend ──

interface AdSpendFilters {
  startDate?: string;
  endDate?: string;
}

export interface AdSpendEntry {
  id?: string;
  amount: number;
  platform: string;
  date: string;
  campaign?: string;
  description?: string;
}

export interface AdSpendReport {
  total: number;
  byPlatform: Record<string, number>;
  entries: AdSpendEntry[];
}

function buildAdSpendUrl(f: AdSpendFilters = {}) {
  const params = new URLSearchParams();
  if (f.startDate) params.set('startDate', f.startDate);
  if (f.endDate) params.set('endDate', f.endDate);
  const qs = params.toString();
  return `/reports/ad-spend${qs ? `?${qs}` : ''}`;
}

export function useAdSpends(f: AdSpendFilters = {}) {
  const { data, isLoading, mutate } = useSWR<AdSpendReport>(buildAdSpendUrl(f), swrFetcher, opts);
  return {
    adSpend: data || { total: 0, byPlatform: {}, entries: [] },
    isLoading,
    mutate,
  };
}

export function useAdSpendMutations() {
  const { mutate } = useSWRConfig();

  const registerAdSpend = async (payload: AdSpendEntry) => {
    const res = await apiFetch('/reports/ad-spend', { method: 'POST', body: payload });
    if (res.error) throw new Error(res.error || 'Erro ao registrar ad spend');
    mutate(
      (key: unknown) => typeof key === 'string' && key.startsWith('/reports/ad-spend'),
      undefined,
      { revalidate: true },
    );
    return res.data;
  };

  return { registerAdSpend };
}

// ── NPS ──

export interface NpsData {
  nps: number;
  avg: string;
  total: number;
  responses: Array<{
    id: string;
    details: { score?: number; comment?: string; orderId?: string };
    createdAt: string;
  }>;
}

export function useNps() {
  const { data, isLoading, mutate } = useSWR<NpsData>('/reports/nps', swrFetcher, {
    ...opts,
    refreshInterval: 300_000,
  });
  return {
    nps: data || { nps: 0, avg: '0.0', total: 0, responses: [] },
    isLoading,
    mutate,
  };
}

export function useNpsMutations() {
  const { mutate } = useSWRConfig();

  const submitNps = async (score: number, comment?: string, orderId?: string) => {
    const res = await apiFetch('/reports/nps', {
      method: 'POST',
      body: { score, comment, orderId },
    });
    if (res.error) throw new Error(res.error || 'Erro ao registrar NPS');
    mutate('/reports/nps');
    return res.data;
  };

  return { submitNps };
}
