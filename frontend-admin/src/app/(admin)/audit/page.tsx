'use client';

import { useId, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  adminAuditApi,
  type AdminAuditListResponse,
  type AdminAuditRecord,
} from '@/lib/api/admin-audit-api';

const PAGE_SIZE = 25;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

function isoOrUndefined(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: AdminAuditRecord[]): string {
  const headers = [
    'createdAt',
    'action',
    'adminUserEmail',
    'entityType',
    'entityId',
    'ip',
    'userAgent',
    'details',
  ];
  const body = rows.map((r) =>
    [
      r.createdAt,
      r.action,
      r.adminUser?.email ?? '',
      r.entityType ?? '',
      r.entityId ?? '',
      r.ip ?? '',
      r.userAgent ?? '',
      r.details,
    ]
      .map(csvEscape)
      .join(','),
  );
  return [headers.join(','), ...body].join('\n');
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function AuditPage() {
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [entityIdFilter, setEntityIdFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [exporting, setExporting] = useState(false);

  const actionId = useId();
  const entityTypeId = useId();
  const entityIdInputId = useId();
  const fromId = useId();
  const toId = useId();

  const filters = useMemo(
    () => ({
      action: actionFilter || undefined,
      entityType: entityTypeFilter || undefined,
      entityId: entityIdFilter || undefined,
      from: isoOrUndefined(fromFilter),
      to: isoOrUndefined(toFilter),
    }),
    [actionFilter, entityTypeFilter, entityIdFilter, fromFilter, toFilter],
  );

  const skip = page * PAGE_SIZE;
  const swrKey = `admin/audit?${JSON.stringify({ ...filters, skip })}`;

  const { data, error, isLoading } = useSWR<AdminAuditListResponse>(swrKey, () =>
    adminAuditApi.list({
      ...filters,
      skip,
      take: PAGE_SIZE,
    }),
  );

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  function resetPage<T>(setter: (v: T) => void): (value: T) => void {
    return (value) => {
      setPage(0);
      setter(value);
    };
  }

  async function onExport() {
    setExporting(true);
    try {
      const result = await adminAuditApi.list({ ...filters, skip: 0, take: 200 });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadCsv(`audit-${stamp}.csv`, toCsv(result.items));
    } catch (err) {
      console.error('audit export failed', err);
    } finally {
      setExporting(false);
    }
  }

  const hasAnyFilter = actionFilter || entityTypeFilter || entityIdFilter || fromFilter || toFilter;

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
          <CardDescription>Combine vários filtros para convergir a busca.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={actionId}>Ação</Label>
            <Input
              id={actionId}
              placeholder="admin.auth.login"
              value={actionFilter}
              onChange={(e) => resetPage(setActionFilter)(e.currentTarget.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={entityTypeId}>Tipo de entidade</Label>
            <Input
              id={entityTypeId}
              placeholder="Product, Workspace…"
              value={entityTypeFilter}
              onChange={(e) => resetPage(setEntityTypeFilter)(e.currentTarget.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={entityIdInputId}>ID da entidade</Label>
            <Input
              id={entityIdInputId}
              placeholder="cu_…"
              value={entityIdFilter}
              onChange={(e) => resetPage(setEntityIdFilter)(e.currentTarget.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={fromId}>De</Label>
            <Input
              id={fromId}
              type="datetime-local"
              value={fromFilter}
              onChange={(e) => resetPage(setFromFilter)(e.currentTarget.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={toId}>Até</Label>
            <Input
              id={toId}
              type="datetime-local"
              value={toFilter}
              onChange={(e) => resetPage(setToFilter)(e.currentTarget.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!hasAnyFilter}
              onClick={() => {
                setPage(0);
                setActionFilter('');
                setEntityTypeFilter('');
                setEntityIdFilter('');
                setFromFilter('');
                setToFilter('');
              }}
            >
              Limpar
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!data || data.items.length === 0 || exporting}
              onClick={onExport}
            >
              {exporting ? 'Exportando…' : 'Exportar CSV (200)'}
            </Button>
          </div>
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
