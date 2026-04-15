'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { adminAuditApi, type AdminAuditListResponse } from '@/lib/api/admin-audit-api';

const PAGE_SIZE = 25;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

export default function AuditPage() {
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState('');

  const skip = page * PAGE_SIZE;
  const swrKey = `admin/audit?skip=${skip}&take=${PAGE_SIZE}&action=${actionFilter}`;

  const { data, error, isLoading } = useSWR<AdminAuditListResponse>(swrKey, () =>
    adminAuditApi.list({
      skip,
      take: PAGE_SIZE,
      action: actionFilter || undefined,
    }),
  );

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="flex flex-col gap-6 px-6 py-8 pb-24">
      <header className="flex flex-col gap-2">
        <Badge variant="ember" className="w-fit">
          SP-2
        </Badge>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Trilha imutável de todas as ações administrativas. Tabelas são append-only no banco —
          nenhuma linha pode ser editada ou deletada (invariante I-ADMIN-1).
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filtros</CardTitle>
          <CardDescription>Filtre por substring na ação.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row">
          <Input
            placeholder="Ex.: admin.auth.login"
            value={actionFilter}
            onChange={(e) => {
              setPage(0);
              setActionFilter(e.currentTarget.value);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Eventos</CardTitle>
          <CardDescription>
            {data ? `${data.total} eventos encontrados` : 'Carregando…'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-400">Não foi possível carregar o audit log.</p>
          ) : !data || data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum evento encontrado para os filtros atuais.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-sm border border-border">
              {data.items.map((item) => (
                <li key={item.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-xs text-primary">{item.action}</code>
                    {item.entityType ? <Badge variant="outline">{item.entityType}</Badge> : null}
                    {item.adminUser ? (
                      <span className="text-xs text-muted-foreground">
                        por {item.adminUser.name} ({item.adminUser.email})
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <span>{formatDate(item.createdAt)}</span>
                    {item.ip ? <span className="font-mono normal-case">{item.ip}</span> : null}
                    {item.entityId ? (
                      <span className="font-mono normal-case">#{item.entityId.slice(0, 8)}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
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
    </div>
  );
}
