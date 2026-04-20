'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { MetricNumber } from '@/components/ui/metric-number';
import {
  AdminMetricGrid,
  AdminPage,
  AdminPageIntro,
  AdminSectionHeader,
  AdminSurface,
} from '@/components/admin/admin-monitor-ui';
import { BreakdownDonut } from '@/components/admin/god-view/breakdown-donut';
import { GmvChart } from '@/components/admin/god-view/gmv-chart';
import { PeriodFilter } from '@/components/admin/god-view/period-filter';
import { adminReportsApi, type AdminReportsOverviewResponse } from '@/lib/api/admin-reports-api';
import type { AdminHomePeriod } from '@/lib/api/admin-dashboard-api';

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return;
  }
  const headers = Object.keys(rows[0]);
  const content = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = String(row[header] ?? '');
          return value.includes(',') || value.includes('"') || value.includes('\n')
            ? `"${value.replace(/"/g, '""')}"`
            : value;
        })
        .join(','),
    ),
  ].join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** Relatorios page. */
export default function RelatoriosPage() {
  const [period, setPeriod] = useState<AdminHomePeriod>('30D');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [exporting, setExporting] = useState(false);

  const { data } = useSWR<AdminReportsOverviewResponse>(
    ['admin/reports/overview', period, customRange.from, customRange.to],
    () =>
      adminReportsApi.overview({
        period,
        from: period === 'CUSTOM' ? customRange.from : undefined,
        to: period === 'CUSTOM' ? customRange.to : undefined,
      }),
  );

  async function exportCsv() {
    setExporting(true);
    try {
      const rows = await adminReportsApi.exportCsvRows({
        period,
        from: period === 'CUSTOM' ? customRange.from : undefined,
        to: period === 'CUSTOM' ? customRange.to : undefined,
      });
      downloadCsv(`kloel-relatorio-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    } finally {
      setExporting(false);
    }
  }

  const snapshot = data?.snapshot;

  return (
    <AdminPage>
      <AdminPageIntro
        eyebrow="LEITURA EXECUTIVA"
        title="Relatórios"
        description="Relatórios pré-construídos com exportação direta e leitura global da plataforma."
        actions={
          <>
            <PeriodFilter
              value={period}
              onChange={setPeriod}
              customRange={customRange}
              onApplyCustomRange={setCustomRange}
            />
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              Exportar PDF
            </Button>
            <Button size="sm" onClick={() => void exportCsv()} disabled={exporting}>
              {exporting ? 'Gerando CSV...' : 'Exportar CSV'}
            </Button>
          </>
        }
      />

      <AdminMetricGrid
        items={[
          {
            label: 'GMV',
            value: snapshot?.kpis.gmv.value ?? null,
            detail: snapshot?.range.label || 'Período ativo',
            tone: 'text-[var(--app-accent)]',
          },
          {
            label: 'Transações aprovadas',
            value: snapshot?.kpis.approvedCount.value ?? null,
            kind: 'integer',
            detail: 'Pedidos aprovados no período',
          },
          {
            label: 'Taxa de aprovação',
            value: snapshot?.kpis.approvalRate.value ?? null,
            kind: 'percentage',
            detail: 'Leitura macro do funil',
          },
          {
            label: 'Ticket médio',
            value: snapshot?.kpis.averageTicket.value ?? null,
            detail: 'Média das vendas aprovadas',
          },
        ]}
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.8fr)]">
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="GMV no período"
            description="Comparativo contínuo do volume bruto aprovado dentro da janela selecionada."
          />
          <div className="h-[320px]">
            <GmvChart data={snapshot?.series.gmvDaily ?? []} />
          </div>
        </AdminSurface>

        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="Métodos de pagamento"
            description="Distribuição do GMV por método no período."
          />
          <div className="h-[320px]">
            <BreakdownDonut
              data={
                snapshot?.breakdowns.byMethod.map((row) => ({
                  label: row.method,
                  gmvInCents: row.gmvInCents,
                })) ?? []
              }
            />
          </div>
        </AdminSurface>
      </div>

      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Resumo do período"
          description="Leitura objetiva para exportação e conferência rápida."
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Reembolsos',
              value: snapshot?.kpis.refundAmount.value ?? null,
              detail: `${snapshot?.kpis.refundCount.value ?? 0} ocorrências`,
            },
            {
              label: 'Chargebacks',
              value: snapshot?.kpis.chargebackAmount.value ?? null,
              detail: `${snapshot?.kpis.chargebackCount.value ?? 0} disputas`,
            },
            {
              label: 'Produtores ativos',
              value: snapshot?.kpis.activeProducers.value ?? null,
              detail: 'Rolling 30 dias',
              kind: 'integer' as const,
            },
            {
              label: 'Novos produtores',
              value: snapshot?.kpis.newProducers.value ?? null,
              detail: 'Aquisição no período',
              kind: 'integer' as const,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-4"
            >
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                {item.label}
              </div>
              <MetricNumber
                value={item.value}
                kind={item.kind || 'currency-brl'}
                className="text-[24px] font-bold tracking-[-0.04em] text-[var(--app-text-primary)]"
              />
              <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">{item.detail}</div>
            </div>
          ))}
        </div>
      </AdminSurface>

      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Histórico de exports"
          description="Rastro operacional das últimas exportações disparadas pelo time."
        />
        <div className="grid gap-2">
          {(data?.exportHistory ?? []).map((item) => (
            <div
              key={item.id}
              className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3"
            >
              <div className="text-[12px] font-semibold text-[var(--app-text-primary)]">
                {item.action}
              </div>
              <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                {item.actorName || 'Sistema'} · {new Date(item.createdAt).toLocaleString('pt-BR')}
              </div>
            </div>
          ))}
        </div>
      </AdminSurface>
    </AdminPage>
  );
}
