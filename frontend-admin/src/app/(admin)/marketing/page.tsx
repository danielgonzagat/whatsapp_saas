'use client';

import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricNumber } from '@/components/ui/metric-number';
import { StatCard } from '@/components/ui/stat-card';
import { adminDashboardApi, type AdminHomeResponse } from '@/lib/api/admin-dashboard-api';

export default function MarketingPage() {
  // Marketing global view piggybacks on the dashboard's producer counts +
  // method breakdown for now. Channel-specific views (WhatsApp, Instagram,
  // Meta) require the marketing integration surface which comes in SP-13
  // complete.
  const { data } = useSWR<AdminHomeResponse>(['admin/dashboard/home', '30D'], () =>
    adminDashboardApi.home({ period: '30D', compare: 'NONE' }),
  );

  return (
    <section className="flex flex-1 flex-col gap-6 px-6 py-8 pb-24">
      <header className="flex flex-col gap-2">
        <Badge variant="ember" className="w-fit">
          SP-13
        </Badge>
        <h1 className="text-2xl font-semibold">Marketing</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Painel global dos canais de marketing. Métricas de conversão e volume de conversas estão
          parcialmente disponíveis via o Dashboard. Telas dedicadas de WhatsApp, Instagram, Meta e
          Email chegam em SP-13 completo.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Produtores ativos"
          value={data?.kpis.activeProducers.value ?? null}
          kind="integer"
          sublabel="rolling 30 dias"
        />
        <StatCard
          label="Novos produtores"
          value={data?.kpis.newProducers.value ?? null}
          kind="integer"
          sublabel="no período"
        />
        <StatCard
          label="Taxa de aprovação"
          value={data?.kpis.approvalRate.value ?? null}
          kind="percentage"
          sublabel="sinal de performance de funil"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">GMV por método</CardTitle>
          <CardDescription>
            Proxy de preferência de canal — PIX domina quando conversão cai no último passo.
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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Próximos itens desta seção</CardTitle>
          <CardDescription>Tech debt explícito — SP-13 completo.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
          <p>• Dispositivos conectados por canal (WhatsApp Cloud, WAHA, Instagram, Meta)</p>
          <p>• Conversas abertas em tempo real</p>
          <p>• Mensagens enviadas / recebidas por canal</p>
          <p>• Taxa de resposta e funil conversa → conversão</p>
          <p>• Rankings de produtores por volume de conversas</p>
          <p>• Heatmap de horários de pico</p>
        </CardContent>
      </Card>
    </section>
  );
}
