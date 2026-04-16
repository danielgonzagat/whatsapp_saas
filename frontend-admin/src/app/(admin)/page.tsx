'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { firstName, resolveGreeting } from '@/components/admin/admin-greeting';
import { BreakdownDonut } from '@/components/admin/god-view/breakdown-donut';
import { GmvChart } from '@/components/admin/god-view/gmv-chart';
import { PeriodFilter } from '@/components/admin/god-view/period-filter';
import {
  AdminHeroSplit,
  AdminMetricGrid,
  AdminPage,
  AdminPageIntro,
  AdminSectionHeader,
  AdminSurface,
} from '@/components/admin/admin-monitor-ui';
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

function unavailable(value?: number | null) {
  return value ?? null;
}

export default function AdminHomePage() {
  const { admin } = useAdminSession();
  const [period, setPeriod] = useState<AdminHomePeriod>('7D');
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

  const { data } = useSWR<AdminHomeResponse>(
    admin ? ['admin/dashboard/home', period] : null,
    () => adminDashboardApi.home({ period, compare: 'PREVIOUS' }),
    { refreshInterval: 60_000, revalidateOnFocus: false },
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
        description="Painel global da plataforma Kloel. Todas as operações em tempo real."
        actions={<PeriodFilter value={period} onChange={setPeriod} />}
      />

      <AdminHeroSplit
        label="GMV total da plataforma"
        value={data?.kpis.gmv.value ?? null}
        description={
          <>
            Volume bruto aprovado em{' '}
            <span className="font-semibold text-[var(--app-text-primary)]">
              {data?.range.label || 'Últimos 7 dias'}
            </span>
            .
          </>
        }
        compactCards={[
          {
            label: 'Revenue Kloel',
            value: null,
            note: 'Dados sendo coletados',
            tone: 'text-[var(--app-accent)]',
          },
          {
            label: 'Transações aprovadas',
            value: data?.kpis.approvedCount.value ?? null,
            kind: 'integer',
            note: `${data?.kpis.pendingCount.value ?? 0} pendentes no período`,
          },
          {
            label: 'Taxa de aprovação',
            value: data?.kpis.approvalRate.value ?? null,
            kind: 'percentage',
            note: `${data?.kpis.declinedCount.value ?? 0} recusadas`,
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
            value: unavailable(data?.kpis.mrrProjected.value),
            detail: 'Dados sendo coletados',
          },
          {
            label: 'Churn de produtores',
            value: unavailable(data?.kpis.churnRate.value),
            kind: 'percentage',
            detail: 'Dados sendo coletados',
          },
          {
            label: 'Saldo reservado',
            value: data?.kpis.chargebackAmount.value ?? null,
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
                value: null,
                detail: 'Dados sendo coletados',
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
                value: null,
                detail: 'Dados sendo coletados',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3"
              >
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--app-text-tertiary)]">
                  {item.label}
                </div>
                <div
                  className={`text-[24px] font-bold tracking-[-0.04em] ${item.tone || 'text-[var(--app-text-primary)]'}`}
                >
                  {item.value === null ? '—' : item.value}
                </div>
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
