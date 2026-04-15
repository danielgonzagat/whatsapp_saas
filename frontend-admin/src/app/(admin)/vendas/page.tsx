'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MetricNumber } from '@/components/ui/metric-number';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import {
  adminTransactionsApi,
  type ListTransactionsResponse,
  type OrderStatusValue,
  type PaymentMethodValue,
} from '@/lib/api/admin-transactions-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';

const PAGE_SIZE = 50;

const STATUS_VARIANT: Record<string, 'ember' | 'success' | 'warning' | 'danger' | 'default'> = {
  PAID: 'success',
  SHIPPED: 'success',
  DELIVERED: 'success',
  PENDING: 'default',
  PROCESSING: 'warning',
  CANCELED: 'default',
  REFUNDED: 'warning',
  CHARGEBACK: 'danger',
};

const METHOD_LABELS: Record<string, string> = {
  CREDIT_CARD: 'Cartão',
  PIX: 'PIX',
  BOLETO: 'Boleto',
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

export default function VendasPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | OrderStatusValue>('');
  const [method, setMethod] = useState<'' | PaymentMethodValue>('');
  const [page, setPage] = useState(0);

  const { data, error, isLoading } = useSWR<ListTransactionsResponse>(
    ['admin/transactions', search, status, method, page],
    () =>
      adminTransactionsApi.list({
        search: search || undefined,
        status: (status || undefined) as OrderStatusValue | undefined,
        method: (method || undefined) as PaymentMethodValue | undefined,
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    { keepPreviousData: true, refreshInterval: 60_000 },
  );

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <section className="flex flex-1 flex-col gap-6 px-6 py-8 pb-24">
      <header className="flex flex-col gap-2">
        <Badge variant="ember" className="w-fit">
          SP-6
        </Badge>
        <h1 className="text-2xl font-semibold">Vendas</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Transações consolidadas de toda a plataforma. Leitura global — ações destrutivas
          (estornar, marcar fraude) chegam em SP-8 com idempotência blindada.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Total filtrado"
          value={data?.sum.totalInCents ?? null}
          kind="currency-brl"
        />
        <StatCard
          label="Transações"
          value={data?.total ?? null}
          kind="integer"
          sublabel="no filtro atual"
        />
        <StatCard
          label="Ticket médio"
          value={data && data.total > 0 ? Math.round(data.sum.totalInCents / data.total) : null}
          kind="currency-brl"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filtros</CardTitle>
          <CardDescription>Busca por número do pedido, email ou nome do comprador.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input
            placeholder="Pedido, nome, email"
            value={search}
            onChange={(e) => {
              setPage(0);
              setSearch(e.currentTarget.value);
            }}
            className="w-full md:max-w-sm"
          />
          <select
            value={status}
            onChange={(e) => {
              setPage(0);
              setStatus(e.currentTarget.value as '' | OrderStatusValue);
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">Todos os status</option>
            <option value="PENDING">Pendente</option>
            <option value="PROCESSING">Processando</option>
            <option value="PAID">Paga</option>
            <option value="SHIPPED">Enviada</option>
            <option value="DELIVERED">Entregue</option>
            <option value="CANCELED">Cancelada</option>
            <option value="REFUNDED">Reembolsada</option>
            <option value="CHARGEBACK">Chargeback</option>
          </select>
          <select
            value={method}
            onChange={(e) => {
              setPage(0);
              setMethod(e.currentTarget.value as '' | PaymentMethodValue);
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">Todos os métodos</option>
            <option value="CREDIT_CARD">Cartão</option>
            <option value="PIX">PIX</option>
            <option value="BOLETO">Boleto</option>
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Transações</CardTitle>
          <CardDescription>{data ? `${data.total} encontradas` : 'Carregando…'}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p
              role="alert"
              className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
            >
              {error instanceof AdminApiClientError
                ? error.message
                : 'Não foi possível carregar as vendas.'}
            </p>
          ) : !data || data.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma transação encontrada para os filtros atuais.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-sm border border-border">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Pedido</th>
                    <th className="px-4 py-3">Comprador</th>
                    <th className="px-4 py-3">Workspace</th>
                    <th className="px-4 py-3">Método</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3">Pago em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.map((row) => (
                    <tr key={row.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3 font-mono text-xs">{row.orderNumber}</td>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex flex-col">
                          <span className="text-foreground">{row.customerName || '—'}</span>
                          <span className="text-muted-foreground">{row.customerEmail}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {row.workspaceName ?? row.workspaceId.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex flex-col">
                          <span className="text-foreground">
                            {METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod}
                          </span>
                          {row.cardBrand && row.cardLast4 ? (
                            <span className="text-muted-foreground">
                              {row.cardBrand} •••• {row.cardLast4}
                            </span>
                          ) : null}
                          {row.gateway ? (
                            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                              {row.gateway}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[row.status] ?? 'default'}>
                          {row.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MetricNumber
                          value={row.totalInCents}
                          kind="currency-brl"
                          className="text-sm"
                        />
                        {row.installments > 1 ? (
                          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                            {row.installments}x
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDateTime(row.paidAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data && totalPages > 1 ? (
            <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
              <span>
                Página {page + 1} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
