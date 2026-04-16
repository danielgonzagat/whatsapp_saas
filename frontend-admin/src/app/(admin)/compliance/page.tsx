'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { MetricNumber } from '@/components/ui/metric-number';
import {
  AdminEmptyState,
  AdminHeroSplit,
  AdminMetricGrid,
  AdminPage,
  AdminPageIntro,
  AdminSectionHeader,
  AdminSurface,
} from '@/components/admin/admin-monitor-ui';
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
  const { data: chargebacks, error: cbError } = useSWR<ListTransactionsResponse>(
    'admin/transactions?status=CHARGEBACK',
    () => adminTransactionsApi.list({ status: 'CHARGEBACK', take: 50 }),
    { refreshInterval: 60_000 },
  );

  const { data: refunds, error: rfError } = useSWR<ListTransactionsResponse>(
    'admin/transactions?status=REFUNDED',
    () => adminTransactionsApi.list({ status: 'REFUNDED', take: 50 }),
    { refreshInterval: 60_000 },
  );

  const { data: audit } = useSWR<AdminAuditListResponse>(
    'admin/audit?action=kyc',
    () => adminAuditApi.list({ action: 'kyc', take: 20 }),
    { refreshInterval: 60_000 },
  );

  const chargebackItems = chargebacks?.items ?? [];
  const refundItems = refunds?.items ?? [];
  const auditItems = audit?.items ?? [];

  return (
    <AdminPage>
      <AdminPageIntro
        eyebrow="RISCO OPERACIONAL"
        title="Compliance"
        description="Monitoramento global de chargebacks, reembolsos e decisões operacionais de KYC."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/audit">Abrir audit log</Link>
          </Button>
        }
      />

      <AdminHeroSplit
        label="Valor sob observação"
        value={chargebacks?.sum.totalInCents ?? null}
        description="Total em chargebacks abertos na plataforma. Use esta visão para priorizar tratativas e revisar anomalias."
        compactCards={[
          {
            label: 'Chargebacks',
            value: chargebacks?.total ?? null,
            kind: 'integer',
            note: 'Ocorrências abertas',
          },
          {
            label: 'Reembolsos',
            value: refunds?.total ?? null,
            kind: 'integer',
            note: 'Ocorrências recentes',
          },
          {
            label: 'Valor reembolsado',
            value: refunds?.sum.totalInCents ?? null,
            note: 'Últimos registros carregados',
          },
          {
            label: 'Eventos KYC',
            value: auditItems.length,
            kind: 'integer',
            note: 'Feed operacional recente',
          },
        ]}
      />

      <AdminMetricGrid
        items={[
          {
            label: 'Contestações abertas',
            value: chargebackItems.length,
            kind: 'integer',
            detail: 'Fila atual de disputa',
          },
          {
            label: 'Clientes impactados',
            value: new Set(chargebackItems.map((item) => item.customerEmail)).size,
            kind: 'integer',
            detail: 'E-mails únicos com chargeback',
          },
          {
            label: 'Gateways em disputa',
            value: new Set(chargebackItems.map((item) => item.gateway).filter(Boolean)).size,
            kind: 'integer',
            detail: 'Integrações com eventos ativos',
          },
          {
            label: 'Decisões KYC',
            value: auditItems.length,
            kind: 'integer',
            detail: 'Eventos disponíveis no feed atual',
          },
        ]}
      />

      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Chargebacks abertos"
          description="Pedidos em disputa com leitura rápida de cliente, valor e data do evento."
        />
        {cbError ? (
          <p className="text-sm text-red-400">
            {cbError instanceof AdminApiClientError
              ? cbError.message
              : 'Erro ao carregar chargebacks.'}
          </p>
        ) : chargebackItems.length === 0 ? (
          <AdminEmptyState
            title="Nenhum chargeback aberto"
            description="Quando surgirem disputas elas aparecem aqui para tratamento prioritário."
          />
        ) : (
          <div className="overflow-x-auto rounded-md border border-[var(--app-border-primary)]">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead className="bg-[var(--app-bg-secondary)] text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                <tr>
                  <th className="px-4 py-3">Pedido</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Workspace</th>
                  <th className="px-4 py-3">Gateway</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-border-primary)]">
                {chargebackItems.map((row) => (
                  <tr key={row.id} className="bg-[var(--app-bg-card)]">
                    <td className="px-4 py-3 font-mono text-[12px] text-[var(--app-text-primary)]">
                      {row.orderNumber}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-[var(--app-text-primary)]">
                          {row.customerName}
                        </span>
                        <span className="text-[11px] text-[var(--app-text-secondary)]">
                          {row.customerEmail}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--app-text-secondary)]">
                      {row.workspaceName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--app-text-secondary)]">
                      {row.gateway ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <MetricNumber
                        value={row.totalInCents}
                        kind="currency-brl"
                        className="text-[13px] font-semibold text-[var(--app-text-primary)]"
                      />
                    </td>
                    <td className="px-4 py-3 text-[var(--app-text-secondary)]">
                      {formatDateTime(row.paidAt ?? row.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSurface>

      <div className="grid gap-3 lg:grid-cols-2">
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="Reembolsos recentes"
            description="Últimos reembolsos processados na plataforma."
          />
          {rfError ? (
            <p className="text-sm text-red-400">
              {rfError instanceof AdminApiClientError
                ? rfError.message
                : 'Erro ao carregar reembolsos.'}
            </p>
          ) : refundItems.length === 0 ? (
            <AdminEmptyState
              title="Nenhum reembolso recente"
              description="A superfície será preenchida assim que houver movimentação."
            />
          ) : (
            <ul className="divide-y divide-[var(--app-border-primary)] overflow-hidden rounded-md border border-[var(--app-border-primary)]">
              {refundItems.slice(0, 8).map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-4 bg-[var(--app-bg-card)] px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-[12px] text-[var(--app-text-primary)]">
                      {row.orderNumber}
                    </div>
                    <div className="truncate text-[11px] text-[var(--app-text-secondary)]">
                      {row.customerEmail}
                    </div>
                  </div>
                  <MetricNumber
                    value={row.totalInCents}
                    kind="currency-brl"
                    className="text-[13px] font-semibold text-[var(--app-text-primary)]"
                  />
                </li>
              ))}
            </ul>
          )}
        </AdminSurface>

        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="Eventos KYC recentes"
            description="Leitura rápida das últimas decisões registradas pela operação."
          />
          {auditItems.length === 0 ? (
            <AdminEmptyState
              title="Nenhum evento recente"
              description="Assim que o time registrar novas decisões elas aparecem aqui."
            />
          ) : (
            <ul className="divide-y divide-[var(--app-border-primary)] overflow-hidden rounded-md border border-[var(--app-border-primary)]">
              {auditItems.slice(0, 8).map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 bg-[var(--app-bg-card)] px-4 py-3"
                >
                  <div>
                    <div className="font-mono text-[12px] text-[var(--app-accent)]">
                      {item.action}
                    </div>
                    <div className="text-[11px] text-[var(--app-text-secondary)]">
                      {item.adminUser?.name ?? 'Operação'} • {item.entityType ?? 'KYC'}
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-[var(--app-text-secondary)]">
                    {formatDateTime(item.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminSurface>
      </div>
    </AdminPage>
  );
}
