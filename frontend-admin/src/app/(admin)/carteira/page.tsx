'use client';

import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { adminDashboardApi, type AdminHomeResponse } from '@/lib/api/admin-dashboard-api';

/**
 * Carteira da plataforma — SP-9 será o épico financeiro real. Por ora
 * esta página reusa o dashboard pra mostrar os valores que já sabemos
 * calcular (GMV, ticket médio) e declara honestamente os KPIs
 * indisponíveis (saldo, split, payouts, P&L, conciliação) que
 * precisam da tabela `platform_wallet` que ainda não existe.
 */
export default function CarteiraPage() {
  const { data } = useSWR<AdminHomeResponse>(['admin/dashboard/home', '30D'], () =>
    adminDashboardApi.home({ period: '30D', compare: 'NONE' }),
  );

  return (
    <section className="flex flex-1 flex-col gap-6 px-6 py-8 pb-24">
      <header className="flex flex-col gap-2">
        <Badge variant="ember" className="w-fit">
          SP-9
        </Badge>
        <h1 className="text-2xl font-semibold">Carteira da plataforma</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Saldo, split engine, fee management, fila de payouts, conciliação bancária e P&L da Kloel
          como empresa. SP-9 é o maior épico financeiro do painel — chega com invariantes formais,
          trigger append-only no ledger e conciliação automática.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Saldo disponível"
          value={null}
          kind="currency-brl"
          unavailableReason="Criar platform_wallet em SP-9"
        />
        <StatCard
          label="Saldo a receber"
          value={null}
          kind="currency-brl"
          unavailableReason="Depende do split engine SP-9"
        />
        <StatCard
          label="Reserva para chargebacks"
          value={null}
          kind="currency-brl"
          unavailableReason="Reserve fund em SP-9"
        />
        <StatCard
          label="Receita Kloel (estimada)"
          value={null}
          kind="currency-brl"
          unavailableReason="Configurar fees em SP-11"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="GMV — 30d"
          value={data?.kpis.gmv.value ?? null}
          kind="currency-brl"
          sublabel="volume bruto processado"
        />
        <StatCard
          label="Ticket médio"
          value={data?.kpis.averageTicket.value ?? null}
          kind="currency-brl"
        />
        <StatCard
          label="Chargebacks — 30d"
          value={data?.kpis.chargebackAmount.value ?? null}
          kind="currency-brl"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">O que vem em SP-9</CardTitle>
          <CardDescription>Stack financeiro blindado, passo a passo.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
          <p>
            • <strong className="text-foreground">platform_wallet</strong> model — saldo disponível,
            a receber, retido
          </p>
          <p>
            • <strong className="text-foreground">platform_wallet_ledger</strong> append-only com
            trigger PG
          </p>
          <p>
            • <strong className="text-foreground">split_rules</strong> por produto — % da
            plataforma, produtor, afiliado
          </p>
          <p>
            • <strong className="text-foreground">platform_fees</strong> por método + tiers de
            volume
          </p>
          <p>• Fila de payouts aos produtores com aprovação humana</p>
          <p>• Conciliação bancária automática (gateway recebido vs pool)</p>
          <p>• Reserve fund % por produtor de risco alto</p>
          <p>• P&L mensal / trimestral / anual</p>
          <p>• NFs emitidas + retenções tributárias + informe de rendimentos</p>
        </CardContent>
      </Card>
    </section>
  );
}
