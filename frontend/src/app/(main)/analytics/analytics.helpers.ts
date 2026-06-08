import type { ReportFilters } from './analytics.types';

type ReportDateRange = Required<Pick<ReportFilters, 'startDate' | 'endDate'>>;

const REPORT_RANGE_DAYS = 30;

export function createDefaultReportFilters(referenceDate = new Date()): ReportDateRange {
  const endDate = referenceDate.toISOString().slice(0, 10);
  const startDate = new Date(referenceDate.getTime() - REPORT_RANGE_DAYS * 86400000)
    .toISOString()
    .slice(0, 10);
  return { startDate, endDate };
}

export function clearReportAdvancedFilters(filters: ReportFilters): ReportDateRange {
  const fallback = createDefaultReportFilters();
  return {
    startDate: filters.startDate || fallback.startDate,
    endDate: filters.endDate || fallback.endDate,
  };
}

export function buildUrl(ep: string, f: ReportFilters = {}) {
  const p = new URLSearchParams();
  (Object.entries(f) as Array<[string, string | number | undefined | null]>).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      p.set(k, String(v));
    }
  });
  const qs = p.toString();
  return `/reports/${ep}${qs ? `?${qs}` : ''}`;
}

const EXPORT_ENDPOINT_MAP: Record<string, string | null> = {
  vendas: 'vendas',
  afterpay: 'afterpay',
  churn: 'churn',
  abandonos: 'abandonos',
  satisfacao: 'nps',
  afiliados: 'afiliados',
  indicadores: 'indicadores',
  assinaturas: 'assinaturas',
  ind_prod: 'indicadores-produto',
  recusa: 'recusa',
  origem: 'origem',
  metricas: 'metricas',
  estornos: 'estornos',
  chargeback: 'chargeback',
  engajamento: 'engajamento',
  envio: null,
  exportacoes: null,
};

export function resolveExportEndpoint(tabKey: string): string | null {
  return EXPORT_ENDPOINT_MAP[tabKey] ?? null;
}
