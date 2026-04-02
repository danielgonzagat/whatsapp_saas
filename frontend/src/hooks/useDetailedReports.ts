'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';

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
  return `/reports/${endpoint}${qs ? '?' + qs : ''}`;
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
  return { assinaturas: data?.data || [], total: data?.total || 0, summary: data?.summary || [], isLoading };
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
  return { metricas: data || { totalSales: 0, paidSales: 0, conversao: 0, byMethod: {} }, isLoading };
}

export function useEstornos(f: ReportFilters = {}) {
  const { data, isLoading } = useSWR<any>(buildUrl('estornos', f), swrFetcher, opts);
  return { estornos: data?.data || [], total: data?.total || 0, isLoading };
}

export function useChargeback(f: ReportFilters = {}) {
  const { data, isLoading } = useSWR<any>(buildUrl('chargeback', f), swrFetcher, opts);
  return { chargebacks: data?.data || [], total: data?.total || 0, isLoading };
}
