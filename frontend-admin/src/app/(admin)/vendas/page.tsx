'use client';

import {
  AdminEmptyState,
  AdminPage,
  AdminSectionHeader,
  AdminSubinterfaceTabs,
  AdminSurface,
} from '@/components/admin/admin-monitor-ui';
import { MetricNumber } from '@/components/ui/metric-number';
import { adminSalesApi, type AdminSalesOverviewResponse } from '@/lib/api/admin-sales-api';
import {
  adminTransactionsApi,
  type OrderStatusValue,
  type PaymentMethodValue,
} from '@/lib/api/admin-transactions-api';
import { useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useState } from 'react';
import useSWR from 'swr';

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

const FONT_MONO = "'JetBrains Mono', monospace";

function formatInteger(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
}

function DayBars({ values }: { values: Array<{ label: string; totalInCents: number }> }) {
  const max = Math.max(1, ...values.map((item) => item.totalInCents));

  return (
    <div className="grid h-[180px] grid-cols-7 items-end gap-3">
      {values.map((value, index) => (
        <div key={`${value.label}-${index}`} className="flex flex-col items-center gap-2">
          <div className="flex h-[150px] items-end">
            <div
              className="w-6 rounded-t-[4px] bg-[var(--app-accent)]"
              style={{ height: `${Math.max(8, Math.round((value.totalInCents / max) * 140))}px` }}
            />
          </div>
          <div
            className="text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]"
            style={{ fontFamily: FONT_MONO }}
          >
            {value.label}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function VendasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'vendas';
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | OrderStatusValue>('');
  const [method, setMethod] = useState<'' | PaymentMethodValue>('');
  const [gateway, setGateway] = useState('');
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const { data, mutate } = useSWR<AdminSalesOverviewResponse>(
    ['admin/sales/overview', search, status, method, gateway],
    () =>
      adminSalesApi.overview({
        search: search || undefined,
        status: status || undefined,
        method: method || undefined,
        gateway: gateway || undefined,
      }),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const items = data?.items ?? [];
  const summary = data?.summary;

  async function operate(orderId: string, action: 'REFUND' | 'CHARGEBACK') {
    const note = window.prompt(
      action === 'REFUND'
        ? 'Motivo administrativo do estorno'
        : 'Motivo administrativo do chargeback/fraude',
    );
    if (note === null) return;

    setBusyOrderId(orderId);
    try {
      await adminTransactionsApi.operate(orderId, {
        action,
        note: note || undefined,
      });
      await mutate();
    } finally {
      setBusyOrderId(null);
    }
  }

  return (
    <AdminPage>
      <AdminSubinterfaceTabs
        items={TABS.map((tab) => ({ key: tab.key, label: tab.label }))}
        active={activeTab}
        onChange={(nextTab: string) =>
          startTransition(() => {
            router.push(`/vendas?tab=${encodeURIComponent(nextTab)}`);
          })
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Receita Kloel',
            value: summary?.revenueKloelInCents ?? null,
            detail: 'Receita própria da plataforma',
            tone: 'text-[var(--app-accent)]',
          },
          {
            label: 'GMV',
            value: summary?.gmvInCents ?? null,
            detail: 'GMV separado do dinheiro da Kloel',
            tone: 'text-[var(--app-text-primary)]',
          },
          {
            label: 'Transações',
            value: summary?.transactionCount ?? null,
            detail: 'Linhas na leitura atual',
            tone: 'text-[var(--app-text-primary)]',
            kind: 'integer' as const,
          },
          {
            label: 'Ticket médio',
            value: summary?.averageTicketInCents ?? null,
            detail: 'Média aprovada no período',
            tone: 'text-[var(--app-text-primary)]',
          },
        ].map((item) => (
          <AdminSurface key={item.label} className="px-5 py-5">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
              {item.label}
            </div>
            <MetricNumber
              value={item.value}
              kind={item.kind || 'currency-brl'}
              className={`text-[28px] font-bold tracking-[-0.04em] ${item.tone}`}
            />
            <div className="mt-2 text-[11px] text-[var(--app-text-secondary)]">{item.detail}</div>
          </AdminSurface>
        ))}
      </div>

      {activeTab === 'vendas' ? (
        <>
          <AdminSurface className="px-5 py-5 lg:px-6">
            <AdminSectionHeader
              title="Vendas no período"
              description="A mesma lógica do app: KPIs no topo e um gráfico simples para leitura rápida."
            />
            <DayBars
              values={
                data?.chart.length
                  ? data.chart
                  : Array.from({ length: 7 }, (_, index) => ({
                      label: `${index + 1}`,
                      totalInCents: 0,
                    }))
              }
            />
          </AdminSurface>

          <AdminSurface className="px-5 py-5 lg:px-6">
            <AdminSectionHeader
              title="Filtros"
              description="Busque por cliente ou produtor, e refine por status, método e gateway."
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
              <select
                value={gateway}
                onChange={(event) => setGateway(event.target.value)}
                className="h-10 rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 text-[14px] text-[var(--app-text-primary)] outline-none"
              >
                <option value="">Todos os gateways</option>
                {(data?.gatewayOptions ?? []).map((option) => (
                  <option key={option} value={option || ''}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </AdminSurface>

          <AdminSurface className="px-5 py-5 lg:px-6">
            <AdminSectionHeader
              title="Gestão de vendas"
              description="Tabela consolidada com visão global da plataforma."
            />
            {items.length === 0 ? (
              <AdminEmptyState
                title="Nenhuma venda encontrada"
                description="Pedidos aparecerão aqui quando as transações combinarem com o filtro selecionado."
              />
            ) : (
              <div className="overflow-x-auto rounded-md border border-[var(--app-border-primary)]">
                <table className="w-full min-w-[1240px] text-left text-[13px]">
                  <thead className="bg-[var(--app-bg-secondary)] text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                    <tr>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Produtor</th>
                      <th className="px-4 py-3">Método</th>
                      <th className="px-4 py-3">Gateway</th>
                      <th className="px-4 py-3">Afiliado</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Ações</th>
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
                        <td className="px-4 py-3 text-[var(--app-text-secondary)]">
                          {item.affiliateId || '—'}
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
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => operate(item.id, 'REFUND')}
                              disabled={busyOrderId === item.id || item.status !== 'PAID'}
                              className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {busyOrderId === item.id ? 'Processando' : 'Estornar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => operate(item.id, 'CHARGEBACK')}
                              disabled={
                                busyOrderId === item.id ||
                                item.status === 'REFUNDED' ||
                                item.status === 'CHARGEBACK'
                              }
                              className="rounded-md border border-red-500/25 bg-red-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Marcar fraude
                            </button>
                          </div>
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
            description="Mesma superfície do app, agora em modo global."
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              {
                label: 'MRR',
                value: summary?.mrrProjectedInCents ?? null,
                kind: 'currency-brl' as const,
                detail: 'Receita recorrente mensal projetada',
              },
              {
                label: 'Assinaturas ativas',
                value:
                  summary !== undefined
                    ? Math.max(
                        summary.paidCount - summary.refundedCount - summary.chargebackCount,
                        0,
                      )
                    : null,
                kind: 'integer' as const,
                detail: 'Base recorrente estimada a partir das cobranças pagas',
              },
              {
                label: 'Churn rate',
                value: summary?.churnRate ?? null,
                kind: 'percentage' as const,
                detail: 'Cancelamentos sobre a base recorrente',
              },
              {
                label: 'LTV médio',
                value: summary?.averageTicketInCents ?? null,
                kind: 'currency-brl' as const,
                detail: 'Valor médio por cobrança aprovada',
              },
              {
                label: 'ARR projetado',
                value: summary?.arrProjectedInCents ?? null,
                kind: 'currency-brl' as const,
                detail: 'Projeção anual derivada do MRR atual',
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
                  kind={item.kind}
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
            description="Fulfillment global da plataforma."
          />
          <div className="grid gap-3 md:grid-cols-4">
            {[
              { label: 'Pedidos totais', value: summary?.transactionCount ?? 0 },
              { label: 'Aguardando envio', value: summary?.pendingCount ?? 0 },
              { label: 'Em trânsito', value: summary?.shippedCount ?? 0 },
              { label: 'Entregues', value: summary?.deliveredCount ?? 0 },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-4"
              >
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                  {item.label}
                </div>
                <div className="text-[24px] font-bold tracking-[-0.04em] text-[var(--app-text-primary)]">
                  {formatInteger(item.value)}
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
            description="Visão macro do fluxo comercial e operacional."
          />
          <div className="grid gap-3 md:grid-cols-4">
            {[
              { label: 'Pago', value: summary?.paidCount ?? 0 },
              { label: 'Pendente', value: summary?.pendingCount ?? 0 },
              { label: 'Reembolsado', value: summary?.refundedCount ?? 0 },
              { label: 'Chargeback', value: summary?.chargebackCount ?? 0 },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-4"
              >
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                  {item.label}
                </div>
                <div className="text-[24px] font-bold tracking-[-0.04em] text-[var(--app-text-primary)]">
                  {formatInteger(item.value)}
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
            description="Leitura operacional e comercial sem expor metadados de desenvolvimento."
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              {
                label: 'Recuperar carrinhos',
                value: summary?.pendingCount ?? 0,
                kind: 'integer' as const,
                detail: 'Pedidos pendentes aguardando recuperação ou pagamento.',
              },
              {
                label: 'Escalar recorrência',
                value: summary?.mrrProjectedInCents ?? 0,
                kind: 'currency-brl' as const,
                detail: 'MRR projetado para a base recorrente ativa.',
              },
              {
                label: 'Cobrança imediata',
                value: summary?.paidCount ?? 0,
                kind: 'integer' as const,
                detail: 'Pedidos pagos já liquidados na janela atual.',
              },
              {
                label: 'Fulfillment físico',
                value: (summary?.shippedCount ?? 0) + (summary?.deliveredCount ?? 0),
                kind: 'integer' as const,
                detail: 'Pedidos físicos já enviados ou concluídos.',
              },
              {
                label: 'Pipeline comercial',
                value: summary?.transactionCount ?? 0,
                kind: 'integer' as const,
                detail: 'Volume total de linhas operacionais carregadas na leitura.',
              },
              {
                label: 'Monitorar chargebacks',
                value: summary?.chargebackCount ?? 0,
                kind: 'integer' as const,
                detail: 'Pedidos em disputa que precisam de atenção operacional.',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-4"
              >
                <div className="mb-2 text-[14px] font-semibold text-[var(--app-text-primary)]">
                  {item.label}
                </div>
                <div className="text-[24px] font-bold tracking-[-0.04em] text-[var(--app-accent)]">
                  {item.kind === 'currency-brl' ? (
                    <MetricNumber
                      value={item.value}
                      kind="currency-brl"
                      className="text-[24px] font-bold tracking-[-0.04em] text-[var(--app-accent)]"
                    />
                  ) : (
                    formatInteger(item.value)
                  )}
                </div>
                <div className="mt-2 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                  {item.detail}
                </div>
              </div>
            ))}
          </div>
        </AdminSurface>
      ) : null}
    </AdminPage>
  );
}
