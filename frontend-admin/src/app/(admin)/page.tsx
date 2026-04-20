'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { firstName, resolveGreeting } from '@/components/admin/admin-greeting';
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
import { adminCarteiraApi, type PlatformWalletBalance } from '@/lib/api/admin-carteira-api';
import {
  adminDashboardApi,
  type AdminHomePeriod,
  type AdminHomeResponse,
} from '@/lib/api/admin-dashboard-api';
import { adminNotificationsApi } from '@/lib/api/admin-notifications-api';
import { adminProductsApi } from '@/lib/api/admin-products-api';
import { adminSupportApi } from '@/lib/api/admin-support-api';
import { useAdminSession } from '@/lib/auth/admin-session-context';

const METHOD_LABELS: Record<string, string> = {
  CREDIT_CARD: 'Cartão',
  PIX: 'PIX',
  BOLETO: 'Boleto',
};

const INTEGER_FORMATTER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
});
const PERCENT_FORMATTER = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

function toIsoDateTime(value: Date) {
  return value.toISOString();
}

function formatInteger(value: number | null | undefined) {
  return INTEGER_FORMATTER.format(Number(value || 0));
}

function formatCurrency(value: number | null | undefined) {
  return CURRENCY_FORMATTER.format((Number(value || 0) || 0) / 100);
}

function formatPercent(value: number | null | undefined) {
  return `${PERCENT_FORMATTER.format((Number(value || 0) || 0) * 100)}%`;
}

function formatDelta(deltaPct: number | null | undefined) {
  if (deltaPct === null || deltaPct === undefined) {
    return 'Sem comparativo anterior';
  }
  const sign = deltaPct >= 0 ? '+' : '';
  return `${sign}${PERCENT_FORMATTER.format(deltaPct)}% vs período anterior`;
}

function formatRelativeTime(value?: string | null) {
  if (!value) {
    return 'Agora';
  }

  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return 'Agora';
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return 'Agora';
  }
  if (minutes < 60) {
    return `há ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `há ${hours} h`;
  }

  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}

function Sparkline({
  data,
  color = 'var(--app-accent)',
  width = 84,
  height = 30,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const points = useMemo(() => {
    if (!data.length) {
      return '';
    }
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    return data
      .map((value, index) => {
        const x = data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
        const y = height - ((value - min) / range) * (height - 6) - 3;
        return `${x},${y}`;
      })
      .join(' ');
  }, [data, height, width]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RevenueBars({
  labels,
  values,
  comparison,
}: {
  labels: string[];
  values: number[];
  comparison: number[];
}) {
  const maxValue = Math.max(1, ...values, ...comparison);

  return (
    <div className="grid h-[196px] grid-cols-7 items-end gap-2 md:gap-3">
      {labels.map((label, index) => {
        const current = values[index] || 0;
        const previous = comparison[index] || 0;
        const currentHeight = Math.max(6, Math.round((current / maxValue) * 162));
        const previousHeight = Math.max(4, Math.round((previous / maxValue) * 162));

        return (
          <div
            key={`${label}-${index}`}
            className="flex min-w-0 flex-col items-center justify-end gap-1.5"
          >
            <div className="flex h-[168px] w-full items-end justify-center gap-1">
              <div
                className="w-1.5 rounded-t-[3px] bg-[var(--app-accent-medium)]"
                style={{ height: previousHeight }}
              />
              <div
                className="w-2 rounded-t-[3px] bg-[var(--app-accent)]"
                style={{ height: currentHeight }}
              />
            </div>
            <span className="font-mono text-[10px] text-[var(--app-text-tertiary)]">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function RingMeter({
  percent,
  color,
  size = 48,
}: {
  percent: number;
  color: string;
  size?: number;
}) {
  const stroke = 3;
  const radius = size / 2 - (stroke / 2 + 1);
  const circumference = 2 * Math.PI * radius;
  const normalized = Math.max(0, Math.min(100, Number(percent || 0)));
  const dashoffset = circumference - (normalized / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      style={{ transform: 'rotate(-90deg)', display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--app-border-primary)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={dashoffset}
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatusChip({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const config =
    normalized === 'OPEN'
      ? {
          border: 'border-amber-500/20',
          bg: 'bg-amber-500/10',
          text: 'text-amber-600',
          label: 'Aberto',
        }
      : normalized === 'PENDING'
        ? {
            border: 'border-[var(--app-accent-medium)]',
            bg: 'bg-[var(--app-accent-light)]',
            text: 'text-[var(--app-accent)]',
            label: 'Pendente',
          }
        : normalized === 'RESOLVED'
          ? {
              border: 'border-emerald-500/20',
              bg: 'bg-emerald-500/10',
              text: 'text-emerald-600',
              label: 'Resolvido',
            }
          : {
              border: 'border-[var(--app-border-primary)]',
              bg: 'bg-[var(--app-bg-secondary)]',
              text: 'text-[var(--app-text-secondary)]',
              label: status,
            };

  return (
    <span
      className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold ${config.border} ${config.bg} ${config.text}`}
    >
      {config.label}
    </span>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-5 text-[12px] text-[var(--app-text-secondary)]">
      {label}
    </div>
  );
}

