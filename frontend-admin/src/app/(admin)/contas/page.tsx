'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MetricNumber } from '@/components/ui/metric-number';
import { Skeleton } from '@/components/ui/skeleton';
import {
  adminAccountsApi,
  type AdminAccountKycStatus,
  type ListAccountsResponse,
} from '@/lib/api/admin-accounts-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';

const PAGE_SIZE = 25;

const KYC_VARIANT: Record<string, 'ember' | 'success' | 'warning' | 'danger' | 'default'> = {
  approved: 'success',
  submitted: 'warning',
  pending: 'default',
  rejected: 'danger',
  unknown: 'default',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

export default function ContasPage() {
  const [search, setSearch] = useState('');
  const [kycFilter, setKycFilter] = useState<'' | AdminAccountKycStatus>('');
  const [page, setPage] = useState(0);

  const swrKey = ['admin/accounts', search, kycFilter, page];
  const { data, error, isLoading } = useSWR<ListAccountsResponse>(
    swrKey,
    () =>
      adminAccountsApi.list({
        search: search || undefined,
        kycStatus: (kycFilter || undefined) as AdminAccountKycStatus | undefined,
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    { keepPreviousData: true },
  );

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <section className="flex flex-1 flex-col gap-6 px-6 py-8 pb-24">
      <header className="flex flex-col gap-2">
        <Badge variant="ember" className="w-fit">
          SP-4
        </Badge>
        <h1 className="text-2xl font-semibold">Contas</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Todas as workspaces da plataforma com seu proprietário, status de KYC e volume comercial
          recente. Ações destrutivas (suspender, bloquear, congelar saldo) chegam em SP-8.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filtros</CardTitle>
          <CardDescription>Busca por nome da workspace ou email do dono.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row">
          <Input
            placeholder="Nome ou email"
            value={search}
            onChange={(e) => {
              setPage(0);
              setSearch(e.currentTarget.value);
            }}
            className="md:max-w-md"
          />
          <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
            {(['', 'pending', 'submitted', 'approved', 'rejected'] as const).map((opt) => {
              const label = opt === '' ? 'Todos KYC' : opt;
              const active = kycFilter === opt;
              return (
                <button
                  key={opt || 'all'}
                  type="button"
                  onClick={() => {
                    setPage(0);
                    setKycFilter(opt as '' | AdminAccountKycStatus);
                  }}
                  className={
                    'rounded-sm px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ' +
                    (active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground')
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Workspaces</CardTitle>
          <CardDescription>
            {data ? `${data.total} workspaces encontradas` : 'Carregando…'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : error ? (
            <ErrorBanner error={error} />
          ) : !data || data.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma workspace encontrada para os filtros atuais.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-sm border border-border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Workspace</th>
                    <th className="px-4 py-3">Dono</th>
                    <th className="px-4 py-3">KYC</th>
                    <th className="px-4 py-3 text-right">GMV 30d</th>
                    <th className="px-4 py-3 text-right">Produtos</th>
                    <th className="px-4 py-3">Última venda</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.map((row) => (
                    <tr key={row.workspaceId} className="hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{row.name}</span>
                          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                            desde {formatDate(row.createdAt)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex flex-col">
                          <span className="text-foreground">{row.ownerName ?? '—'}</span>
                          <span className="text-muted-foreground">{row.ownerEmail ?? '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={KYC_VARIANT[row.kycStatus] ?? 'default'}>
                          {row.kycStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MetricNumber
                          value={row.gmvLast30dInCents}
                          kind="currency-brl"
                          className="text-sm"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MetricNumber value={row.productCount} kind="integer" className="text-sm" />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDate(row.lastSaleAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/contas/${row.workspaceId}`}>Ver</Link>
                        </Button>
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

function ErrorBanner({ error }: { error: unknown }) {
  const message =
    error instanceof AdminApiClientError ? error.message : 'Não foi possível carregar as contas.';
  return (
    <div
      role="alert"
      className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
    >
      {message}
    </div>
  );
}
