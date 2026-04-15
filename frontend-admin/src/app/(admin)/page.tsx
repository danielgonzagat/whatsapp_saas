'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { firstName, resolveGreeting } from '@/components/admin/admin-greeting';
import { BreakdownDonut } from '@/components/admin/god-view/breakdown-donut';
import { GmvChart } from '@/components/admin/god-view/gmv-chart';
import { PeriodFilter } from '@/components/admin/god-view/period-filter';
import { ChartContainer } from '@/components/ui/chart-container';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import {
  adminDashboardApi,
  type AdminHomePeriod,
  type AdminHomeResponse,
} from '@/lib/api/admin-dashboard-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';
import { useAdminSession } from '@/lib/auth/admin-session-context';

const METHOD_LABELS: Record<string, string> = {
  CREDIT_CARD: 'Cartão',
  PIX: 'PIX',
  BOLETO: 'Boleto',
};

export default function AdminHomePage() {
  const { admin } = useAdminSession();
  const [period, setPeriod] = useState<AdminHomePeriod>('30D');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const greeting = useMemo(() => resolveGreeting(now.getHours()), [now]);
  const name = admin ? firstName(admin.name) : '';

  const { data, error, isLoading } = useSWR<AdminHomeResponse>(
    admin ? ['admin/dashboard/home', period] : null,
    () => adminDashboardApi.home({ period, compare: 'PREVIOUS' }),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  return (
    <section className="flex flex-1 flex-col gap-8 px-6 py-8 pb-32">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {now.toLocaleString('pt-BR', {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {greeting}
            {name ? `, ${name}` : ''}.
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Painel global da plataforma Kloel. Dados reais, sem placeholders — métricas ainda não
            disponíveis aparecem como <span className="font-mono">—</span> com o motivo ao lado.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodFilter value={period} onChange={setPeriod} />
          {data ? (
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {data.range.label} • comparando com período anterior
            </span>
          ) : null}
        </div>
      </header>

      {error ? <ErrorBanner error={error} /> : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="GMV"
          value={data?.kpis.gmv.value ?? null}
          kind="currency-brl"
          deltaPct={data?.kpis.gmv.deltaPct}
        />
        <StatCard
          label="Transações aprovadas"
          value={data?.kpis.approvedCount.value ?? null}
          kind="integer"
          deltaPct={data?.kpis.approvedCount.deltaPct}
        />
        <StatCard
          label="Taxa de aprovação"
          value={data?.kpis.approvalRate.value ?? null}
          kind="percentage"
          deltaPct={data?.kpis.approvalRate.deltaPct}
          sublabel={data ? `${data.kpis.declinedCount.value} recusadas no período` : undefined}
        />
        <StatCard
          label="Ticket médio"
          value={data?.kpis.averageTicket.value ?? null}
          kind="currency-brl"
          deltaPct={data?.kpis.averageTicket.deltaPct}
        />
        <StatCard
          label="Reembolsos"
          value={data?.kpis.refundAmount.value ?? null}
          kind="currency-brl"
          deltaPct={data?.kpis.refundAmount.deltaPct}
          sublabel={data ? `${data.kpis.refundCount.value} ocorrências` : undefined}
        />
        <StatCard
          label="Chargebacks"
          value={data?.kpis.chargebackAmount.value ?? null}
          kind="currency-brl"
          deltaPct={data?.kpis.chargebackAmount.deltaPct}
          sublabel={data ? `${data.kpis.chargebackCount.value} disputas` : undefined}
        />
        <StatCard
          label="Produtores ativos"
          value={data?.kpis.activeProducers.value ?? null}
          kind="integer"
          sublabel="Rolling 30 dias"
        />
        <StatCard
          label="Novos produtores"
          value={data?.kpis.newProducers.value ?? null}
          kind="integer"
          deltaPct={data?.kpis.newProducers.deltaPct}
          sublabel={data ? `${data.kpis.totalProducers.value} no total` : undefined}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Revenue Kloel"
          value={null}
          kind="currency-brl"
          unavailableReason="Configurar taxas em SP-11"
        />
        <StatCard
          label="MRR projetado"
          value={null}
          kind="currency-brl"
          unavailableReason="Depende de SP-11 — Subscriptions"
        />
        <StatCard
          label="Churn de produtores"
          value={null}
          kind="percentage"
          unavailableReason="Definição de cohort chega em SP-3b"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr]">
        <ChartContainer
          title="GMV por dia"
          description="Volume bruto transacionado por dia do período."
        >
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <GmvChart data={data?.series.gmvDaily ?? []} />
          )}
        </ChartContainer>
        <ChartContainer
          title="Por gateway"
          description="Distribuição do GMV entre as integrações de pagamento."
        >
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <BreakdownDonut
              data={
                data?.breakdowns.byGateway.map((row) => ({
                  label: row.gateway,
                  gmvInCents: row.gmvInCents,
                })) ?? []
              }
            />
          )}
        </ChartContainer>
        <ChartContainer
          title="Por método"
          description="PIX, cartão e boleto — quanto cada um representa."
        >
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <BreakdownDonut
              data={
                data?.breakdowns.byMethod.map((row) => ({
                  label: METHOD_LABELS[row.method] ?? row.method,
                  gmvInCents: row.gmvInCents,
                })) ?? []
              }
            />
          )}
        </ChartContainer>
      </div>
    </section>
  );
}

function ErrorBanner({ error }: { error: unknown }) {
  const message =
    error instanceof AdminApiClientError
      ? error.message
      : 'Não foi possível carregar o painel. Tente novamente em instantes.';
  return (
    <div
      role="alert"
      className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
    >
      {message}
    </div>
  );
}
