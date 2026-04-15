'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MetricNumber } from '@/components/ui/metric-number';
import { Skeleton } from '@/components/ui/skeleton';
import {
  adminProductsApi,
  type AdminProductRow,
  type ListProductsResponse,
} from '@/lib/api/admin-products-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';

const PAGE_SIZE = 25;

const STATUS_VARIANT: Record<string, 'ember' | 'success' | 'warning' | 'danger' | 'default'> = {
  APPROVED: 'success',
  ACTIVE: 'success',
  PENDING: 'warning',
  DRAFT: 'default',
  REJECTED: 'danger',
  PAUSED: 'default',
  ARCHIVED: 'default',
};

type ModerationDialog =
  | { kind: 'approve'; product: AdminProductRow }
  | { kind: 'reject'; product: AdminProductRow }
  | null;

export default function ProdutosPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [dialog, setDialog] = useState<ModerationDialog>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR<ListProductsResponse>(
    ['admin/products', search, status, page],
    () =>
      adminProductsApi.list({
        search: search || undefined,
        status: status || undefined,
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    { keepPreviousData: true, refreshInterval: 60_000 },
  );

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  async function confirm() {
    if (!dialog) return;
    setFeedback(null);
    setBusy(true);
    try {
      if (dialog.kind === 'approve') {
        await adminProductsApi.approve(dialog.product.id, note || undefined);
      } else {
        await adminProductsApi.reject(dialog.product.id, reason);
      }
      await mutate();
      setDialog(null);
      setNote('');
      setReason('');
    } catch (err) {
      setFeedback(
        err instanceof AdminApiClientError ? err.message : 'Erro inesperado ao moderar o produto.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-1 flex-col gap-6 px-6 py-8 pb-24">
      <header className="flex flex-col gap-2">
        <Badge variant="ember" className="w-fit">
          SP-5
        </Badge>
        <h1 className="text-2xl font-semibold">Produtos</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Catálogo de todos os produtos da plataforma com fila de moderação. Clique em Aprovar ou
          Rejeitar nos produtos com status PENDING para trabalhar a fila.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filtros</CardTitle>
          <CardDescription>Busca por nome, descrição ou categoria.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input
            placeholder="Nome, descrição ou categoria"
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
              setStatus(e.currentTarget.value);
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">Todos os status</option>
            <option value="DRAFT">Rascunho</option>
            <option value="PENDING">Pendente</option>
            <option value="APPROVED">Aprovado</option>
            <option value="REJECTED">Rejeitado</option>
            <option value="ACTIVE">Ativo</option>
            <option value="PAUSED">Pausado</option>
            <option value="ARCHIVED">Arquivado</option>
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {data ? `${data.total} produtos` : 'Carregando…'}
          </CardTitle>
          <CardDescription>Atualização automática a cada 60s.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : error ? (
            <p
              role="alert"
              className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
            >
              {error instanceof AdminApiClientError
                ? error.message
                : 'Não foi possível carregar os produtos.'}
            </p>
          ) : !data || data.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum produto encontrado para os filtros atuais.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-sm border border-border">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Produto</th>
                    <th className="px-4 py-3">Workspace</th>
                    <th className="px-4 py-3">Formato</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Preço</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.map((row) => (
                    <tr key={row.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{row.name}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {row.category ?? '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {row.workspaceName ?? row.workspaceId.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{row.format}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[row.status] ?? 'default'}>
                          {row.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MetricNumber
                          value={row.priceInCents}
                          kind="currency-brl"
                          className="text-sm"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              setDialog({ kind: 'approve', product: row });
                              setNote('');
                              setReason('');
                              setFeedback(null);
                            }}
                          >
                            Aprovar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDialog({ kind: 'reject', product: row });
                              setNote('');
                              setReason('');
                              setFeedback(null);
                            }}
                          >
                            Rejeitar
                          </Button>
                        </div>
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

      {dialog ? (
        <div
          role="dialog"
          aria-modal
          className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-6"
        >
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-sm">
                {dialog.kind === 'approve' ? 'Aprovar produto' : 'Rejeitar produto'}
              </CardTitle>
              <CardDescription>
                {dialog.product.name} — {dialog.product.workspaceName ?? dialog.product.workspaceId}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {dialog.kind === 'approve' ? (
                <Input
                  placeholder="Nota interna (opcional)"
                  value={note}
                  onChange={(e) => setNote(e.currentTarget.value)}
                />
              ) : (
                <Input
                  placeholder="Motivo da rejeição"
                  value={reason}
                  onChange={(e) => setReason(e.currentTarget.value)}
                />
              )}
              {feedback ? <p className="text-xs text-red-400">{feedback}</p> : null}
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDialog(null)} disabled={busy}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={confirm}
                  disabled={busy || (dialog.kind === 'reject' && reason.trim().length < 3)}
                >
                  {busy ? 'Processando…' : 'Confirmar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
