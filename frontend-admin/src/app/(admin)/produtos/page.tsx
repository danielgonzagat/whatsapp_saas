'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { MetricNumber } from '@/components/ui/metric-number';
import {
  AdminEmptyState,
  AdminHeroSplit,
  AdminPage,
  AdminPageIntro,
  AdminPillTabs,
  AdminSectionHeader,
  AdminSurface,
  AdminTicker,
} from '@/components/admin/admin-monitor-ui';
import {
  adminProductsApi,
  type AdminProductRow,
  type ListProductsResponse,
} from '@/lib/api/admin-products-api';

const TABS = [
  { key: 'todos', label: 'Todos os Produtos' },
  { key: 'moderacao', label: 'Fila de Moderação' },
  { key: 'produtor', label: 'Por Produtor' },
  { key: 'marketplace', label: 'Marketplace' },
] as const;

function currencyValue(label: string, value: number | null | undefined) {
  return { label, value, kind: 'currency-brl' as const };
}

function statusTone(status: string) {
  switch (status) {
    case 'APPROVED':
    case 'ACTIVE':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600';
    case 'PENDING':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-700';
    case 'REJECTED':
      return 'border-red-500/30 bg-red-500/10 text-red-600';
    default:
      return 'border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] text-[var(--app-text-secondary)]';
  }
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export default function ProdutosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'todos';
  const [search, setSearch] = useState('');
  const [workspaceFilter, setWorkspaceFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const apiStatus = activeTab === 'moderacao' ? 'PENDING' : undefined;
  const { data, mutate } = useSWR<ListProductsResponse>(
    ['admin/products', activeTab, search, workspaceFilter],
    () =>
      adminProductsApi.list({
        search: search || undefined,
        status: apiStatus,
        take: 60,
      }),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const items = useMemo(
    () =>
      (data?.items || []).filter((item) =>
        workspaceFilter ? (item.workspaceName || item.workspaceId) === workspaceFilter : true,
      ),
    [data?.items, workspaceFilter],
  );
  const totalRevenueProxy = useMemo(
    () => items.reduce((sum, item) => sum + item.priceInCents, 0),
    [items],
  );
  const workspaceOptions = useMemo(
    () => Array.from(new Set(items.map((item) => item.workspaceName).filter(Boolean))).sort(),
    [items],
  );
  const tickerItems = useMemo(
    () =>
      items
        .slice()
        .sort((left, right) => right.priceInCents - left.priceInCents)
        .slice(0, 10)
        .map((item) => `${item.name} · ${formatMoney(item.priceInCents)}`),
    [items],
  );

  async function approveProduct(product: AdminProductRow) {
    setBusyId(product.id);
    try {
      await adminProductsApi.approve(product.id);
      await mutate();
    } finally {
      setBusyId(null);
    }
  }

  async function rejectProduct(product: AdminProductRow) {
    const reason = window.prompt('Motivo da rejeição');
    if (!reason) return;

    setBusyId(product.id);
    try {
      await adminProductsApi.reject(product.id, reason);
      await mutate();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminPage>
      <AdminPageIntro
        eyebrow="CATÁLOGO GLOBAL"
        title="Produtos"
        description="Todos os produtos da plataforma Kloel, com moderação e leitura operacional em uma mesma superfície."
      />

      <AdminPillTabs
        items={TABS.map((tab) => ({ key: tab.key, label: tab.label }))}
        active={activeTab}
        onChange={(nextTab) => {
          startTransition(() => {
            router.push(`/produtos?tab=${encodeURIComponent(nextTab)}`);
          });
        }}
      />

      <AdminHeroSplit
        label="Receita total da plataforma"
        value={totalRevenueProxy}
        description="Proxy de catálogo calculado a partir dos preços ativos carregados na vitrine administrativa."
        compactCards={[
          {
            label: 'Produtos carregados',
            value: items.length,
            kind: 'integer',
            note: 'Lista filtrada atual',
          },
          {
            label: 'Pendentes',
            value: items.filter((item) => item.status === 'PENDING').length,
            kind: 'integer',
            note: 'Na fila de moderação',
          },
          {
            label: 'Aprovados',
            value: items.filter((item) => item.status === 'APPROVED' || item.status === 'ACTIVE')
              .length,
            kind: 'integer',
            note: 'Ativos no catálogo',
          },
          {
            label: 'Rascunhos',
            value: items.filter((item) => item.status === 'DRAFT').length,
            kind: 'integer',
            note: 'Ainda não publicados',
          },
        ]}
      />

      <AdminTicker items={tickerItems} />

      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Filtros"
          description="Busque por nome, categoria ou produtor. Na aba de moderação a lista já entra filtrada por pendentes."
        />
        <div className="flex flex-col gap-3 lg:flex-row">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar produto, categoria ou descrição"
            className="h-10 flex-1 rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 text-[14px] text-[var(--app-text-primary)] outline-none placeholder:text-[var(--app-text-placeholder)]"
          />
          <select
            value={workspaceFilter}
            onChange={(event) => setWorkspaceFilter(event.target.value)}
            className="h-10 rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 text-[14px] text-[var(--app-text-primary)] outline-none"
          >
            <option value="">Todos os produtores</option>
            {workspaceOptions.map((workspaceName) => (
              <option key={workspaceName} value={workspaceName || ''}>
                {workspaceName}
              </option>
            ))}
          </select>
        </div>
      </AdminSurface>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title={activeTab === 'moderacao' ? 'Fila de moderação' : 'Todos os produtos'}
            description="Cards ricos no padrão visual do app, com thumbnail, preço, produtor e status."
          />

          {items.length === 0 ? (
            <AdminEmptyState
              title="Nenhum produto encontrado"
              description="Ajuste os filtros ou aguarde novos cadastros. Assim que houver catálogo, ele aparece aqui."
            />
          ) : (
            <div className="grid gap-3">
              {items.map((product) => (
                <div
                  key={product.id}
                  className="group grid gap-4 rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] p-4 lg:grid-cols-[88px_minmax(0,1fr)_auto]"
                >
                  <div className="overflow-hidden rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-card)]">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt=""
                        className="aspect-square h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square items-center justify-center text-[11px] text-[var(--app-text-tertiary)]">
                        Sem imagem
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="truncate text-[16px] font-semibold text-[var(--app-text-primary)]">
                        {product.name}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusTone(
                          product.status,
                        )}`}
                      >
                        {product.status}
                      </span>
                    </div>

                    <div className="mb-2 text-[12px] text-[var(--app-text-secondary)]">
                      {product.category || 'Sem categoria'} ·{' '}
                      {product.workspaceName || product.workspaceId}
                    </div>

                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[var(--app-accent-medium)] bg-[var(--app-bg-card)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-accent)]">
                        PREÇO {formatMoney(product.priceInCents)}
                      </span>
                      <span className="rounded-full border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-secondary)]">
                        {product.format}
                      </span>
                    </div>

                    <p className="line-clamp-2 max-w-2xl text-[12.5px] leading-6 text-[var(--app-text-secondary)]">
                      {product.description || 'Sem descrição cadastrada.'}
                    </p>
                  </div>

                  <div className="flex flex-col items-start gap-3 lg:items-end">
                    <div className="text-left lg:text-right">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                        Receita proxy
                      </div>
                      <MetricNumber
                        value={product.priceInCents}
                        kind="currency-brl"
                        className="text-[20px] font-bold tracking-[-0.03em] text-[var(--app-accent)]"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/produtos/${product.id}`}>Abrir</Link>
                      </Button>
                      {(product.status === 'PENDING' || activeTab === 'moderacao') && (
                        <>
                          <Button
                            size="sm"
                            disabled={busyId === product.id}
                            onClick={() => void approveProduct(product)}
                          >
                            Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === product.id}
                            onClick={() => void rejectProduct(product)}
                          >
                            Rejeitar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminSurface>

        <div className="grid gap-3">
          <AdminSurface className="px-5 py-5 lg:px-6">
            <AdminSectionHeader
              title="Saúde operacional"
              description="Leitura global do catálogo administrativo."
            />
            <div className="grid gap-2">
              {[
                { label: 'Produtos ativos', value: items.filter((item) => item.active).length },
                {
                  label: 'Checkouts ativos',
                  value: items.filter((item) => item.status === 'APPROVED').length,
                },
                { label: 'Áreas vinculadas', value: null },
                { label: 'Afiliados ativos', value: null },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3"
                >
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                    {item.label}
                  </div>
                  <div className="text-[24px] font-bold tracking-[-0.04em] text-[var(--app-text-primary)]">
                    {item.value === null ? '—' : item.value}
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                    {item.value === null ? 'Dados sendo coletados' : 'Atualização contínua'}
                  </div>
                </div>
              ))}
            </div>
          </AdminSurface>

          <AdminSurface className="px-5 py-5 lg:px-6">
            <AdminSectionHeader
              title="Motor IA"
              description="Status do catálogo usado para suporte e moderação."
            />
            <div className="rounded-md border border-[var(--app-border-primary)] bg-[#FFF4DF] px-4 py-4 text-[#5A3A12]">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em]">
                Catálogo sincronizado
              </div>
              <div className="text-[18px] font-semibold">
                Base pronta para suporte administrativo
              </div>
              <div className="mt-2 text-[12px] leading-6">
                Produtos com dados incompletos continuam visíveis, mas recebem leitura reduzida na
                análise.
              </div>
            </div>
          </AdminSurface>
        </div>
      </div>
    </AdminPage>
  );
}
