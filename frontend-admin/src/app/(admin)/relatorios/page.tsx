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
import {
  adminDashboardApi,
  type AdminHomePeriod,
  type AdminHomeResponse,
} from '@/lib/api/admin-dashboard-api';
import { adminTransactionsApi } from '@/lib/api/admin-transactions-api';

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
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

export default function RelatoriosPage() {
  const [period, setPeriod] = useState<AdminHomePeriod>('30D');
  const [exporting, setExporting] = useState(false);

  const { data } = useSWR<AdminHomeResponse>(['admin/dashboard/home', period], () =>
    adminDashboardApi.home({ period, compare: 'NONE' }),
  );

  async function exportCsv() {
    setExporting(true);
    try {
      const payload = await adminTransactionsApi.list({ take: 200 });
      downloadCsv(
        `kloel-relatorio-${new Date().toISOString().slice(0, 10)}.csv`,
        payload.items.map((item) => ({
          orderNumber: item.orderNumber,
          workspace: item.workspaceName || item.workspaceId,
          customerName: item.customerName,
          customerEmail: item.customerEmail,
          paymentMethod: item.paymentMethod,
          status: item.status,
          gateway: item.gateway || '',
          totalInCents: item.totalInCents,
          totalBRL: (item.totalInCents / 100).toFixed(2),
          paidAt: item.paidAt || '',
        })),
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <AdminPage>
      <AdminPageIntro
        eyebrow="LEITURA EXECUTIVA"
        title="Relatórios"
        description="Relatórios pré-construídos com exportação direta e leitura global da plataforma."
        actions={
          <>
            <PeriodFilter value={period} onChange={setPeriod} />
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
            value: data?.kpis.gmv.value ?? null,
            detail: data?.range.label || 'Período ativo',
            tone: 'text-[var(--app-accent)]',
          },
          {
            label: 'Transações aprovadas',
            value: data?.kpis.approvedCount.value ?? null,
            kind: 'integer',
            detail: 'Pedidos aprovados no período',
          },
          {
            label: 'Taxa de aprovação',
            value: data?.kpis.approvalRate.value ?? null,
            kind: 'percentage',
            detail: 'Leitura macro do funil',
          },
          {
            label: 'Ticket médio',
            value: data?.kpis.averageTicket.value ?? null,
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
            <GmvChart data={data?.series.gmvDaily ?? []} />
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
                data?.breakdowns.byMethod.map((row) => ({
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
              value: data?.kpis.refundAmount.value ?? null,
              detail: `${data?.kpis.refundCount.value ?? 0} ocorrências`,
            },
            {
              label: 'Chargebacks',
              value: data?.kpis.chargebackAmount.value ?? null,
              detail: `${data?.kpis.chargebackCount.value ?? 0} disputas`,
            },
            {
              label: 'Produtores ativos',
              value: data?.kpis.activeProducers.value ?? null,
              detail: 'Rolling 30 dias',
              kind: 'integer' as const,
            },
            {
              label: 'Novos produtores',
              value: data?.kpis.newProducers.value ?? null,
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
    </AdminPage>
  );
}
