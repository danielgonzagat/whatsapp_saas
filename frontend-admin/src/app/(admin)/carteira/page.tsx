'use client';

import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricNumber } from '@/components/ui/metric-number';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import {
  adminCarteiraApi,
  type ListLedgerResponse,
  type PlatformWalletBalance,
} from '@/lib/api/admin-carteira-api';
import { adminDashboardApi, type AdminHomeResponse } from '@/lib/api/admin-dashboard-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';

const BUCKET_LABEL: Record<string, string> = {
  AVAILABLE: 'Disponível',
  PENDING: 'A receber',
  RESERVED: 'Reserva',
};

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

/**
 * SP-9 v0 — Platform wallet page. Reads live balances and ledger
 * entries from /admin/carteira. Until the split engine lands in a
 * follow-up PR, the wallet has zero balance and the ledger is
 * empty — the correct honest state per CLAUDE.md. Empty state
 * shows a "setup required" hint explaining that credits flow in
 * once the split engine is wired into the checkout confirm path.
 */
export default function CarteiraPage() {
  const { data: balance, error: balanceError } = useSWR<PlatformWalletBalance>(
    'admin/carteira/balance',
    () => adminCarteiraApi.balance(),
  );

  const { data: ledger, error: ledgerError } = useSWR<ListLedgerResponse>(
    'admin/carteira/ledger',
    () => adminCarteiraApi.ledger({ take: 25 }),
  );

  const { data: home } = useSWR<AdminHomeResponse>(['admin/dashboard/home', '30D'], () =>
    adminDashboardApi.home({ period: '30D', compare: 'NONE' }),
  );

  const hasLedger = Boolean(ledger && ledger.items.length > 0);

  return (
    <section className="flex flex-1 flex-col gap-6 px-6 py-8 pb-24">
      <header className="flex flex-col gap-2">
        <Badge variant="ember" className="w-fit">
          SP-9
        </Badge>
        <h1 className="text-2xl font-semibold">Carteira da plataforma</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Saldo real da Kloel por moeda, com ledger append-only (invariante I-ADMIN-W2).
          Reconciliação, split engine no checkout, payouts e P&amp;L chegam em SP-9 completo.
        </p>
      </header>

      {balanceError ? (
        <p
          role="alert"
          className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
        >
          {balanceError instanceof AdminApiClientError
            ? balanceError.message
            : 'Não foi possível carregar o saldo da carteira.'}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Saldo disponível"
          value={balance ? balance.availableInCents : null}
          kind="currency-brl"
          sublabel={
            balance
              ? `${balance.currency} • atualizado ${formatDateTime(balance.updatedAt)}`
              : undefined
          }
        />
        <StatCard
          label="Saldo a receber"
          value={balance ? balance.pendingInCents : null}
          kind="currency-brl"
          sublabel="liquida quando o pedido conclui"
        />
        <StatCard
          label="Reserva (chargebacks)"
          value={balance ? balance.reservedInCents : null}
          kind="currency-brl"
          sublabel="retido para cobrir riscos"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="GMV — 30d"
          value={home?.kpis.gmv.value ?? null}
          kind="currency-brl"
          sublabel="volume bruto processado"
        />
        <StatCard
          label="Ticket médio"
          value={home?.kpis.averageTicket.value ?? null}
          kind="currency-brl"
        />
        <StatCard
          label="Chargebacks — 30d"
          value={home?.kpis.chargebackAmount.value ?? null}
          kind="currency-brl"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Ledger — últimas 25 entradas</CardTitle>
          <CardDescription>
            Append-only. Cada mutação de saldo gera uma linha, e o par (orderId, kind) é único,
            então replays nunca creditam duas vezes (invariante I-ADMIN-W5).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {ledgerError ? (
            <p
              role="alert"
              className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
            >
              {ledgerError instanceof AdminApiClientError
                ? ledgerError.message
                : 'Não foi possível carregar o ledger.'}
            </p>
          ) : !ledger ? (
            <Skeleton className="h-32 w-full" />
          ) : hasLedger ? (
            <div className="overflow-x-auto rounded-sm border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Kind</th>
                    <th className="px-4 py-3">Bucket</th>
                    <th className="px-4 py-3">Pedido</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ledger.items.map((row) => (
                    <tr key={row.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDateTime(row.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <Badge variant={row.direction === 'credit' ? 'success' : 'warning'}>
                          {row.kind}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {BUCKET_LABEL[row.bucket] ?? row.bucket}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{row.orderId ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <MetricNumber
                          value={
                            row.direction === 'credit' ? row.amountInCents : -row.amountInCents
                          }
                          kind="currency-brl"
                          className="text-sm"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-sm border border-dashed border-border bg-card/60 p-6 text-center text-xs text-muted-foreground">
              Ledger vazio. O split engine do checkout começa a popular estas linhas assim que for
              ligado no <code className="font-mono">checkout confirm</code> — feature flag{' '}
              <code className="font-mono">adm.wallet.v1</code>.
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
