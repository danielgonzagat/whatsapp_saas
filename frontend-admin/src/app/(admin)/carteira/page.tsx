'use client';

import {
  AdminEmptyState,
  AdminPage,
  AdminSectionHeader,
  AdminSubinterfaceTabs,
  AdminSurface,
} from '@/components/admin/admin-monitor-ui';
import { MetricNumber } from '@/components/ui/metric-number';
import {
  adminCarteiraApi,
  type ListLedgerResponse,
  type PlatformWalletBalance,
  type PlatformReconcileReport,
} from '@/lib/api/admin-carteira-api';
import { adminDashboardApi, type AdminHomeResponse } from '@/lib/api/admin-dashboard-api';
import { useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useMemo } from 'react';
import useSWR from 'swr';

const TABS = [
  { key: 'saldo', label: 'Saldo' },
  { key: 'extrato', label: 'Extrato' },
  { key: 'saques', label: 'Saques' },
  { key: 'antecipacoes', label: 'Antecipações' },
  { key: 'split', label: 'Split Engine' },
  { key: 'fees', label: 'Fee Management' },
  { key: 'payouts', label: 'Payouts' },
  { key: 'conciliacao', label: 'Conciliação' },
  { key: 'reserva', label: 'Reserva' },
  { key: 'pl', label: 'P&L' },
  { key: 'fiscal', label: 'Fiscal' },
] as const;

const BUCKET_LABEL: Record<string, string> = {
  AVAILABLE: 'Disponível',
  PENDING: 'A receber',
  RESERVED: 'Reserva',
};

const FONT_MONO = "'JetBrains Mono', monospace";

function RevenueBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);

  return (
    <div className="grid h-[180px] grid-cols-7 items-end gap-3">
      {values.map((value, index) => (
        <div key={index} className="flex flex-col items-center gap-2">
          <div className="flex h-[150px] items-end">
            <div
              className="w-6 rounded-t-[4px] bg-[var(--app-accent)]"
              style={{ height: `${Math.max(8, Math.round((value / max) * 140))}px` }}
            />
          </div>
          <div
            className="text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]"
            style={{ fontFamily: FONT_MONO }}
          >
            {index + 1}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CarteiraPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'saldo';

  const { data: balance } = useSWR<PlatformWalletBalance>('admin/carteira/balance', () =>
    adminCarteiraApi.balance(),
  );
  const { data: ledger } = useSWR<ListLedgerResponse>('admin/carteira/ledger', () =>
    adminCarteiraApi.ledger({ take: 40 }),
  );
  const { data: dashboard } = useSWR<AdminHomeResponse>(['admin/dashboard/home', '30D'], () =>
    adminDashboardApi.home({ period: '30D', compare: 'NONE' }),
  );
  const { data: reconcile } = useSWR<PlatformReconcileReport>('admin/carteira/reconcile', () =>
    adminCarteiraApi.reconcile(),
  );

  const revenueBars = useMemo(
    () =>
      (dashboard?.series.revenueKloelDaily || [])
        .map((point: { revenueInCents: number }) => point.revenueInCents)
        .slice(-7),
    [dashboard?.series.revenueKloelDaily],
  );

  return (
    <AdminPage>
      <AdminSubinterfaceTabs
        items={TABS.map((tab) => ({ key: tab.key, label: tab.label }))}
        active={activeTab}
        onChange={(nextTab: string) =>
          startTransition(() => {
            router.push(`/carteira?tab=${encodeURIComponent(nextTab)}`);
          })
        }
      />

      {activeTab === 'saldo' ||
      activeTab === 'extrato' ||
      activeTab === 'saques' ||
      activeTab === 'antecipacoes' ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: 'Saldo disponível',
                value: balance?.availableInCents ?? null,
                note: 'Dinheiro próprio da plataforma',
                tone: 'text-[var(--app-accent)]',
              },
              {
                label: 'A receber',
                value: balance?.pendingInCents ?? null,
                note: 'Liquidação em curso',
                tone: 'text-amber-600',
              },
              {
                label: 'Reserva',
                value: balance?.reservedInCents ?? null,
                note: 'Proteção para chargebacks',
                tone: 'text-[var(--app-text-primary)]',
              },
              {
                label: 'Total acumulado',
                value:
                  balance !== undefined
                    ? (balance.availableInCents || 0) +
                      (balance.pendingInCents || 0) +
                      (balance.reservedInCents || 0)
                    : null,
                note: 'Soma dos buckets operacionais',
                tone: 'text-[var(--app-text-primary)]',
              },
            ].map((item) => (
              <AdminSurface key={item.label} className="px-5 py-5">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                  {item.label}
                </div>
                <MetricNumber
                  value={item.value}
                  kind="currency-brl"
                  className={`text-[28px] font-bold tracking-[-0.04em] ${item.tone}`}
                />
                <div className="mt-2 text-[11px] text-[var(--app-text-secondary)]">{item.note}</div>
              </AdminSurface>
            ))}
          </div>

          {activeTab === 'saldo' ? (
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.88fr)]">
              <AdminSurface className="px-5 py-5 lg:px-6">
                <AdminSectionHeader
                  title="Receita - últimos 7 dias"
                  description="Barras diárias da receita própria da Kloel."
                />
                <RevenueBars
                  values={revenueBars.length > 0 ? revenueBars : Array.from({ length: 7 }, () => 0)}
                />
              </AdminSurface>

              <AdminSurface className="px-5 py-5 lg:px-6">
                <AdminSectionHeader
                  title="Últimas transações"
                  description="Recorte rápido do ledger da plataforma."
                />
                {!ledger || ledger.items.length === 0 ? (
                  <AdminEmptyState
                    title="Nenhuma movimentação recente"
                    description="Assim que entradas e saídas financeiras forem registradas, elas aparecerão aqui."
                  />
                ) : (
                  <div className="grid gap-2">
                    {ledger.items.slice(0, 8).map((row) => (
                      <div
                        key={row.id}
                        className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3"
                      >
                        <div className="mb-1 text-[12px] font-semibold text-[var(--app-text-primary)]">
                          {row.kind}
                        </div>
                        <div className="text-[11px] text-[var(--app-text-secondary)]">
                          {BUCKET_LABEL[row.bucket] || row.bucket} · {row.reason}
                        </div>
                        <div
                          className="mt-2 text-[12px] font-semibold text-[var(--app-text-primary)]"
                          style={{ fontFamily: FONT_MONO }}
                        >
                          {row.direction === 'credit' ? '+' : '-'}
                          <MetricNumber
                            value={row.amountInCents}
                            kind="currency-brl"
                            className="inline text-[12px] font-semibold text-[var(--app-text-primary)]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </AdminSurface>
            </div>
          ) : null}

          {activeTab === 'extrato' ? (
            <AdminSurface className="px-5 py-5 lg:px-6">
              <AdminSectionHeader
                title="Extrato"
                description="Movimentações append-only da conta operacional da Kloel."
              />
              {!ledger || ledger.items.length === 0 ? (
                <AdminEmptyState
                  title="Extrato vazio"
                  description="As linhas do extrato aparecem automaticamente quando o ledger recebe créditos e débitos."
                />
              ) : (
                <div className="overflow-x-auto rounded-md border border-[var(--app-border-primary)]">
                  <table className="w-full min-w-[860px] text-left text-[13px]">
                    <thead className="bg-[var(--app-bg-secondary)] text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                      <tr>
                        <th className="px-4 py-3">Data</th>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Bucket</th>
                        <th className="px-4 py-3">Motivo</th>
                        <th className="px-4 py-3 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--app-border-primary)]">
                      {ledger.items.map((row) => (
                        <tr key={row.id} className="bg-[var(--app-bg-card)]">
                          <td className="px-4 py-3 text-[var(--app-text-secondary)]">
                            {new Date(row.createdAt).toLocaleString('pt-BR')}
                          </td>
                          <td className="px-4 py-3 text-[var(--app-text-primary)]">{row.kind}</td>
                          <td className="px-4 py-3 text-[var(--app-text-secondary)]">
                            {BUCKET_LABEL[row.bucket] || row.bucket}
                          </td>
                          <td className="px-4 py-3 text-[var(--app-text-secondary)]">
                            {row.reason}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <MetricNumber
                              value={
                                row.direction === 'credit' ? row.amountInCents : -row.amountInCents
                              }
                              kind="currency-brl"
                              className="text-[13px] font-semibold text-[var(--app-text-primary)]"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AdminSurface>
          ) : null}

          {activeTab === 'saques' ? (
            <AdminSurface className="px-5 py-5 lg:px-6">
              <AdminSectionHeader
                title="Saques"
                description="Fluxo de saída financeira monitorado a partir do ledger da plataforma."
              />
              <AdminEmptyState
                title="Nenhuma fila ativa"
                description="Os saques operacionais aparecem aqui quando houver solicitações ou liquidações registradas."
              />
            </AdminSurface>
          ) : null}

          {activeTab === 'antecipacoes' ? (
            <AdminSurface className="px-5 py-5 lg:px-6">
              <AdminSectionHeader
                title="Antecipações"
                description="Espaço reservado para a leitura operacional de antecipações."
              />
              <AdminEmptyState
                title="Nenhuma antecipação registrada"
                description="Assim que houver eventos de antecipação, a superfície será preenchida com os dados reais."
              />
            </AdminSurface>
          ) : null}
        </>
      ) : (
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title={TABS.find((tab) => tab.key === activeTab)?.label || 'Módulo'}
            description="Módulos extras do admin encaixados sobre a mesma base visual do app."
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(
              {
                split: [
                  {
                    label: 'Volume separado',
                    value: dashboard?.kpis.gmv.value ?? null,
                    kind: 'currency-brl' as const,
                    detail: 'Base total sobre a qual o split é calculado',
                  },
                  {
                    label: 'Receita Kloel',
                    value: dashboard?.kpis.revenueKloel.value ?? null,
                    kind: 'currency-brl' as const,
                    detail: 'Fatia própria já retida pela plataforma',
                  },
                  {
                    label: 'Entradas no ledger',
                    value: ledger?.items.filter((row) => row.direction === 'credit').length ?? 0,
                    kind: 'integer' as const,
                    detail: 'Créditos append-only observados no período recente',
                  },
                ],
                fees: [
                  {
                    label: 'Take rate',
                    value: dashboard?.kpis.revenueKloelRate.value ?? null,
                    kind: 'percentage' as const,
                    detail: 'Receita Kloel sobre o GMV observado',
                  },
                  {
                    label: 'Ticket médio',
                    value: dashboard?.kpis.averageTicket.value ?? null,
                    kind: 'currency-brl' as const,
                    detail: 'Base média de cobrança para fee planning',
                  },
                  {
                    label: 'Métodos ativos',
                    value: dashboard?.breakdowns.byMethod.length ?? 0,
                    kind: 'integer' as const,
                    detail: 'Métodos com volume no período',
                  },
                ],
                payouts: [
                  {
                    label: 'Saldo disponível',
                    value: balance?.availableInCents ?? null,
                    kind: 'currency-brl' as const,
                    detail: 'Base operacional para liquidação e payout',
                  },
                  {
                    label: 'Débitos de payout',
                    value: ledger?.items.filter((row) => row.kind === 'PAYOUT_DEBIT').length ?? 0,
                    kind: 'integer' as const,
                    detail: 'Saídas registradas no ledger',
                  },
                  {
                    label: 'Liquidação pendente',
                    value: balance?.pendingInCents ?? null,
                    kind: 'currency-brl' as const,
                    detail: 'Receitas ainda em processamento',
                  },
                ],
                conciliacao: [
                  {
                    label: 'Saúde da conciliação',
                    value: reconcile?.healthy ? 1 : 0,
                    kind: 'integer' as const,
                    detail: reconcile?.healthy ? 'Ledger conciliado' : 'Drift detectado',
                  },
                  {
                    label: 'Drift disponível',
                    value: reconcile?.availableDriftInCents ?? 0,
                    kind: 'currency-brl' as const,
                    detail: 'Diferença entre materializado e ledger',
                  },
                  {
                    label: 'Drift reserva',
                    value: reconcile?.reservedDriftInCents ?? 0,
                    kind: 'currency-brl' as const,
                    detail: 'Proteção operacional para chargebacks',
                  },
                ],
                reserva: [
                  {
                    label: 'Reserva atual',
                    value: balance?.reservedInCents ?? null,
                    kind: 'currency-brl' as const,
                    detail: 'Capital retido para proteção',
                  },
                  {
                    label: 'Chargebacks',
                    value: dashboard?.kpis.chargebackCount.value ?? null,
                    kind: 'integer' as const,
                    detail: 'Ocorrências que pressionam a reserva',
                  },
                  {
                    label: 'Chargeback amount',
                    value: dashboard?.kpis.chargebackAmount.value ?? null,
                    kind: 'currency-brl' as const,
                    detail: 'Exposição financeira em disputa',
                  },
                ],
                pl: [
                  {
                    label: 'Revenue Kloel',
                    value: dashboard?.kpis.revenueKloel.value ?? null,
                    kind: 'currency-brl' as const,
                    detail: 'Receita própria da plataforma',
                  },
                  {
                    label: 'Refund amount',
                    value: dashboard?.kpis.refundAmount.value ?? null,
                    kind: 'currency-brl' as const,
                    detail: 'Saídas operacionais por reembolso',
                  },
                  {
                    label: 'Net operacional',
                    value:
                      (dashboard?.kpis.revenueKloel.value ?? 0) -
                      (dashboard?.kpis.refundAmount.value ?? 0) -
                      (dashboard?.kpis.chargebackAmount.value ?? 0),
                    kind: 'currency-brl' as const,
                    detail: 'Revenue menos refund e chargeback',
                  },
                ],
                fiscal: [
                  {
                    label: 'GMV',
                    value: dashboard?.kpis.gmv.value ?? null,
                    kind: 'currency-brl' as const,
                    detail: 'Base bruta para leitura fiscal',
                  },
                  {
                    label: 'Pedidos aprovados',
                    value: dashboard?.kpis.approvedCount.value ?? null,
                    kind: 'integer' as const,
                    detail: 'Volume total aprovado no período',
                  },
                  {
                    label: 'Produtores ativos',
                    value: dashboard?.kpis.activeProducers.value ?? null,
                    kind: 'integer' as const,
                    detail: 'Operação ativa com impacto fiscal',
                  },
                ],
              } as const
            )[
              activeTab as
                | 'split'
                | 'fees'
                | 'payouts'
                | 'conciliacao'
                | 'reserva'
                | 'pl'
                | 'fiscal'
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-4"
              >
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                  {item.label}
                </div>
                <MetricNumber
                  value={item.value}
                  kind={item.kind}
                  className="text-[18px] font-semibold text-[var(--app-text-primary)]"
                />
                <div className="mt-2 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                  {item.detail}
                </div>
              </div>
            ))}
          </div>
        </AdminSurface>
      )}
    </AdminPage>
  );
}
