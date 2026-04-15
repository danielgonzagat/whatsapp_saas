'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricNumber } from '@/components/ui/metric-number';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import {
  adminTransactionsApi,
  type ListTransactionsResponse,
} from '@/lib/api/admin-transactions-api';
import { adminAuditApi, type AdminAuditListResponse } from '@/lib/api/admin-audit-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

export default function CompliancePage() {
  // Chargebacks: transactions with status=CHARGEBACK. Reuse the SP-6 API.
  const {
    data: chargebacks,
    error: cbError,
    isLoading: cbLoading,
  } = useSWR<ListTransactionsResponse>(
    'admin/transactions?status=CHARGEBACK',
    () => adminTransactionsApi.list({ status: 'CHARGEBACK', take: 50 }),
    { refreshInterval: 60_000 },
  );

  const {
    data: refunds,
    error: rfError,
    isLoading: rfLoading,
  } = useSWR<ListTransactionsResponse>(
    'admin/transactions?status=REFUNDED',
    () => adminTransactionsApi.list({ status: 'REFUNDED', take: 50 }),
    { refreshInterval: 60_000 },
  );

  // Recent audit events on admin/kyc for the compliance feed.
  const { data: audit } = useSWR<AdminAuditListResponse>(
    'admin/audit?action=kyc',
    () => adminAuditApi.list({ action: 'kyc', take: 20 }),
    { refreshInterval: 60_000 },
  );

  return (
    <section className="flex flex-1 flex-col gap-6 px-6 py-8 pb-24">
      <header className="flex flex-col gap-2">
        <Badge variant="ember" className="w-fit">
          SP-7
        </Badge>
        <h1 className="text-2xl font-semibold">Compliance</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Visão de risco da plataforma: chargebacks abertos, reembolsos recentes e trilha de
          auditoria KYC. Blacklists, fraud scoring e AML detalhado chegam em SP-7 completo.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Chargebacks"
          value={chargebacks?.total ?? null}
          kind="integer"
          sublabel="últimos 50"
        />
        <StatCard
          label="Valor em chargebacks"
          value={chargebacks?.sum.totalInCents ?? null}
          kind="currency-brl"
        />
        <StatCard
          label="Reembolsos"
          value={refunds?.total ?? null}
          kind="integer"
          sublabel="últimos 50"
        />
        <StatCard
          label="Valor reembolsado"
          value={refunds?.sum.totalInCents ?? null}
          kind="currency-brl"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Chargebacks abertos</CardTitle>
          <CardDescription>
            Transações com status CHARGEBACK. Clique em uma linha para ver no módulo Vendas. Ações
            de defesa chegam em SP-7 completo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {cbLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : cbError ? (
            <p className="text-sm text-red-400">
              {cbError instanceof AdminApiClientError
                ? cbError.message
                : 'Erro ao carregar chargebacks.'}
            </p>
          ) : !chargebacks || chargebacks.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum chargeback aberto no momento.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-sm border border-border">
              {chargebacks.items.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div className="flex flex-col">
                    <span className="font-mono text-xs">{row.orderNumber}</span>
                    <span className="text-xs text-muted-foreground">
                      {row.customerName} • {row.customerEmail}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <MetricNumber
                      value={row.totalInCents}
                      kind="currency-brl"
                      className="text-sm"
                    />
                    <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {formatDateTime(row.paidAt ?? row.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Reembolsos recentes</CardTitle>
          <CardDescription>Transações com status REFUNDED.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {rfLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : rfError ? (
            <p className="text-sm text-red-400">
              {rfError instanceof AdminApiClientError
                ? rfError.message
                : 'Erro ao carregar reembolsos.'}
            </p>
          ) : !refunds || refunds.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum reembolso recente.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-sm border border-border">
              {refunds.items.slice(0, 10).map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div className="flex flex-col">
                    <span className="font-mono text-xs">{row.orderNumber}</span>
                    <span className="text-xs text-muted-foreground">{row.customerEmail}</span>
                  </div>
                  <MetricNumber value={row.totalInCents} kind="currency-brl" className="text-sm" />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Eventos KYC recentes</CardTitle>
          <CardDescription>
            Últimas decisões de KYC registradas no audit log append-only.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {!audit ? (
            <Skeleton className="h-20 w-full" />
          ) : audit.items.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Nenhuma decisão KYC registrada ainda.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {audit.items.slice(0, 10).map((item) => (
                <li key={item.id} className="flex items-center justify-between py-2 text-xs">
                  <code className="font-mono text-primary">{item.action}</code>
                  <span className="text-muted-foreground">{formatDateTime(item.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <Button asChild variant="outline" size="sm" className="mt-2 w-fit">
            <Link href="/audit">Abrir audit log completo</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
