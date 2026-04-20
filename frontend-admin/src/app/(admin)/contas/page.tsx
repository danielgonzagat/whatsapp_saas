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
import { adminSupportApi } from '@/lib/api/admin-support-api';

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

/** Contas page. */
export default function ContasPage() {
  const [search, setSearch] = useState('');
  const [kycStatus, setKycStatus] = useState<'' | AdminAccountKycStatus>('');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { data: supportOverview, mutate: mutateSupport } = useSWR(
    ['admin/support/overview', search],
    () => adminSupportApi.overview(search || undefined),
  );

  const { data, mutate } = useSWR<ListAccountsResponse>(
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
  const selectedCount = selected.length;

  async function applyBulkAction(action: 'SUSPEND' | 'BLOCK' | 'UNBLOCK') {
    if (selected.length === 0) {
      return;
    }
    setBulkBusy(true);
    try {
      await adminAccountsApi.bulkUpdateState({
        workspaceIds: selected,
        action,
        reason:
          action === 'UNBLOCK'
            ? 'Desbloqueio administrativo em massa.'
            : 'Ação administrativa em massa.',
      });
      setSelected([]);
      await mutate();
    } finally {
      setBulkBusy(false);
    }
  }

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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={selectedCount === 0 || bulkBusy}
            onClick={() => applyBulkAction('SUSPEND')}
          >
            Suspender selecionadas
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={selectedCount === 0 || bulkBusy}
            onClick={() => applyBulkAction('BLOCK')}
          >
            Bloquear selecionadas
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={selectedCount === 0 || bulkBusy}
            onClick={() => applyBulkAction('UNBLOCK')}
          >
            Desbloquear selecionadas
          </Button>
          <span className="text-[12px] text-[var(--app-text-secondary)]">
            {selectedCount} workspace(s) selecionada(s)
          </span>
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
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todas as contas"
                      checked={items.length > 0 && selectedCount === items.length}
                      onChange={(event) =>
                        setSelected(
                          event.currentTarget.checked ? items.map((item) => item.workspaceId) : [],
                        )
                      }
                    />
                  </th>
                  <th className="px-4 py-3">Workspace</th>
                  <th className="px-4 py-3">Dono</th>
                  <th className="px-4 py-3">Estado</th>
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
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${item.name}`}
                        checked={selected.includes(item.workspaceId)}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.currentTarget.checked
                              ? [...new Set([...current, item.workspaceId])]
                              : current.filter((value) => value !== item.workspaceId),
                          )
                        }
                      />
                    </td>
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
                      <div className="flex flex-wrap gap-1">
                        {item.suspended ? (
                          <span className="rounded-full border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300">
                            Suspensa
                          </span>
                        ) : null}
                        {item.blocked ? (
                          <span className="rounded-full border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-300">
                            Bloqueada
                          </span>
                        ) : null}
                        {!item.suspended && !item.blocked ? (
                          <span className="rounded-full border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300">
                            Normal
                          </span>
                        ) : null}
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

      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Support"
          description="Fila operacional das conversas abertas da plataforma, integrada ao módulo de contas."
        />
        {(supportOverview?.items ?? []).length === 0 ? (
          <AdminEmptyState
            title="Sem tickets ativos"
            description="A fila operacional de suporte está vazia para o filtro atual."
          />
        ) : (
          <div className="overflow-x-auto rounded-md border border-[var(--app-border-primary)]">
            <table className="w-full min-w-[960px] text-left text-[13px]">
              <thead className="bg-[var(--app-bg-secondary)] text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                <tr>
                  <th className="px-4 py-3">Workspace</th>
                  <th className="px-4 py-3">Contato</th>
                  <th className="px-4 py-3">Canal</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Última mensagem</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-border-primary)]">
                {(supportOverview?.items ?? []).map((ticket) => (
                  <tr key={ticket.conversationId} className="bg-[var(--app-bg-card)]">
                    <td className="px-4 py-3 text-[var(--app-text-primary)]">
                      {ticket.workspaceName}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-[var(--app-text-primary)]">
                          {ticket.contactName || ticket.contactPhone || 'Contato'}
                        </span>
                        <span className="text-[11px] text-[var(--app-text-secondary)]">
                          {ticket.contactEmail || ticket.contactPhone || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--app-text-secondary)]">{ticket.channel}</td>
                    <td className="px-4 py-3 text-[var(--app-text-secondary)]">{ticket.status}</td>
                    <td className="px-4 py-3 text-[var(--app-text-secondary)]">
                      {new Date(ticket.lastMessageAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await adminSupportApi.updateStatus(ticket.conversationId, 'PENDING');
                            await mutateSupport();
                          }}
                        >
                          Pendente
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/contas/suporte/${ticket.conversationId}`}>Abrir</Link>
                        </Button>
                      </div>
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
