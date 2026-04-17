'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { firstName, resolveGreeting } from '@/components/admin/admin-greeting';
import {
  AdminHeroSplit,
  AdminMetricGrid,
  AdminPage,
  AdminPageIntro,
  AdminSectionHeader,
  AdminSurface,
} from '@/components/admin/admin-monitor-ui';
import { BreakdownDonut } from '@/components/admin/god-view/breakdown-donut';
import { GmvChart } from '@/components/admin/god-view/gmv-chart';
import { PeriodFilter } from '@/components/admin/god-view/period-filter';
import { MetricNumber } from '@/components/ui/metric-number';
import { adminCarteiraApi, type PlatformWalletBalance } from '@/lib/api/admin-carteira-api';
import {
  adminDashboardApi,
  type AdminHomePeriod,
  type AdminHomeResponse,
} from '@/lib/api/admin-dashboard-api';
import { useAdminSession } from '@/lib/auth/admin-session-context';

const METHOD_LABELS: Record<string, string> = {
  CREDIT_CARD: 'Cartão',
  PIX: 'PIX',
  BOLETO: 'Boleto',
};

const INTEGER_FORMATTER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const DELTA_FORMATTER = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

function toIsoDateTime(value: Date) {
  return value.toISOString();
}

function formatInteger(value: number) {
  return INTEGER_FORMATTER.format(value);
}

function formatDelta(deltaPct: number | null | undefined) {
  if (deltaPct === null || deltaPct === undefined) return 'Sem comparativo anterior';
  const sign = deltaPct >= 0 ? '+' : '';
  return `${sign}${DELTA_FORMATTER.format(deltaPct)}% vs período anterior`;
}

