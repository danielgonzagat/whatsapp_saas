'use client';

import { useRouter } from 'next/navigation';
import { AdminSectionHeader, AdminSurface } from '@/components/admin/admin-monitor-ui';
import { BreakdownDonut } from '@/components/admin/god-view/breakdown-donut';
import { GmvChart } from '@/components/admin/god-view/gmv-chart';
import type { AdminHomeResponse } from '@/lib/api/admin-dashboard-api';
import type { AdminProductRow } from '@/lib/api/admin-products-api';
import type { AdminSupportOverviewItem } from '@/lib/api/admin-support-api';
import type { MarketplaceTreasuryBalance } from '@/lib/api/admin-carteira-api';
import { AdminEmptyState } from './admin-empty-state';
import {
  formatCurrency,
  formatDelta,
  formatInteger,
  formatPercent,
  formatRelativeTime,
  METHOD_LABELS,
} from './admin-formatters';
import { AdminRevenueBars } from './admin-revenue-bars';
import { AdminRingMeter } from './admin-ring-meter';
import { AdminSparkline } from './admin-sparkline';
import { AdminStatusChip } from './admin-status-chip';

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
              <div className={`text-[18px] font-bold leading-tight ${item.tone}`}>
                {item.value}
              </div>
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

export function AdminProductsSection({
  data,
  topProducts,
  recentConversations,
}: {
  data: AdminHomeResponse | undefined;
  topProducts: AdminProductRow[];
  recentConversations: AdminSupportOverviewItem[];
}) {
  const router = useRouter();

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <AdminSurface className="px-5 py-5 lg:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
              Produtos
            </div>
            <div className="text-[13px] text-[var(--app-text-secondary)]">
              Produtos que mais movimentaram o catálogo em{' '}
              {data?.range.label?.toLowerCase() || '30 dias'}.
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/produtos')}
            className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--app-border-primary)] px-3 text-[12px] font-semibold text-[var(--app-text-secondary)] transition hover:text-[var(--app-text-primary)]"
          >
            Ver todos
          </button>
        </div>

        {topProducts.length ? (
          <div className="flex flex-col gap-2">
            {topProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => router.push(`/produtos/${product.id}`)}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3 text-left transition hover:border-[var(--app-accent-medium)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-elevated)] text-[var(--app-accent)]">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-semibold">
                        {product.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-bold text-[var(--app-text-primary)]">
                      {product.name}
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                      {`${product.category || 'Produto'} · ${product.workspaceName || product.workspaceId}`}{' '}
                      · {formatInteger(product.commerce.approvedOrders)} vendas
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-[14px] font-bold text-[var(--app-text-primary)]">
                    {formatCurrency(product.commerce.last30dGmvInCents)}
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--app-text-tertiary)]">gmv 30d</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <AdminEmptyState label="Nenhum produto com receita para exibir." />
        )}
      </AdminSurface>

      <AdminSurface className="px-5 py-5 lg:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
              Conversas recentes
            </div>
            <div className="text-[13px] text-[var(--app-text-secondary)]">
              Fila mais recente de suporte com leitura rápida de status.
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/contas')}
            className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--app-border-primary)] px-3 text-[12px] font-semibold text-[var(--app-text-secondary)] transition hover:text-[var(--app-text-primary)]"
          >
            Abrir fila
          </button>
        </div>

        {recentConversations.length ? (
          <div className="flex flex-col gap-2">
            {recentConversations.map((conversation) => (
              <button
                key={conversation.conversationId}
                type="button"
                onClick={() => router.push(`/contas/suporte/${conversation.conversationId}`)}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3 text-left transition hover:border-[var(--app-accent-medium)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[var(--app-border-primary)] bg-[var(--app-bg-elevated)] text-[12px] font-bold text-[var(--app-accent)]">
                    {(conversation.contactName || conversation.workspaceName || 'K')
                      .split(' ')
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-bold text-[var(--app-text-primary)]">
                      {conversation.contactName || conversation.workspaceName}
                    </div>
                    <div className="mt-1 truncate text-[11px] text-[var(--app-text-secondary)]">
                      {conversation.workspaceName} · {conversation.channel}
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="mb-1 text-[10px] text-[var(--app-text-tertiary)]">
                    {formatRelativeTime(conversation.lastMessageAt)}
                  </div>
                  <AdminStatusChip status={conversation.status} />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <AdminEmptyState label="Nenhuma conversa recente para exibir." />
        )}
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
      <AdminSurface className="px-5 py-5 lg:px-6">
        <div className="flex items-center gap-4">
          <AdminRingMeter percent={operationalScorePct} color="var(--app-success)" />
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
              Saúde operacional
            </div>
            <div className="text-[22px] font-bold text-[var(--app-text-primary)]">
              {formatInteger(operationalScorePct)}%
            </div>
            <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
              aprovação, catálogo ativo e risco controlado
            </div>
          </div>
        </div>
      </AdminSurface>

      <AdminSurface className="px-5 py-5 lg:px-6">
        <div className="flex items-center gap-4">
          <AdminRingMeter percent={checkoutCompletionPct} color="var(--app-accent)" />
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
              Funil do checkout
            </div>
            <div className="text-[22px] font-bold text-[var(--app-text-primary)]">
              {formatInteger(checkoutCompletionPct)}%
            </div>
            <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
              conversão entre pedidos gerados e aprovados
            </div>
          </div>
        </div>
      </AdminSurface>

      <AdminSurface className="px-5 py-5 lg:px-6">
        <div className="flex items-center gap-4">
          <AdminRingMeter
            percent={Math.max(0, 100 - chargebackRatePct * 4)}
            color="var(--app-warning)"
          />
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
              Pressão de risco
            </div>
            <div className="text-[22px] font-bold text-[var(--app-text-primary)]">
              {formatInteger(chargebackRatePct)}%
            </div>
            <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
              chargebacks sobre o total observado no período
            </div>
          </div>
        </div>
      </AdminSurface>
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
