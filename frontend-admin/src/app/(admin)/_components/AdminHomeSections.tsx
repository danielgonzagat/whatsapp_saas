'use client';
import { AdminSectionHeader, AdminSurface } from '@/components/admin/admin-monitor-ui';
import { BreakdownDonut } from '@/components/admin/god-view/breakdown-donut';
import { GmvChart } from '@/components/admin/god-view/gmv-chart';
import type { AdminHomeResponse } from '@/lib/api/admin-dashboard-api';
import type { MarketplaceTreasuryBalance } from '@/lib/api/admin-carteira-api';
import { AdminEmptyState } from './admin-empty-state';
import { HealthMetricCard } from './admin-health-metric-card';
export { AdminProductsSection } from './admin-products-section';
import {
  formatCurrency,
  formatDelta,
  formatInteger,
  formatPercent,
  formatRelativeTime,
  METHOD_LABELS,
} from './admin-formatters';
import { AdminRevenueBars } from './admin-revenue-bars';
import { AdminSparkline } from './admin-sparkline';

export function AdminRevenueSection({
  data,
  todayData,
  currentMonthData,
  previousMonthData,
  balance,
}: {
  data: AdminHomeResponse | undefined;
  todayData: AdminHomeResponse | undefined;
  currentMonthData: AdminHomeResponse | undefined;
  previousMonthData: AdminHomeResponse | undefined;
  balance: MarketplaceTreasuryBalance | undefined;
}) {
  return (
    <AdminSurface className="px-5 py-5 lg:px-6 lg:py-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.9fr)]">
        <div>
          <div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
            Receita total dos seus produtos
          </div>
          <div className="text-[36px] font-bold leading-none tracking-[-0.05em] text-[var(--app-accent)] lg:text-[52px]">
            {formatCurrency(data?.kpis.gmv.value)}
          </div>
          <div className="mt-3 text-[13px] text-[var(--app-text-secondary)]">
            Receita aprovada em{' '}
            <span className="font-semibold text-[var(--app-text-primary)]">
              {data?.range.label || 'Últimos 30 dias'}
            </span>
            .
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {[
            {
              label: 'Total deste mês',
              value: formatCurrency(currentMonthData?.kpis.gmv.value),
              meta: `Mês anterior · ${formatCurrency(previousMonthData?.kpis.gmv.value)}`,
              tone: 'text-[var(--app-accent)]',
            },
            {
              label: 'Vendas de hoje',
              value: formatCurrency(todayData?.kpis.gmv.value),
              meta: `Ontem · ${formatCurrency(todayData?.kpis.gmv.previous)}`,
              tone: 'text-[var(--app-accent)]',
            },
            {
              label: 'Saldo disponível',
              value: formatCurrency(balance?.availableInCents),
              meta: 'Disponível para saque',
              tone: 'text-emerald-600',
            },
            {
              label: 'A receber',
              value: formatCurrency(balance?.pendingInCents),
              meta: 'Receitas em processamento',
              tone: 'text-amber-600',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="min-h-[102px] rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3"
            >
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--app-text-tertiary)]">
                {item.label}
              </div>
              <div className={`text-[18px] font-bold leading-tight ${item.tone}`}>{item.value}</div>
              <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">{item.meta}</div>
            </div>
          ))}
        </div>
      </div>
    </AdminSurface>
  );
}

export function AdminKpiCards({
  data,
  revenueSeries,
  orderSeries,
  conversationsSeries,
  averageTicketSeries,
  totalOrders,
  conversionRate,
}: {
  data: AdminHomeResponse | undefined;
  revenueSeries: number[];
  orderSeries: number[];
  conversationsSeries: number[];
  averageTicketSeries: number[];
  totalOrders: number;
  conversionRate: number;
}) {
  return (
    <div className="grid gap-3 xl:grid-cols-4">
      {[
        {
          label: 'Receita',
          value: formatCurrency(data?.kpis.gmv.value),
          detail: formatDelta(data?.kpis.gmv.deltaPct),
          tone: 'text-[var(--app-accent)]',
          series: revenueSeries,
        },
        {
          label: 'Vendas',
          value: formatInteger(data?.kpis.approvedCount.value),
          detail: `${formatInteger(totalOrders)} pedidos gerados no período`,
          tone: 'text-[var(--app-text-primary)]',
          series: orderSeries,
        },
        {
          label: 'Conversão',
          value: formatPercent(conversionRate),
          detail: 'Taxa de checkout concluído',
          tone: 'text-[var(--app-text-primary)]',
          series: conversationsSeries,
        },
        {
          label: 'Ticket médio',
          value: formatCurrency(data?.kpis.averageTicket.value),
          detail: 'Média por pedido aprovado',
          tone: 'text-[var(--app-text-primary)]',
          series: averageTicketSeries,
        },
      ].map((item) => (
        <AdminSurface key={item.label} className="px-5 py-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                {item.label}
              </div>
              <div className={`text-[28px] font-bold leading-none tracking-[-0.04em] ${item.tone}`}>
                {item.value}
              </div>
            </div>
            <AdminSparkline data={item.series} />
          </div>
          <div className="text-[11px] text-[var(--app-text-secondary)]">{item.detail}</div>
        </AdminSurface>
      ))}
    </div>
  );
}

