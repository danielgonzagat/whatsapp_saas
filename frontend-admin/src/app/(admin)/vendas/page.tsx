'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useMemo, useState } from 'react';
import useSWR from 'swr';
import { MetricNumber } from '@/components/ui/metric-number';
import {
  AdminEmptyState,
  AdminMetricGrid,
  AdminPage,
  AdminPageIntro,
  AdminPillTabs,
  AdminSectionHeader,
  AdminSurface,
} from '@/components/admin/admin-monitor-ui';
import {
  adminTransactionsApi,
  type ListTransactionsResponse,
  type OrderStatusValue,
  type PaymentMethodValue,
} from '@/lib/api/admin-transactions-api';

const TABS = [
  { key: 'vendas', label: 'Gestão de Vendas' },
  { key: 'assinaturas', label: 'Assinaturas' },
  { key: 'fisicos', label: 'Produtos Físicos' },
  { key: 'pipeline', label: 'Pipeline CRM' },
  { key: 'estrategias', label: 'Estratégias' },
] as const;

const STATUS_OPTIONS: Array<{ value: '' | OrderStatusValue; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'PAID', label: 'Pago' },
  { value: 'PENDING', label: 'Pendente' },
  { value: 'REFUNDED', label: 'Reembolsado' },
  { value: 'CHARGEBACK', label: 'Chargeback' },
];

const METHOD_OPTIONS: Array<{ value: '' | PaymentMethodValue; label: string }> = [
  { value: '', label: 'Todos os métodos' },
  { value: 'CREDIT_CARD', label: 'Cartão' },
  { value: 'PIX', label: 'PIX' },
  { value: 'BOLETO', label: 'Boleto' },
];

const METHOD_LABELS: Record<PaymentMethodValue, string> = {
  CREDIT_CARD: 'Cartão',
  PIX: 'PIX',
  BOLETO: 'Boleto',
};

