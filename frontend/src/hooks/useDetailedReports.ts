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

interface PaginatedResponse<T = Record<string, unknown>> {
  data: T[];
  total: number;
}

interface VendasSummary {
  totalSales?: number;
  totalRevenue?: number;
  avgTicket?: number;
  ticketMedio?: number;
  totalCount?: number;
  paidCount?: number;
  conversao?: number;
  [key: string]: unknown;
}

interface DailyEntry {
  date?: string;
  day?: string;
  total?: number;
  count?: number;
  vendas?: number;
  receita?: number;
  [key: string]: unknown;
}

interface ChurnData {
  total: number;
  data: Record<string, unknown>[];
  monthly: Record<string, unknown>[];
}

interface MetricasData {
  totalSales: number;
  paidSales: number;
  conversao: number;
  byMethod: Record<string, unknown>;
}

interface AssinaturasResponse {
  data: Record<string, unknown>[];
  total: number;
  summary: Record<string, unknown>[];
}

interface AdSpendFilters {
  startDate?: string;
  endDate?: string;
}

/** Ad spend entry shape. */
export interface AdSpendEntry {
  /** Id property. */
  id?: string;
  /** Amount property. */
  amount: number;
  /** Platform property. */
  platform: string;
  /** Date property. */
  date: string;
  /** Campaign property. */
  campaign?: string;
  /** Description property. */
  description?: string;
}

/** Ad spend report shape. */
export interface AdSpendReport {
  /** Total property. */
  total: number;
  /** By platform property. */
  byPlatform: Record<string, number>;
  /** Entries property. */
  entries: AdSpendEntry[];
}

export interface NpsData {
  /** Nps property. */
  nps: number;
  /** Avg property. */
  avg: string;
  /** Total property. */
  total: number;
  /** Responses property. */
  responses: Array<{
    id: string;
    details: { score?: number; comment?: string; orderId?: string; [key: string]: unknown };
    createdAt: string;
  }>;
}

function buildUrl(endpoint: string, filters: ReportFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      params.set(k, String(v));
    }
  });
  const qs = params.toString();
  return `/reports/${endpoint}${qs ? `?${qs}` : ''}`;
}

const opts = { keepPreviousData: true, revalidateOnFocus: false };
const EMPTY_VENDAS_SUMMARY: VendasSummary = {};
const EMPTY_CHURN: ChurnData = { total: 0, data: [], monthly: [] };
const EMPTY_METRICAS: MetricasData = {
  totalSales: 0,
  paidSales: 0,
  conversao: 0,
  byMethod: {},
};
const EMPTY_AD_SPEND: AdSpendReport = { total: 0, byPlatform: {}, entries: [] };
const EMPTY_NPS: NpsData = { nps: 0, avg: '0.0', total: 0, responses: [] };

interface ResolvedArray<T> {
  items: T[];
  error?: Error;
}

interface ResolvedPaginated<T> extends ResolvedArray<T> {
  total: number;
}