export function AdminRevenueChartSection({
  data,
  chartLabels,
  revenueSeries,
  previousRevenueSeries,
}: {
  data: AdminHomeResponse | undefined;
  chartLabels: string[];
  revenueSeries: number[];
  previousRevenueSeries: number[];
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.9fr)]">
      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Receita no período"
          description="A barra laranja mostra o período ativo. O apoio mostra a janela anterior."
        />
        <AdminRevenueBars
          labels={chartLabels}
          values={revenueSeries}
          comparison={previousRevenueSeries}
        />
      </AdminSurface>

      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Kloel no período"
          description={data?.range.label || 'Período ativo'}
        />
        <div className="grid grid-cols-2 gap-2">
          {[
            {
              label: 'Conversas',
              value: formatInteger(data?.kpis.conversations.value),
              tone: 'text-[var(--app-accent)]',
            },
            {
              label: 'Pedidos aprovados',
              value: formatInteger(data?.kpis.approvedCount.value),
              tone: 'text-emerald-600',
            },
            {
              label: 'Em atendimento',
              value: formatInteger(data?.kpis.pendingCount.value),
              tone: 'text-amber-600',
            },
            {
              label: 'Tempo de resposta',
              value:
                data?.kpis.responseTimeMinutes.value === null ||
                data?.kpis.responseTimeMinutes.value === undefined
                  ? '—'
                  : `${data.kpis.responseTimeMinutes.value} min`,
              tone: 'text-[var(--app-text-primary)]',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3"
            >
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--app-text-tertiary)]">
                {item.label}
              </div>
              <div className={`text-[24px] font-bold tracking-[-0.04em] ${item.tone}`}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </AdminSurface>
    </div>
  );
}

export function AdminHealthSection({
  operationalScorePct,
  checkoutCompletionPct,
  chargebackRatePct,
}: {
  operationalScorePct: number;
  checkoutCompletionPct: number;
  chargebackRatePct: number;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <HealthMetricCard
        percent={operationalScorePct}
        color="var(--app-success)"
        label="Saúde operacional"
        value={`${formatInteger(operationalScorePct)}%`}
        description="aprovação, catálogo ativo e risco controlado"
      />
      <HealthMetricCard
        percent={checkoutCompletionPct}
        color="var(--app-accent)"
        label="Funil do checkout"
        value={`${formatInteger(checkoutCompletionPct)}%`}
        description="conversão entre pedidos gerados e aprovados"
      />
      <HealthMetricCard
        percent={Math.max(0, 100 - chargebackRatePct * 4)}
        color="var(--app-warning)"
        label="Pressão de risco"
        value={`${formatInteger(chargebackRatePct)}%`}
        description="chargebacks sobre o total observado no período"
      />
    </div>
  );
}

export function AdminBottomCharts({
  data,
  recentNotifications,
}: {
  data: AdminHomeResponse | undefined;
  recentNotifications: Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    createdAt: string;
    read: boolean;
  }>;
}) {
  return (
    <>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.9fr)]">
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="GMV no período"
            description="Volume bruto aprovado em todo o marketplace."
          />
          <div className="h-[320px]">
            <GmvChart data={data?.series.gmvDaily ?? []} />
          </div>
        </AdminSurface>

        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="Eventos recentes"
            description="Alertas e sinais operacionais mais recentes do admin."
          />
          {recentNotifications.length ? (
            <div className="flex flex-col gap-2">
              {recentNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <div className="text-[12px] font-semibold text-[var(--app-text-primary)]">
                      {notification.title}
                    </div>
                    <div className="text-[10px] text-[var(--app-text-tertiary)]">
                      {formatRelativeTime(notification.createdAt)}
                    </div>
                  </div>
                  <div className="text-[11px] leading-5 text-[var(--app-text-secondary)]">
                    {notification.body}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <AdminEmptyState label="Nenhum alerta recente para exibir." />
          )}
        </AdminSurface>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="TPV por gateway"
            description="Distribuição do volume bruto entre as integrações ativas."
          />
          <div className="h-[280px]">
            <BreakdownDonut
              data={
                data?.breakdowns.byGateway.map((row) => ({
                  label: row.gateway,
                  gmvInCents: row.gmvInCents,
                })) ?? []
              }
            />
          </div>
        </AdminSurface>

        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="Métodos de pagamento"
            description="Leitura agregada dos meios de pagamento aprovados no período."
          />
          <div className="h-[280px]">
            <BreakdownDonut
              data={
                data?.breakdowns.byMethod.map((row) => ({
                  label: METHOD_LABELS[row.method] ?? row.method,
                  gmvInCents: row.gmvInCents,
                })) ?? []
              }
            />
          </div>
        </AdminSurface>
      </div>
    </>
  );
}
