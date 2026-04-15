'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricNumber } from '@/components/ui/metric-number';
import { Skeleton } from '@/components/ui/skeleton';
import { adminAccountsApi, type ListAccountsResponse } from '@/lib/api/admin-accounts-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';

/**
 * SP-12 Clientes — per-client configuration. Custom fee tables require
 * SP-9 (platform_fees + client_custom_fees models). Until those land,
 * this page shows the same workspace roster as /contas annotated with
 * "Sem override" and points to the future editor.
 */
export default function ClientesPage() {
  const { data, error, isLoading } = useSWR<ListAccountsResponse>('admin/accounts?limit=25', () =>
    adminAccountsApi.list({ take: 25 }),
  );

  return (
    <section className="flex flex-1 flex-col gap-6 px-6 py-8 pb-24">
      <header className="flex flex-col gap-2">
        <Badge variant="ember" className="w-fit">
          SP-12
        </Badge>
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Configuração individual de clientes (produtores) — taxas customizadas, limites de plano,
          health score e comunicação direta. Overrides de taxa dependem de SP-9 (
          <code>platform_fees</code> + <code>client_custom_fees</code>) e do editor de fees em
          SP-11.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Clientes mais recentes</CardTitle>
          <CardDescription>Últimas workspaces criadas.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : error ? (
            <p className="text-sm text-red-400">
              {error instanceof AdminApiClientError ? error.message : 'Erro ao carregar clientes.'}
            </p>
          ) : !data || data.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum cliente cadastrado ainda.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-sm border border-border">
              {data.items.map((row) => (
                <li
                  key={row.workspaceId}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{row.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {row.ownerName ?? '—'} • {row.ownerEmail ?? '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="default">Sem override</Badge>
                    <MetricNumber
                      value={row.gmvLast30dInCents}
                      kind="currency-brl"
                      className="text-xs"
                    />
                    <Button asChild variant="outline" size="sm">
                      <Link href="/contas">Ver em Contas</Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">O que vem em SP-12 completo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
          <p>• Taxa de cartão custom por cliente (R$ ou %)</p>
          <p>• Taxa de PIX e boleto custom por cliente</p>
          <p>• Taxa de saque custom</p>
          <p>• Motivo obrigatório + validade (temporária ou permanente)</p>
          <p>• Upgrade/downgrade de plano com limites (GMV mensal, produtos, afiliados)</p>
          <p>• Health score automático (trend de vendas + CB rate + engajamento)</p>
          <p>• Notas internas e histórico de comunicação</p>
        </CardContent>
      </Card>
    </section>
  );
}