interface ResolvedValue<T> {
  value: T;
  error?: Error;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function invalidPayload(label: string) {
  return new Error(`Invalid ${label} payload`);
}

function resolveArrayPayload<T>(data: unknown, label: string): ResolvedArray<T> {
  if (data === undefined) {
    return { items: [] };
  }
  if (Array.isArray(data)) {
    return { items: data as T[] };
  }
  return { items: [], error: invalidPayload(label) };
}

function resolvePaginatedPayload<T>(data: unknown, label: string): ResolvedPaginated<T> {
  if (data === undefined) {
    return { items: [], total: 0 };
  }
  const payload = asRecord(data);
  if (payload && Array.isArray(payload.data) && typeof payload.total === 'number') {
    return { items: payload.data as T[], total: payload.total };
  }
  return { items: [], total: 0, error: invalidPayload(label) };
}

function resolveRecordPayload<T>(
  data: unknown,
  fallback: T,
  label: string,
  isValid: (value: unknown) => value is T,
): ResolvedValue<T> {
  if (data === undefined) {
    return { value: fallback };
  }
  if (isValid(data)) {
    return { value: data };
  }
  return { value: fallback, error: invalidPayload(label) };
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  const record = asRecord(value);
  return Boolean(record && Object.values(record).every((item) => typeof item === 'number'));
}

function isVendasSummaryPayload(value: unknown): value is VendasSummary {
  return asRecord(value) !== null;
}

function isChurnPayload(value: unknown): value is ChurnData {
  const payload = asRecord(value);
  return Boolean(
    payload &&
      typeof payload.total === 'number' &&
      Array.isArray(payload.data) &&
      Array.isArray(payload.monthly),
  );
}

function isMetricasPayload(value: unknown): value is MetricasData {
  const payload = asRecord(value);
  return Boolean(
    payload &&
      typeof payload.totalSales === 'number' &&
      typeof payload.paidSales === 'number' &&
      typeof payload.conversao === 'number' &&
      asRecord(payload.byMethod),
  );
}

function isAssinaturasPayload(value: unknown): value is AssinaturasResponse {
  const payload = asRecord(value);
  return Boolean(
    payload &&
      Array.isArray(payload.data) &&
      typeof payload.total === 'number' &&
      Array.isArray(payload.summary),
  );
}

function isAdSpendEntry(value: unknown): value is AdSpendEntry {
  const entry = asRecord(value);
  return Boolean(
    entry &&
      typeof entry.amount === 'number' &&
      typeof entry.platform === 'string' &&
      typeof entry.date === 'string',
  );
}

function toByPlatform(entries: AdSpendEntry[]) {
  return entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.platform] = (acc[entry.platform] ?? 0) + entry.amount;
    return acc;
  }, {});
}

function isAdSpendReport(value: unknown): value is AdSpendReport {
  const payload = asRecord(value);
  return Boolean(
    payload &&
      typeof payload.total === 'number' &&
      isNumberRecord(payload.byPlatform) &&
      Array.isArray(payload.entries) &&
      payload.entries.every(isAdSpendEntry),
  );
}

function resolveAdSpendReport(data: unknown): ResolvedValue<AdSpendReport> {
  if (data === undefined) {
    return { value: EMPTY_AD_SPEND };
  }
  if (isAdSpendReport(data)) {
    return { value: data };
  }
  const payload = asRecord(data);
  if (
    payload &&
    Array.isArray(payload.data) &&
    payload.data.every(isAdSpendEntry) &&
    typeof payload.total === 'number'
  ) {
    const entries = payload.data as AdSpendEntry[];
    return { value: { total: payload.total, byPlatform: toByPlatform(entries), entries } };
  }
  return { value: EMPTY_AD_SPEND, error: invalidPayload('ad spend') };
}

function isNpsPayload(value: unknown): value is NpsData {
  const payload = asRecord(value);
  return Boolean(
    payload &&
      typeof payload.nps === 'number' &&
      typeof payload.avg === 'string' &&
      typeof payload.total === 'number' &&
      Array.isArray(payload.responses) &&
      payload.responses.every((item) => {
        const response = asRecord(item);
        return Boolean(
          response &&
            typeof response.id === 'string' &&
            asRecord(response.details) &&
            typeof response.createdAt === 'string',
        );
      }),
  );
}

/** Use vendas. */
export function useVendas(f: ReportFilters = {}) {
  const { data, error, isLoading, mutate } = useSWR<PaginatedResponse>(
    buildUrl('vendas', f),
    swrFetcher,
    opts,
  );
  const resolved = resolvePaginatedPayload<Record<string, unknown>>(data, 'vendas');
  return {
    vendas: resolved.items,
    total: resolved.total,
    isLoading,
    error: error ?? resolved.error,
    mutate,
  };
}

/** Use vendas summary. */
export function useVendasSummary(f: ReportFilters = {}) {
  const { data, error, isLoading } = useSWR<VendasSummary>(
    buildUrl('vendas/summary', f),
    swrFetcher,
    opts,
  );
  const resolved = resolveRecordPayload(
    data,
    EMPTY_VENDAS_SUMMARY,
    'vendas summary',
    isVendasSummaryPayload,
  );
  return { summary: resolved.value, isLoading, error: error ?? resolved.error };
}

