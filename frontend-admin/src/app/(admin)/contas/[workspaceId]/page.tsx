'use client';

import Link from 'next/link';
import { use } from 'react';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricNumber } from '@/components/ui/metric-number';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { adminAccountsApi, type AdminAccountDetail } from '@/lib/api/admin-accounts-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';

const ROLE_VARIANT: Record<string, 'ember' | 'warning' | 'default'> = {
  ADMIN: 'ember',
  AGENT: 'default',
};

const KYC_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  approved: 'success',
  submitted: 'warning',
  pending: 'default',
  rejected: 'danger',
};

const ORDER_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  PAID: 'success',
  SHIPPED: 'success',
  DELIVERED: 'success',
  PENDING: 'default',
  PROCESSING: 'warning',
  CANCELED: 'default',
  REFUNDED: 'warning',
  CHARGEBACK: 'danger',
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

export default function AccountDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = use(params);

  const { data, error, isLoading } = useSWR<AdminAccountDetail>(
    ['admin/accounts', workspaceId],
    () => adminAccountsApi.detail(workspaceId),
  );

  return (
    <section className="flex flex-1 flex-col gap-6 px-6 py-8 pb-24">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/contas" className="hover:text-foreground">
            ← Contas
          </Link>
        </div>
        <h1 className="text-2xl font-semibold">{isLoading ? '…' : (data?.name ?? 'Conta')}</h1>
        {data ? (
          <p className="text-xs text-muted-foreground">
            Criada em {formatDateTime(data.createdAt)} • Última atualização{' '}
            {formatDateTime(data.updatedAt)} • Workspace ID{' '}
            <code className="font-mono">{data.workspaceId}</code>
          </p>
        ) : null}
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
        >
          {error instanceof AdminApiClientError
            ? error.message
            : 'Não foi possível carregar a conta.'}
        </p>
      ) : null}

      {isLoading || !data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="GMV 30 dias" value={data.gmvLast30dInCents} kind="currency-brl" />
            <StatCard label="GMV total" value={data.gmvAllTimeInCents} kind="currency-brl" />
            <StatCard label="Produtos" value={data.productCount} kind="integer" />
            <StatCard label="Agentes" value={data.agents.length} kind="integer" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Agentes</CardTitle>
              <CardDescription>
                Usuários com acesso dentro desta workspace e seus respectivos status de KYC.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {data.agents.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nenhum agente cadastrado.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-sm border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Nome</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">KYC</th>
                        <th className="px-4 py-3">Submetido</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.agents.map((a) => (
                        <tr key={a.id} className="hover:bg-accent/40">
                          <td className="px-4 py-3 text-xs text-foreground">{a.name}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{a.email}</td>
                          <td className="px-4 py-3">
                            <Badge variant={ROLE_VARIANT[a.role] ?? 'default'}>{a.role}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={KYC_VARIANT[a.kycStatus] ?? 'default'}>
                              {a.kycStatus}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {formatDateTime(a.kycSubmittedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Documentos KYC</CardTitle>
              <CardDescription>
                Todos os documentos enviados pelos agentes desta workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {data.kycDocuments.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nenhum documento enviado.
                </p>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-sm border border-border">
                  {data.kycDocuments.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                    >
                      <div className="flex flex-col">
                        <span className="text-foreground">{doc.type}</span>
                        <span className="text-xs text-muted-foreground">{doc.fileName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={KYC_VARIANT[doc.status] ?? 'default'}>{doc.status}</Badge>
                        <Button asChild variant="outline" size="sm">
                          <a href={doc.fileUrl} target="_blank" rel="noreferrer">
                            Abrir
                          </a>
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
              <CardTitle className="text-sm">Últimos pedidos</CardTitle>
              <CardDescription>As 10 orders mais recentes desta workspace.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {data.recentOrders.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Sem pedidos.</p>
              ) : (
                <div className="overflow-x-auto rounded-sm border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Pedido</th>
                        <th className="px-4 py-3">Comprador</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Valor</th>
                        <th className="px-4 py-3">Pago em</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.recentOrders.map((o) => (
                        <tr key={o.id} className="hover:bg-accent/40">
                          <td className="px-4 py-3 font-mono text-xs">{o.orderNumber}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {o.customerEmail}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={ORDER_STATUS_VARIANT[o.status] ?? 'default'}>
                              {o.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <MetricNumber
                              value={o.totalInCents}
                              kind="currency-brl"
                              className="text-sm"
                            />
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {formatDateTime(o.paidAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
