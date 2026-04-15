'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricNumber } from '@/components/ui/metric-number';
import { StatCard } from '@/components/ui/stat-card';
import { PeriodFilter } from '@/components/admin/god-view/period-filter';
import {
  adminDashboardApi,
  type AdminHomePeriod,
  type AdminHomeResponse,
} from '@/lib/api/admin-dashboard-api';
import { adminTransactionsApi } from '@/lib/api/admin-transactions-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';

const CSV_SEPARATOR = ',';

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(CSV_SEPARATOR) || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(CSV_SEPARATOR),
    ...rows.map((row) => headers.map((h) => escapeCsvField(row[h])).join(CSV_SEPARATOR)),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function RelatoriosPage() {
  const [period, setPeriod] = useState<AdminHomePeriod>('30D');
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data } = useSWR<AdminHomeResponse>(['admin/dashboard/home', period], () =>
    adminDashboardApi.home({ period, compare: 'NONE' }),
  );

  async function exportTransactions(status?: string) {
    setExportError(null);
    setExportBusy(status ?? 'all');
    try {
      // Pull up to 200 rows (backend hard cap). For the full export we'd
      // need pagination with a streaming CSV writer — SP-10 complete.
      const result = await adminTransactionsApi.list({
        status: status as 'PAID' | 'REFUNDED' | 'CHARGEBACK' | undefined,
        take: 200,
      });
      const rows = result.items.map((i) => ({
        orderNumber: i.orderNumber,
        workspaceName: i.workspaceName ?? i.workspaceId,
        customerName: i.customerName,
        customerEmail: i.customerEmail,
        paymentMethod: i.paymentMethod,
        gateway: i.gateway ?? '',
        status: i.status,
        totalInCents: i.totalInCents,
        totalBRL: (i.totalInCents / 100).toFixed(2),
        installments: i.installments,
        createdAt: i.createdAt,
        paidAt: i.paidAt ?? '',
      }));
      const stamp = new Date().toISOString().slice(0, 10);
      const suffix = status ? `_${status.toLowerCase()}` : '';
      downloadCsv(`kloel_vendas_${stamp}${suffix}.csv`, rows);
    } catch (err) {
      setExportError(
        err instanceof AdminApiClientError ? err.message : 'Erro inesperado ao gerar o export.',
      );
    } finally {
      setExportBusy(null);
    }
  }

  return (
    <section className="flex flex-1 flex-col gap-6 px-6 py-8 pb-24">
      <header className="flex flex-col gap-2">
        <Badge variant="ember" className="w-fit">
          SP-10
        </Badge>
        <h1 className="text-2xl font-semibold">Relatórios</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Relatórios pré-construídos com base no período. Custom report builder e agendamento chegam
          em SP-10 completo.
        </p>
      </header>

      <div className="flex items-center gap-3">
        <PeriodFilter value={period} onChange={setPeriod} />
        {data ? (
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {data.range.label}
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="GMV" value={data?.kpis.gmv.value ?? null} kind="currency-brl" />
        <StatCard
          label="Transações aprovadas"
          value={data?.kpis.approvedCount.value ?? null}
          kind="integer"
        />
        <StatCard
          label="Taxa de aprovação"
          value={data?.kpis.approvalRate.value ?? null}
          kind="percentage"
        />
        <StatCard
          label="Ticket médio"
          value={data?.kpis.averageTicket.value ?? null}
          kind="currency-brl"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Exports CSV</CardTitle>
          <CardDescription>
            Exporta até 200 linhas por clique. O builder completo com paginação em streaming chega
            em SP-10 completo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => exportTransactions()} disabled={exportBusy !== null}>
              {exportBusy === 'all' ? 'Gerando…' : 'Todas as transações (.csv)'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportTransactions('PAID')}
              disabled={exportBusy !== null}
            >
              {exportBusy === 'PAID' ? 'Gerando…' : 'Aprovadas'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportTransactions('REFUNDED')}
              disabled={exportBusy !== null}
            >
              {exportBusy === 'REFUNDED' ? 'Gerando…' : 'Reembolsadas'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportTransactions('CHARGEBACK')}
              disabled={exportBusy !== null}
            >
              {exportBusy === 'CHARGEBACK' ? 'Gerando…' : 'Chargebacks'}
            </Button>
          </div>
          {exportError ? <p className="text-xs text-red-400">{exportError}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Breakdown por método</CardTitle>
          <CardDescription>
            Distribuição do GMV por PIX / cartão / boleto no período selecionado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data ? (
            <p className="text-xs text-muted-foreground">Carregando…</p>
          ) : data.breakdowns.byMethod.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem vendas no período.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.breakdowns.byMethod.map((row) => (
                <li key={row.method} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-foreground">{row.method}</span>
                  <MetricNumber value={row.gmvInCents} kind="currency-brl" />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
