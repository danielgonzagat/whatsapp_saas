'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { MetricNumber } from '@/components/ui/metric-number';
import {
  AdminEmptyState,
  AdminMetricGrid,
  AdminPage,
  AdminPageIntro,
  AdminSectionHeader,
  AdminSurface,
} from '@/components/admin/admin-monitor-ui';
import {
  adminAccountsApi,
  type AdminAccountKycStatus,
  type ListAccountsResponse,
} from '@/lib/api/admin-accounts-api';

const KYC_OPTIONS: Array<{ value: '' | AdminAccountKycStatus; label: string }> = [
  { value: '', label: 'Todos KYC' },
  { value: 'pending', label: 'Pendente' },
  { value: 'submitted', label: 'Enviado' },
  { value: 'approved', label: 'Aprovado' },
  { value: 'rejected', label: 'Rejeitado' },
];

function kycLabel(value: AdminAccountKycStatus) {
  return value;
}

export default function ContasPage() {
  const [search, setSearch] = useState('');
  const [kycStatus, setKycStatus] = useState<'' | AdminAccountKycStatus>('');

  const { data } = useSWR<ListAccountsResponse>(
    ['admin/accounts', search, kycStatus],
    () =>
      adminAccountsApi.list({
        search: search || undefined,
        kycStatus: kycStatus || undefined,
        take: 60,
      }),
    { revalidateOnFocus: false },
  );

  const items = data?.items || [];

  return (
    <AdminPage>
      <AdminPageIntro
        eyebrow="WORKSPACES"
        title="Contas"
        description="Todas as contas da plataforma com leitura de KYC, GMV e operação recente."
      />

      <AdminMetricGrid
        items={[
          {
            label: 'Total de contas',
            value: items.length,
            kind: 'integer',
            detail: 'Lista filtrada atual',
          },
          {
            label: 'Contas ativas',
            value: items.filter((item) => item.gmvLast30dInCents > 0).length,
            kind: 'integer',
            detail: 'Com GMV nos últimos 30 dias',
            tone: 'text-[var(--app-accent)]',
          },
          {
            label: 'Pendentes de KYC',
            value: items.filter(
              (item) => item.kycStatus === 'pending' || item.kycStatus === 'submitted',
            ).length,
            kind: 'integer',
            detail: 'Fila operacional',
          },
          {
            label: 'GMV 30d',
            value: items.reduce((sum, item) => sum + item.gmvLast30dInCents, 0),
            detail: 'Soma das contas carregadas',
          },
        ]}
      />

      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Filtros"
          description="Busque por workspace ou email do dono e refine a fila por KYC."
          actions={
            <Button asChild size="sm" variant="outline">
              <Link href="/contas/kyc">Abrir fila de KYC</Link>
            </Button>
          }
        />
        <div className="flex flex-col gap-3 lg:flex-row">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar workspace ou email"
            className="h-10 flex-1 rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 text-[14px] text-[var(--app-text-primary)] outline-none placeholder:text-[var(--app-text-placeholder)]"
          />
          <select
            value={kycStatus}
            onChange={(event) => setKycStatus(event.target.value as '' | AdminAccountKycStatus)}
            className="h-10 rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 text-[14px] text-[var(--app-text-primary)] outline-none"
          >
            {KYC_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </AdminSurface>

      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Lista de contas"
          description="Mesmo peso visual do app principal, com foco na leitura e na ação rápida."
        />
        {items.length === 0 ? (
          <AdminEmptyState
            title="Nenhuma conta encontrada"
            description="Ajuste os filtros ou aguarde novos cadastros para preencher a superfície."
          />
        ) : (
          <div className="overflow-x-auto rounded-md border border-[var(--app-border-primary)]">
            <table className="w-full min-w-[960px] text-left text-[13px]">
              <thead className="bg-[var(--app-bg-secondary)] text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
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
              <tbody className="divide-y divide-[var(--app-border-primary)]">
                {items.map((item) => (
                  <tr key={item.workspaceId} className="bg-[var(--app-bg-card)]">
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-semibold text-[var(--app-text-primary)]">
                          {item.name}
                        </span>
                        <span className="text-[11px] text-[var(--app-text-secondary)]">
                          desde {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-[var(--app-text-primary)]">
                          {item.ownerName || '—'}
                        </span>
                        <span className="text-[11px] text-[var(--app-text-secondary)]">
                          {item.ownerEmail || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-secondary)]">
                        {kycLabel(item.kycStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <MetricNumber
                        value={item.gmvLast30dInCents}
                        kind="currency-brl"
                        className="text-[13px] font-semibold text-[var(--app-text-primary)]"
                      />
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--app-text-primary)]">
                      {item.productCount}
                    </td>
                    <td className="px-4 py-3 text-[var(--app-text-secondary)]">
                      {item.lastSaleAt
                        ? new Date(item.lastSaleAt).toLocaleDateString('pt-BR')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/contas/${item.workspaceId}`}>Ver detalhe</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSurface>
    </AdminPage>
  );
}
