'use client';

import { kloelT } from '@/lib/i18n/t';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { swrFetcher } from '@/lib/fetcher';
import { V } from './analytics.design-tokens';
import { ICONS } from './shared/Icons';
import { Button } from './shared/Components';
import { chartCardStyle } from './analytics.design-tokens';
import { buildUrl, resolveExportEndpoint } from './analytics.helpers';
import type { ReportFilters, SetPage, ReportRow } from './analytics.types';

const PATTERN_RE = /"/g;
const REPORT_CARDS = Object.freeze([
  { key: 'vendas', label: 'Vendas', desc: 'Resumo completo de pedidos e receita do periodo.' },
  { key: 'assinaturas', label: 'Assinaturas', desc: 'Base recorrente, status e proximas cobrancas.' },
  { key: 'abandonos', label: 'Abandonos', desc: 'Checkouts nao concluidos e valor perdido.' },
  { key: 'chargeback', label: 'Chargebacks', desc: 'Disputas, valores e historico de perda/ganho.' },
  { key: 'engajamento', label: 'Engajamento', desc: 'Mensagens, contatos e performance operacional.' },
  { key: 'satisfacao', label: 'Satisfacao', desc: 'NPS, comentarios e visao de experiencia do cliente.' },
] as const);

export function useExportReport(filters: ReportFilters) {
  const exportReport = useCallback(
    (tabKey: string, fileLabel?: string) => {
      const ep = resolveExportEndpoint(tabKey);
      if (!ep) {return;}
      const url = buildUrl(ep, { ...filters, perPage: 1000 });
      swrFetcher(url)
        .then((data: unknown) => {
          const raw = data as Record<string, unknown>;
          let rows: ReportRow[];
          if (Array.isArray(data)) {
            rows = data as ReportRow[];
          } else if (ep === 'nps') {
            rows = (raw.responses as ReportRow[]) || [];
          } else {
            rows = (raw.data as ReportRow[]) || [];
          }
          if (rows.length === 0) {return;}
          const headers = Object.keys(rows[0]);
          const csv = [
            headers.join(','),
            ...rows.map((row) =>
              headers
                .map((h) => {
                  const val = row[h];
                  if (val === null || val === undefined) {return '';}
                  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
                  return str.includes(',') || str.includes('"') ? `"${str.replace(PATTERN_RE, '""')}"` : str;
                })
                .join(','),
            ),
          ].join('\n');
          const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
          const csvUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = csvUrl;
          a.download = `kloel-${fileLabel || tabKey}-${new Date().toISOString().slice(0, 10)}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(csvUrl);
        })
        .catch(() => console.error('Export failed'));
    },
    [filters],
  );
  return exportReport;
}

interface AnalyticsExportPanelProps {
  setPage: SetPage;
  setActive: React.Dispatch<React.SetStateAction<string>>;
}

export function AnalyticsExportPanel({ setPage, setActive }: AnalyticsExportPanelProps) {
  const router = useRouter();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
      {REPORT_CARDS.map((report) => (
        <div key={report.key} style={{ ...chartCardStyle, padding: 20 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: V.t, display: 'block', marginBottom: 8 }}>{report.label}</span>
          <span style={{ fontSize: 12, color: V.t2, display: 'block', lineHeight: 1.6, minHeight: 56 }}>{report.desc}</span>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button onClick={() => {
              setActive(report.key);
              setPage(1);
              router.replace(`/analytics?tab=${report.key}`);
            }}>
              {ICONS.eye(14)} {kloelT(`Abrir`)}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