/** Admin home page. */
export default function AdminHomePage() {
  const router = useRouter();
  const { admin } = useAdminSession();
  const [period, setPeriod] = useState<AdminHomePeriod>('30D');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const referenceDate = useMemo(() => new Date(), []);
  const greeting = resolveGreeting(referenceDate.getHours());
  const displayName = firstName(admin?.name || 'Daniel');
  const eyebrow = referenceDate
    .toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
    .toUpperCase();

  const currentMonthRange = useMemo(() => {
    const from = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 0, 0, 0, 0);
    const to = new Date(referenceDate);
    return { from: toIsoDateTime(from), to: toIsoDateTime(to) };
  }, [referenceDate]);

  const previousMonthRange = useMemo(() => {
    const from = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1, 0, 0, 0, 0);
    const to = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0, 23, 59, 59, 999);
    return { from: toIsoDateTime(from), to: toIsoDateTime(to) };
  }, [referenceDate]);

  const { data } = useSWR<AdminHomeResponse>(
    admin ? ['admin/dashboard/home', period, customRange.from, customRange.to] : null,
    () =>
      adminDashboardApi.home({
        period,
        compare: 'PREVIOUS',
        from: period === 'CUSTOM' ? customRange.from : undefined,
        to: period === 'CUSTOM' ? customRange.to : undefined,
      }),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const { data: todayData } = useSWR<AdminHomeResponse>(
    admin ? ['admin/dashboard/home', 'TODAY'] : null,
    () => adminDashboardApi.home({ period: 'TODAY', compare: 'PREVIOUS' }),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const { data: currentMonthData } = useSWR<AdminHomeResponse>(
    admin
      ? ['admin/dashboard/home', 'CURRENT_MONTH', currentMonthRange.from, currentMonthRange.to]
      : null,
    () =>
      adminDashboardApi.home({
        period: 'CUSTOM',
        compare: 'NONE',
        from: currentMonthRange.from,
        to: currentMonthRange.to,
      }),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const { data: previousMonthData } = useSWR<AdminHomeResponse>(
    admin
      ? ['admin/dashboard/home', 'PREVIOUS_MONTH', previousMonthRange.from, previousMonthRange.to]
      : null,
    () =>
      adminDashboardApi.home({
        period: 'CUSTOM',
        compare: 'NONE',
        from: previousMonthRange.from,
        to: previousMonthRange.to,
      }),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const { data: balance } = useSWR<PlatformWalletBalance>(
    admin ? ['admin/carteira/balance', 'BRL'] : null,
    () => adminCarteiraApi.balance('BRL'),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const { data: productsData } = useSWR(
    admin ? ['admin/products', 'home-top'] : null,
    () => adminProductsApi.list({ take: 5 }),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const { data: supportData } = useSWR(
    admin ? ['admin/support/overview', 'home'] : null,
    () => adminSupportApi.overview(),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const { data: notificationsData } = useSWR(
    admin ? ['admin/notifications', 'home'] : null,
    () => adminNotificationsApi.list(),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const totalOrders =
    (data?.kpis.approvedCount.value ?? 0) +
    (data?.kpis.declinedCount.value ?? 0) +
    (data?.kpis.pendingCount.value ?? 0) +
    (data?.kpis.refundCount.value ?? 0) +
    (data?.kpis.chargebackCount.value ?? 0);
  const conversionRate = totalOrders > 0 ? (data?.kpis.approvedCount.value ?? 0) / totalOrders : 0;

  const topProducts = useMemo(
    () =>
      [...(productsData?.items || [])]
        .sort((left, right) => right.commerce.last30dGmvInCents - left.commerce.last30dGmvInCents)
        .slice(0, 5),
    [productsData?.items],
  );

  const recentConversations = useMemo(
    () =>
      [...(supportData?.items || [])]
        .sort(
          (left, right) =>
            new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime(),
        )
        .slice(0, 5),
    [supportData?.items],
  );

  const recentNotifications = useMemo(
    () => (notificationsData?.items || []).slice(0, 6),
    [notificationsData?.items],
  );

  const chartLabels = useMemo(
    () =>
      (data?.series.gmvDaily || []).map((point) =>
        new Date(point.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      ),
    [data?.series.gmvDaily],
  );
  const revenueSeries = useMemo(
    () => (data?.series.gmvDaily || []).map((point) => point.gmvInCents),
    [data?.series.gmvDaily],
  );
  const previousRevenueSeries = useMemo(
    () => (data?.series.previousGmvDaily || []).map((point) => point.gmvInCents),
    [data?.series.previousGmvDaily],
  );
  const orderSeries = useMemo(
    () => (data?.series.gmvDaily || []).map((point) => point.count),
    [data?.series.gmvDaily],
  );
  const conversationsSeries = useMemo(
    () => (data?.series.revenueKloelDaily || []).map((point) => point.count),
    [data?.series.revenueKloelDaily],
  );
  const averageTicketSeries = useMemo(
    () =>
      (data?.series.gmvDaily || []).map((point) =>
        point.count > 0 ? Math.round(point.gmvInCents / point.count) : 0,
      ),
    [data?.series.gmvDaily],
  );

  const activeProducts = topProducts.filter((item) => item.active).length;
  const chargebackRatePct =
    totalOrders > 0 ? ((data?.kpis.chargebackCount.value ?? 0) / totalOrders) * 100 : 0;
  const catalogActivationPct =
    topProducts.length > 0 ? (activeProducts / topProducts.length) * 100 : 0;
  const checkoutCompletionPct = conversionRate * 100;
  const operationalScorePct = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (checkoutCompletionPct + catalogActivationPct + Math.max(0, 100 - chargebackRatePct * 4)) /
          3,
      ),
    ),
  );

  return (
    <AdminPage>
      <AdminPageIntro
        eyebrow={eyebrow}
        title={
          <>
            {greeting}, <span className="text-[var(--app-accent)]">{displayName}</span>.
          </>
        }
        description="Operação, receita e conversas em um único plano de controle global."
        actions={
          <PeriodFilter
            value={period}
            onChange={setPeriod}
            customRange={customRange}
            onApplyCustomRange={setCustomRange}
          />
        }
      />

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
                <div
                  className={`text-[28px] font-bold leading-none tracking-[-0.04em] ${item.tone}`}
                >
                  {item.value}
                </div>
              </div>
              <Sparkline data={item.series} />
            </div>
            <div className="text-[11px] text-[var(--app-text-secondary)]">{item.detail}</div>
          </AdminSurface>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.9fr)]">
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="Receita no período"
            description="A barra laranja mostra o período ativo. O apoio mostra a janela anterior."
          />
          <RevenueBars
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
            <EmptyState label="Nenhum produto com receita para exibir." />
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
                    <StatusChip status={conversation.status} />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState label="Nenhuma conversa recente para exibir." />
          )}
        </AdminSurface>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <AdminSurface className="px-5 py-5 lg:px-6">
          <div className="flex items-center gap-4">
            <RingMeter percent={operationalScorePct} color="var(--app-success)" />
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
            <RingMeter percent={checkoutCompletionPct} color="var(--app-accent)" />
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
            <RingMeter
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

      <AdminMetricGrid
        items={[
          {
            label: 'Revenue Kloel',
            value: data?.kpis.revenueKloel.value ?? null,
            detail: 'Receita própria da plataforma',
          },
          {
            label: 'Taxa da Kloel',
            value: data?.kpis.revenueKloelRate.value ?? null,
            kind: 'percentage',
            detail: 'Receita Kloel sobre o GMV aprovado',
          },
          {
            label: 'Reembolsos',
            value: data?.kpis.refundAmount.value ?? null,
            detail: `${data?.kpis.refundCount.value ?? 0} ocorrências no período`,
          },
          {
            label: 'Chargebacks',
            value: data?.kpis.chargebackAmount.value ?? null,
            detail: `${data?.kpis.chargebackCount.value ?? 0} disputas registradas`,
          },
          {
            label: 'Produtores ativos',
            value: data?.kpis.activeProducers.value ?? null,
            kind: 'integer',
            detail: 'Janela móvel de 30 dias',
          },
          {
            label: 'Novos produtores',
            value: data?.kpis.newProducers.value ?? null,
            kind: 'integer',
            detail: `${data?.kpis.totalProducers.value ?? 0} no total da plataforma`,
          },
          {
            label: 'MRR projetado',
            value: data?.kpis.mrrProjected.value ?? null,
            detail: 'Receita recorrente mensal estimada',
          },
          {
            label: 'Churn recorrente',
            value: data?.kpis.churnRate.value ?? null,
            kind: 'percentage',
            detail: 'Cancelamentos sobre a base recorrente',
          },
        ]}
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.9fr)]">
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="GMV no período"
            description="Volume bruto aprovado em toda a plataforma."
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
            <EmptyState label="Nenhum alerta recente para exibir." />
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
    </AdminPage>
  );
}