/** Use vendas daily. */
export function useVendasDaily(f: ReportFilters = {}) {
  const { data, error, isLoading } = useSWR<DailyEntry[]>(
    buildUrl('vendas/daily', f),
    swrFetcher,
    opts,
  );
  const resolved = resolveArrayPayload<DailyEntry>(data, 'vendas daily');
  return { daily: resolved.items, isLoading, error: error ?? resolved.error };
}

/** Use after pay. */
export function useAfterPay(f: ReportFilters = {}) {
  const { data, error, isLoading } = useSWR<PaginatedResponse>(
    buildUrl('afterpay', f),
    swrFetcher,
    opts,
  );
  const resolved = resolvePaginatedPayload<Record<string, unknown>>(data, 'afterpay');
  return {
    afterpay: resolved.items,
    total: resolved.total,
    isLoading,
    error: error ?? resolved.error,
  };
}

/** Use churn. */
export function useChurn(f: ReportFilters = {}) {
  const { data, error, isLoading } = useSWR<ChurnData>(buildUrl('churn', f), swrFetcher, opts);
  const resolved = resolveRecordPayload(data, EMPTY_CHURN, 'churn', isChurnPayload);
  return { churn: resolved.value, isLoading, error: error ?? resolved.error };
}

/** Use abandonos. */
export function useAbandonos(f: ReportFilters = {}) {
  const { data, error, isLoading } = useSWR<PaginatedResponse>(
    buildUrl('abandonos', f),
    swrFetcher,
    opts,
  );
  const resolved = resolvePaginatedPayload<Record<string, unknown>>(data, 'abandonos');
  return {
    abandonos: resolved.items,
    total: resolved.total,
    isLoading,
    error: error ?? resolved.error,
  };
}

/** Use afiliados. */
export function useAfiliados(f: ReportFilters = {}) {
  const { data, error, isLoading } = useSWR<Record<string, unknown>[]>(
    buildUrl('afiliados', f),
    swrFetcher,
    opts,
  );
  const resolved = resolveArrayPayload<Record<string, unknown>>(data, 'afiliados');
  return { afiliados: resolved.items, isLoading, error: error ?? resolved.error };
}

/** Use indicadores. */
export function useIndicadores(f: ReportFilters = {}) {
  const { data, error, isLoading } = useSWR<Record<string, unknown>[]>(
    buildUrl('indicadores', f),
    swrFetcher,
    opts,
  );
  const resolved = resolveArrayPayload<Record<string, unknown>>(data, 'indicadores');
  return { indicadores: resolved.items, isLoading, error: error ?? resolved.error };
}

/** Use assinaturas. */
export function useAssinaturas(f: ReportFilters = {}) {
  const { data, error, isLoading } = useSWR<AssinaturasResponse>(
    buildUrl('assinaturas', f),
    swrFetcher,
    opts,
  );
  const resolved = resolveRecordPayload(
    data,
    { data: [], total: 0, summary: [] },
    'assinaturas',
    isAssinaturasPayload,
  );
  return {
    assinaturas: resolved.value.data,
    total: resolved.value.total,
    summary: resolved.value.summary,
    isLoading,
    error: error ?? resolved.error,
  };
}

/** Use indicadores produto. */
export function useIndicadoresProduto(f: ReportFilters = {}) {
  const { data, error, isLoading } = useSWR<Record<string, unknown>[]>(
    buildUrl('indicadores-produto', f),
    swrFetcher,
    opts,
  );
  const resolved = resolveArrayPayload<Record<string, unknown>>(data, 'indicadores produto');
  return { indicadoresProduto: resolved.items, isLoading, error: error ?? resolved.error };
}

/** Use recusa. */
export function useRecusa(f: ReportFilters = {}) {
  const { data, error, isLoading } = useSWR<PaginatedResponse>(
    buildUrl('recusa', f),
    swrFetcher,
    opts,
  );
  const resolved = resolvePaginatedPayload<Record<string, unknown>>(data, 'recusa');
  return { recusa: resolved.items, total: resolved.total, isLoading, error: error ?? resolved.error };
}