export default function VendasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'vendas';
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | OrderStatusValue>('');
  const [method, setMethod] = useState<'' | PaymentMethodValue>('');

  const { data } = useSWR<ListTransactionsResponse>(
    ['admin/transactions', activeTab, search, status, method],
    () =>
      adminTransactionsApi.list({
        search: search || undefined,
        status: status || undefined,
        method: method || undefined,
        take: 80,
      }),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const items = data?.items || [];
  const paidCount = items.filter((item) => item.status === 'PAID').length;
  const pendingCount = items.filter(
    (item) => item.status === 'PENDING' || item.status === 'PROCESSING',
  ).length;
  const refundedCount = items.filter((item) => item.status === 'REFUNDED').length;
  const averageTicket =
    items.length > 0
      ? Math.round(items.reduce((sum, item) => sum + item.totalInCents, 0) / items.length)
      : null;

  const pipelineGroups = useMemo(
    () => [
      { label: 'Pagamento', count: paidCount },
      { label: 'Pendente', count: pendingCount },
      {
        label: 'Entrega',
        count: items.filter((item) => item.status === 'SHIPPED' || item.status === 'DELIVERED')
          .length,
      },
      { label: 'Risco', count: items.filter((item) => item.status === 'CHARGEBACK').length },
    ],
    [items, paidCount, pendingCount],
  );

  return (
    <AdminPage>
      <AdminPageIntro
        eyebrow="OPERAÇÃO FINANCEIRA"
        title="Vendas"
        description="Transações, recorrência e pipeline comercial da plataforma inteira no mesmo padrão visual do app."
      />

      <AdminPillTabs
        items={TABS.map((tab) => ({ key: tab.key, label: tab.label }))}
        active={activeTab}
        onChange={(nextTab) =>
          startTransition(() => {
            router.push(`/vendas?tab=${encodeURIComponent(nextTab)}`);
          })
        }
      />

      <AdminMetricGrid
        items={[
          {
            label: 'Faturamento total',
            value: data?.sum.totalInCents ?? null,
            detail: 'Volume filtrado na leitura atual',
            tone: 'text-[var(--app-accent)]',
          },
          {
            label: 'Transações',
            value: items.length,
            kind: 'integer',
            detail: 'Linhas retornadas pela API',
          },
          {
            label: 'Pendentes',
            value: pendingCount,
            kind: 'integer',
            detail: 'Aguardando decisão ou pagamento',
          },
          {
            label: 'Ticket médio',
            value: averageTicket,
            detail: 'Média por transação carregada',
          },
        ]}
      />

      {activeTab === 'vendas' ? (
        <>
          <AdminSurface className="px-5 py-5 lg:px-6">
            <AdminSectionHeader
              title="Filtros"
              description="Busque por cliente ou produtor e refine o recorte por status e método."
            />
            <div className="flex flex-col gap-3 lg:flex-row">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por cliente, email ou produtor..."
                className="h-10 flex-1 rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 text-[14px] text-[var(--app-text-primary)] outline-none placeholder:text-[var(--app-text-placeholder)]"
              />
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as '' | OrderStatusValue)}
                className="h-10 rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 text-[14px] text-[var(--app-text-primary)] outline-none"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={method}
                onChange={(event) => setMethod(event.target.value as '' | PaymentMethodValue)}
                className="h-10 rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 text-[14px] text-[var(--app-text-primary)] outline-none"
              >
                {METHOD_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </AdminSurface>

          <AdminSurface className="px-5 py-5 lg:px-6">
            <AdminSectionHeader
              title="Gestão de vendas"
              description="Tabela consolidada de toda a plataforma."
            />
            {items.length === 0 ? (
              <AdminEmptyState
                title="Nenhuma venda encontrada"
                description="Pedidos aparecerão aqui quando as transações combinarem com o filtro selecionado."
              />
            ) : (
              <div className="overflow-x-auto rounded-md border border-[var(--app-border-primary)]">
                <table className="w-full min-w-[980px] text-left text-[13px]">
                  <thead className="bg-[var(--app-bg-secondary)] text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                    <tr>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Produtor</th>
                      <th className="px-4 py-3">Método</th>
                      <th className="px-4 py-3">Gateway</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--app-border-primary)]">
                    {items.map((item) => (
                      <tr key={item.id} className="bg-[var(--app-bg-card)]">
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-medium text-[var(--app-text-primary)]">
                              {item.customerName}
                            </span>
                            <span className="text-[12px] text-[var(--app-text-secondary)]">
                              {item.customerEmail}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[var(--app-text-secondary)]">
                          {item.workspaceName || item.workspaceId}
                        </td>
                        <td className="px-4 py-3 text-[var(--app-text-secondary)]">
                          {METHOD_LABELS[item.paymentMethod]}
                        </td>
                        <td className="px-4 py-3 text-[var(--app-text-secondary)]">
                          {item.gateway || '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <MetricNumber
                            value={item.totalInCents}
                            kind="currency-brl"
                            className="text-[13px] font-semibold text-[var(--app-text-primary)]"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-secondary)]">
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[var(--app-text-secondary)]">
                          {new Date(item.paidAt || item.createdAt).toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminSurface>
        </>
      ) : null}

      {activeTab === 'assinaturas' ? (
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="Assinaturas"
            description="Camada visual no padrão do app. Os indicadores globais aparecem sem expor backlog técnico."
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: 'MRR', value: null, kind: 'currency-brl', detail: 'Dados sendo coletados' },
              {
                label: 'Assinaturas ativas',
                value: null,
                kind: 'integer',
                detail: 'Dados sendo coletados',
              },
              {
                label: 'Churn rate',
                value: null,
                kind: 'percentage',
                detail: 'Dados sendo coletados',
              },
              {
                label: 'LTV médio',
                value: null,
                kind: 'currency-brl',
                detail: 'Dados sendo coletados',
              },
              {
                label: 'ARR projetado',
                value: null,
                kind: 'currency-brl',
                detail: 'Dados sendo coletados',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-4"
              >
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                  {item.label}
                </div>
                <MetricNumber
                  value={item.value}
                  kind={item.kind as any}
                  className="text-[24px] font-bold tracking-[-0.04em]"
                />
                <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                  {item.detail}
                </div>
              </div>
            ))}
          </div>
        </AdminSurface>
      ) : null}

      {activeTab === 'fisicos' ? (
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="Produtos físicos"
            description="Leitura de fulfillment usando os status já consolidados na transação."
          />
          <div className="grid gap-3 md:grid-cols-4">
            {[
              { label: 'Pedidos totais', value: items.length },
              {
                label: 'Aguardando envio',
                value: items.filter((item) => item.status === 'PROCESSING').length,
              },
              {
                label: 'Em trânsito',
                value: items.filter((item) => item.status === 'SHIPPED').length,
              },
              {
                label: 'Entregues',
                value: items.filter((item) => item.status === 'DELIVERED').length,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-4"
              >
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                  {item.label}
                </div>
                <div className="text-[24px] font-bold tracking-[-0.04em] text-[var(--app-text-primary)]">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </AdminSurface>
      ) : null}

      {activeTab === 'pipeline' ? (
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="Pipeline CRM"
            description="Visão macro do fluxo operacional com os status disponíveis na camada transacional."
          />
          <div className="grid gap-3 md:grid-cols-4">
            {pipelineGroups.map((group) => (
              <div
                key={group.label}
                className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-4"
              >
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                  {group.label}
                </div>
                <div className="text-[24px] font-bold tracking-[-0.04em] text-[var(--app-text-primary)]">
                  {group.count}
                </div>
              </div>
            ))}
          </div>
        </AdminSurface>
      ) : null}

      {activeTab === 'estrategias' ? (
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="Estratégias"
            description="Superfície administrativa para leitura e decisão, sem metadados de desenvolvimento expostos."
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              'Recuperar carrinhos',
              'Oferecer order bump',
              'Escalar recorrência',
              'Cobrança imediata',
              'Fulfillment físico',
              'Pipeline comercial',
            ].map((label) => (
              <div
                key={label}
                className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-4"
              >
                <div className="mb-2 text-[14px] font-semibold text-[var(--app-text-primary)]">
                  {label}
                </div>
                <div className="text-[12px] leading-6 text-[var(--app-text-secondary)]">
                  Dados sendo coletados para esta leitura estratégica.
                </div>
              </div>
            ))}
          </div>
        </AdminSurface>
      ) : null}
    </AdminPage>
  );
}