export default function AdminHomePage() {
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

  const totalOrders =
    (data?.kpis.approvedCount.value ?? 0) +
    (data?.kpis.declinedCount.value ?? 0) +
    (data?.kpis.pendingCount.value ?? 0) +
    (data?.kpis.refundCount.value ?? 0) +
    (data?.kpis.chargebackCount.value ?? 0);
  const conversionRate = totalOrders > 0 ? (data?.kpis.approvedCount.value ?? 0) / totalOrders : 0;

  return (
    <AdminPage>
      <AdminPageIntro
        eyebrow={eyebrow}
        title={
          <>
            {greeting}, <span className="text-[var(--app-accent)]">{displayName}</span>.
          </>
        }
        description="Painel global da plataforma Kloel. Todas as operações em tempo real."
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
            <MetricNumber
              value={data?.kpis.gmv.value ?? null}
              kind="currency-brl"
              className="text-[36px] font-bold leading-none tracking-[-0.05em] text-[var(--app-accent)] lg:text-[52px]"
            />
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
                value: currentMonthData?.kpis.gmv.value ?? null,
                tone: 'text-[var(--app-accent)]',
                metaValue: previousMonthData?.kpis.gmv.value ?? null,
                metaPrefix: 'Mês anterior · ',
              },
              {
                label: 'Vendas de hoje',
                value: todayData?.kpis.gmv.value ?? null,
                tone: 'text-[var(--app-accent)]',
                metaValue: todayData?.kpis.gmv.previous ?? null,
                metaPrefix: 'Ontem · ',
              },
              {
                label: 'Saldo disponível',
                value: balance?.availableInCents ?? null,
                tone: 'text-emerald-600',
                metaText: 'Disponível para saque',
              },
              {
                label: 'A receber',
                value: balance?.pendingInCents ?? null,
                tone: 'text-amber-600',
                metaText: 'Receitas em processamento',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="min-h-[102px] rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3"
              >
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--app-text-tertiary)]">
                  {item.label}
                </div>
                <MetricNumber
                  value={item.value}
                  kind="currency-brl"
                  className={`text-[18px] font-bold leading-tight ${item.tone}`}
                />
                <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                  {item.metaText ? (
                    item.metaText
                  ) : (
                    <>
                      {item.metaPrefix}
                      <MetricNumber
                        value={item.metaValue}
                        kind="currency-brl"
                        className="inline text-[11px] font-medium text-[var(--app-text-secondary)]"
                      />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </AdminSurface>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Receita',
            value: data?.kpis.gmv.value ?? null,
            kind: 'currency-brl' as const,
            detail: formatDelta(data?.kpis.gmv.deltaPct),
            tone: 'text-[var(--app-accent)]',
          },
          {
            label: 'Vendas',
            value: data?.kpis.approvedCount.value ?? null,
            kind: 'integer' as const,
            detail: `${formatInteger(totalOrders)} pedidos gerados no período`,
            tone: 'text-[var(--app-text-primary)]',
          },
          {
            label: 'Conversão',
            value: conversionRate,
            kind: 'percentage' as const,
            detail: 'Taxa de checkout concluído',
            tone: 'text-[var(--app-text-primary)]',
          },
          {
            label: 'Ticket médio',
            value: data?.kpis.averageTicket.value ?? null,
            kind: 'currency-brl' as const,
            detail: 'Média por pedido aprovado',
            tone: 'text-[var(--app-text-primary)]',
          },
        ].map((item) => (
          <AdminSurface key={item.label} className="px-5 py-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                  {item.label}
                </div>
                <MetricNumber
                  value={item.value}
                  kind={item.kind}
                  className={`text-[28px] font-bold leading-none tracking-[-0.04em] ${item.tone}`}
                />
              </div>
            </div>
            <div className="text-[11px] text-[var(--app-text-secondary)]">{item.detail}</div>
          </AdminSurface>
        ))}
      </div>

      <AdminHeroSplit
        label="Revenue Kloel"
        value={data?.kpis.revenueKloel.value ?? null}
        description={
          <>
            Receita própria da plataforma em{' '}
            <span className="font-semibold text-[var(--app-text-primary)]">
              {data?.range.label || 'Últimos 30 dias'}
            </span>
            . GMV permanece em novo lugar, sem disputar o foco do caixa Kloel.
          </>
        }
        compactCards={[
          {
            label: 'GMV total da plataforma',
            value: data?.kpis.gmv.value ?? null,
            note: 'Volume bruto aprovado no período',
            tone: 'text-[var(--app-accent)]',
          },
          {
            label: 'Transações aprovadas',
            value: data?.kpis.approvedCount.value ?? null,
            kind: 'integer',
            note: `${data?.kpis.pendingCount.value ?? 0} pendentes no período`,
          },
          {
            label: 'Taxa da Kloel',
            value: data?.kpis.revenueKloelRate.value ?? null,
            kind: 'percentage',
            note: 'Receita Kloel sobre o GMV aprovado',
          },
          {
            label: 'Ticket médio',
            value: data?.kpis.averageTicket.value ?? null,
            note: 'Média das vendas aprovadas',
          },
        ]}
      />

      <AdminMetricGrid
        items={[
          {
            label: 'Reembolsos',
            value: data?.kpis.refundAmount.value ?? null,
            detail: `${data?.kpis.refundCount.value ?? 0} ocorrências no período`,
          },
          {
            label: 'Chargebacks',
            value: data?.kpis.chargebackAmount.value ?? null,
            detail: `${data?.kpis.chargebackCount.value ?? 0} disputas em aberto`,
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
          {
            label: 'Saldo reservado',
            value: balance?.reservedInCents ?? null,
            detail: 'Reserva operacional para risco',
          },
          {
            label: 'Pendências',
            value: data?.kpis.pendingCount.value ?? null,
            kind: 'integer',
            detail: 'Transações aguardando definição',
          },
        ]}
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.9fr)]">
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="GMV no período"
            description="A barra principal mostra o período ativo. Use os filtros para trocar a janela de análise."
          />
          <div className="h-[320px]">
            <GmvChart data={data?.series.gmvDaily ?? []} />
          </div>
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
                value: data?.kpis.conversations.value ?? null,
                detail: 'Conversas tocadas no período',
                tone: 'text-[var(--app-accent)]',
              },
              {
                label: 'Pedidos aprovados',
                value: data?.kpis.approvedCount.value ?? null,
                detail: 'Transações aprovadas',
                tone: 'text-emerald-600',
              },
              {
                label: 'Em atendimento',
                value: data?.kpis.pendingCount.value ?? null,
                detail: 'Pendentes de conclusão',
                tone: 'text-amber-600',
              },
              {
                label: 'Tempo de resposta',
                value: data?.kpis.responseTimeMinutes.value ?? null,
                detail: 'Média entre inbound e primeiro outbound',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3"
              >
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--app-text-tertiary)]">
                  {item.label}
                </div>
                {item.label === 'Tempo de resposta' ? (
                  <div
                    className={`text-[24px] font-bold tracking-[-0.04em] ${item.tone || 'text-[var(--app-text-primary)]'}`}
                  >
                    {item.value === null ? '—' : `${item.value} min`}
                  </div>
                ) : (
                  <MetricNumber
                    value={item.value}
                    kind="integer"
                    className={`text-[24px] font-bold tracking-[-0.04em] ${item.tone || 'text-[var(--app-text-primary)]'}`}
                  />
                )}
                <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                  {item.detail}
                </div>
              </div>
            ))}
          </div>
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