/** Use origem. */
export function useOrigem(f: ReportFilters = {}) {
  const { data, error, isLoading } = useSWR<Record<string, unknown>[]>(
    buildUrl('origem', f),
    swrFetcher,
    opts,
  );
  const resolved = resolveArrayPayload<Record<string, unknown>>(data, 'origem');
  return { origem: resolved.items, isLoading, error: error ?? resolved.error };
}

/** Use metricas. */
export function useMetricas(f: ReportFilters = {}) {
  const { data, error, isLoading } = useSWR<MetricasData>(
    buildUrl('metricas', f),
    swrFetcher,
    opts,
  );
  const resolved = resolveRecordPayload(data, EMPTY_METRICAS, 'metricas', isMetricasPayload);
  return {
    metricas: resolved.value,
    isLoading,
    error: error ?? resolved.error,
  };
}

/** Use estornos. */
export function useEstornos(f: ReportFilters = {}) {
  const { data, error, isLoading } = useSWR<PaginatedResponse>(
    buildUrl('estornos', f),
    swrFetcher,
    opts,
  );
  const resolved = resolvePaginatedPayload<Record<string, unknown>>(data, 'estornos');
  return {
    estornos: resolved.items,
    total: resolved.total,
    isLoading,
    error: error ?? resolved.error,
  };
}

/** Use chargeback. */
export function useChargeback(f: ReportFilters = {}) {
  const { data, error, isLoading } = useSWR<PaginatedResponse>(
    buildUrl('chargeback', f),
    swrFetcher,
    opts,
  );
  const resolved = resolvePaginatedPayload<Record<string, unknown>>(data, 'chargeback');
  return {
    chargebacks: resolved.items,
    total: resolved.total,
    isLoading,
    error: error ?? resolved.error,
  };
}

function buildAdSpendUrl(f: AdSpendFilters = {}) {
  const params = new URLSearchParams();
  if (f.startDate) {
    params.set('startDate', f.startDate);
  }
  if (f.endDate) {
    params.set('endDate', f.endDate);
  }
  const qs = params.toString();
  return `/reports/ad-spend${qs ? `?${qs}` : ''}`;
}

/** Use ad spends. */
export function useAdSpends(f: AdSpendFilters = {}) {
  const { data, error, isLoading, mutate } = useSWR<AdSpendReport>(
    buildAdSpendUrl(f),
    swrFetcher,
    opts,
  );
  const resolved = resolveAdSpendReport(data);
  return {
    adSpend: resolved.value,
    isLoading,
    error: error ?? resolved.error,
    mutate,
  };
}

/** Use ad spend mutations. */
export function useAdSpendMutations() {
  const { mutate } = useSWRConfig();

  const registerAdSpend = async (payload: AdSpendEntry) => {
    const res = await apiFetch('/reports/ad-spend', { method: 'POST', body: payload });
    if (res.error) {
      throw new Error(res.error || 'Erro ao registrar ad spend');
    }
    mutate(
      (key: unknown) => typeof key === 'string' && key.startsWith('/reports/ad-spend'),
      undefined,
      { revalidate: true },
    );
    return res.data;
  };

  return { registerAdSpend };
}

/** Use nps. */
export function useNps() {
  const { data, error, isLoading, mutate } = useSWR<NpsData>('/reports/nps', swrFetcher, {
    ...opts,
    refreshInterval: 300_000,
  });
  const resolved = resolveRecordPayload(data, EMPTY_NPS, 'NPS', isNpsPayload);
  return {
    nps: resolved.value,
    isLoading,
    error: error ?? resolved.error,
    mutate,
  };
}

/** Use nps mutations. */
export function useNpsMutations() {
  const { mutate } = useSWRConfig();

  const submitNps = async (score: number, comment?: string, orderId?: string) => {
    const res = await apiFetch('/reports/nps', {
      method: 'POST',
      body: { score, comment, orderId },
    });
    if (res.error) {
      throw new Error(res.error || 'Erro ao registrar NPS');
    }
    mutate('/reports/nps');
    return res.data;
  };

  return { submitNps };
}

