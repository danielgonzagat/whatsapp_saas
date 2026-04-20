'use client';

import Link from 'next/link';
import { useState } from 'react';
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
  adminClientsApi,
  type AdminClientKycStatus,
  type ListClientsResponse,
} from '@/lib/api/admin-clients-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';

const KYC_OPTIONS: Array<{ value: '' | AdminClientKycStatus; label: string }> = [
  { value: '', label: 'Todos os clientes' },
  { value: 'pending', label: 'KYC pendente' },
  { value: 'submitted', label: 'KYC enviado' },
  { value: 'approved', label: 'KYC aprovado' },
  { value: 'rejected', label: 'KYC rejeitado' },
];

function formatDate(value: string | null): string {
  if (!value) {
    return '—';
  }
  try {
    return new Date(value).toLocaleDateString('pt-BR');
  } catch {
    return value;
  }
}

/** Clientes page. */
export default function ClientesPage() {
  const [search, setSearch] = useState('');
  const [kycStatus, setKycStatus] = useState<'' | AdminClientKycStatus>('');

  const { data, error } = useSWR<ListClientsResponse>(['admin/clients', search, kycStatus], () =>
    adminClientsApi.list({
      search: search || undefined,
      kycStatus: kycStatus || undefined,
      take: 60,
    }),
  );

  const items = data?.items ?? [];
  const totalGmv = items.reduce((sum, row) => sum + row.gmvLast30dInCents, 0);
  const activeClients = items.filter((row) => row.gmvLast30dInCents > 0).length;
  const pendingKyc = items.filter(
    (row) => row.kycStatus === 'pending' || row.kycStatus === 'submitted',
  ).length;
  const newClients = items.filter((row) => {
    const createdAt = new Date(row.createdAt).getTime();
    return Date.now() - createdAt <= 30 * 24 * 60 * 60 * 1000;
  }).length;
  const customDomains = items.filter((row) => Boolean(row.customDomain)).length;
  const enterpriseClients = items.filter(
    (row) => (row.plan || '').toUpperCase() === 'ENTERPRISE',
  ).length;
  const healthScore =
    items.length > 0
      ? Math.round(
          items.reduce((sum, row) => {
            let score = 35;
            if (row.gmvLast30dInCents > 0) {
              score += 35;
            }
            if (row.lastSaleAt) {
              score += 15;
            }
            if (row.kycStatus === 'approved') {
              score += 15;
            }
            return sum + Math.min(score, 100);
          }, 0) / items.length,
        )
      : 0;

  return (
    <AdminPage>
      <AdminPageIntro
        eyebrow="CLIENTES"
        title="Clientes"
        description="Visão operacional dos produtores com foco em atividade, KYC e expansão da base."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/contas">Abrir módulo de contas</Link>
          </Button>
        }
      />

      <AdminHeroSplit
        label="GMV 30 dias dos clientes"
        value={totalGmv}
        description="Volume agregado das contas carregadas na lista atual. Use a busca para focar em produtores específicos."
        compactCards={[
          {
            label: 'Clientes ativos',
            value: activeClients,
            kind: 'integer',
            note: 'Com vendas nos últimos 30 dias',
          },
          {
            label: 'KYC pendente',
            value: pendingKyc,
            kind: 'integer',
            note: 'Fila operacional imediata',
          },
          {
            label: 'Novos clientes',
            value: newClients,
            kind: 'integer',
            note: 'Criados nos últimos 30 dias',
          },
          {
            label: 'Domínio próprio',
            value: customDomains,
            kind: 'integer',
            note: 'Clientes com operação em domínio próprio',
          },
        ]}
      />

      <AdminMetricGrid
        items={[
          {
            label: 'Total de clientes',
            value: items.length,
            kind: 'integer',
            detail: 'Base filtrada atual',
          },
          {
            label: 'Produtos publicados',
            value: items.reduce((sum, row) => sum + row.productCount, 0),
            kind: 'integer',
            detail: 'Soma dos catálogos carregados',
          },
          {
            label: 'Com venda recente',
            value: items.filter((row) => row.lastSaleAt).length,
            kind: 'integer',
            detail: 'Última venda registrada',
          },
          {
            label: 'Health score',
            value: healthScore,
            kind: 'integer',
            detail: 'Saúde média da carteira filtrada',
          },
          {
            label: 'Clientes enterprise',
            value: enterpriseClients,
            kind: 'integer',
            detail: 'Plano enterprise ativo na carteira filtrada',
          },
        ]}
      />

      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Filtros"
          description="Encontre rapidamente um produtor e refine a leitura por status de KYC."
        />
        <div className="flex flex-col gap-3 lg:flex-row">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar produtor, workspace ou email"
            className="h-10 flex-1 rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 text-[14px] text-[var(--app-text-primary)] outline-none placeholder:text-[var(--app-text-placeholder)]"
          />
          <select
            value={kycStatus}
            onChange={(event) => setKycStatus(event.target.value as '' | AdminClientKycStatus)}
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
          title="Base de clientes"
          description="Leitura consolidada para operação, relacionamento e priorização comercial."
        />
        {error ? (
          <p className="text-sm text-red-400">
            {error instanceof AdminApiClientError ? error.message : 'Erro ao carregar clientes.'}
          </p>
        ) : items.length === 0 ? (
          <AdminEmptyState
            title="Nenhum cliente encontrado"
            description="Ajuste os filtros ou aguarde novas contas para preencher a superfície."
          />
        ) : (
          <div className="overflow-x-auto rounded-md border border-[var(--app-border-primary)]">
            <table className="w-full min-w-[980px] text-left text-[13px]">
              <thead className="bg-[var(--app-bg-secondary)] text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Contato</th>
                  <th className="px-4 py-3">KYC</th>
                  <th className="px-4 py-3 text-right">Produtos</th>
                  <th className="px-4 py-3 text-right">GMV 30d</th>
                  <th className="px-4 py-3 text-right">Crescimento</th>
                  <th className="px-4 py-3">Plano</th>
                  <th className="px-4 py-3">Última venda</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-border-primary)]">
                {items.map((row) => (
                  <tr key={row.workspaceId} className="bg-[var(--app-bg-card)]">
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-semibold text-[var(--app-text-primary)]">
                          {row.name}
                        </span>
                        <span className="text-[11px] text-[var(--app-text-secondary)]">
                          desde {formatDate(row.createdAt)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-[var(--app-text-primary)]">
                          {row.ownerName ?? '—'}
                        </span>
                        <span className="text-[11px] text-[var(--app-text-secondary)]">
                          {row.ownerEmail ?? '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-secondary)]">
                        {row.kycStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--app-text-primary)]">
                      {row.productCount}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <MetricNumber
                        value={row.gmvLast30dInCents}
                        kind="currency-brl"
                        className="text-[13px] font-semibold text-[var(--app-text-primary)]"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <MetricNumber
                        value={row.growthRate ?? null}
                        kind="percentage"
                        className="text-[13px] font-semibold text-[var(--app-text-primary)]"
                      />
                    </td>
                    <td className="px-4 py-3 text-[var(--app-text-secondary)]">
                      {row.plan ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--app-text-secondary)]">
                      {formatDate(row.lastSaleAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/contas/${row.workspaceId}`}>Abrir conta</Link>
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
