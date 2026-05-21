'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  AdminPage,
  AdminProgressList,
  AdminSubinterfaceTabs,
  AdminTicker,
  AdminTimelineFeed,
} from '@/components/admin/admin-monitor-ui';
import { Button } from '@/components/ui/button';
import { adminDashboardApi, type AdminHomeResponse } from '@/lib/api/admin-dashboard-api';
import {
  adminProductsApi,
  type AdminProductRow,
  type ListProductsResponse,
} from '@/lib/api/admin-products-api';
import { formatMoney, formatInteger, pct } from './page.helpers';
import { Surface } from './Surface';
import { ProductCard } from './ProductCard';

const TABS = [
  { key: 'todos', label: 'Todos os Produtos' },
  { key: 'moderacao', label: 'Fila de Moderação' },
  { key: 'produtor', label: 'Por Produtor' },
  { key: 'marketplace', label: 'Marketplace' },
] as const;

const FONT_SANS = "var(--font-sora), 'Sora', sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

/** Produtos page. */
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
        ...(search ? { search } : {}),
        ...(apiStatus !== undefined ? { status: apiStatus } : {}),
        take: 60,
      }),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const { data: dashboard } = useSWR<AdminHomeResponse>(['admin/dashboard/home', '30D'], () =>
    adminDashboardApi.home({ period: '30D', compare: 'NONE' }),
  );

  const items = useMemo(
    () =>
      (data?.items || []).filter((item) =>
        workspaceFilter ? (item.workspaceName || item.workspaceId) === workspaceFilter : true,
      ),
    [data?.items, workspaceFilter],
  );

  const workspaceOptions = useMemo(
    () => Array.from(new Set(items.map((item) => item.workspaceName).filter(Boolean))).sort(),
    [items],
  );

  const tickerItems = useMemo(
    () =>
      items.length > 0
        ? items
            .slice()
            .sort(
              (left, right) => right.commerce.last30dGmvInCents - left.commerce.last30dGmvInCents,
            )
            .slice(0, 10)
            .map(
              (item) =>
                `${item.name} · ${formatMoney(item.commerce.last30dGmvInCents)} · ${
                  item.workspaceName || item.workspaceId
                }`,
            )
        : ['Aguardando catálogo global'],
    [items],
  );

  const totalGmv = useMemo(
    () => items.reduce((sum, item) => sum + item.commerce.gmvInCents, 0),
    [items],
  );
  const totalPending = items.reduce((sum, item) => sum + item.commerce.pendingOrders, 0);
  const totalApproved = items.reduce((sum, item) => sum + item.commerce.approvedOrders, 0);
  const activeProducts = items.filter((item) => item.active).length;
  const workspaceCount = new Set(items.map((item) => item.workspaceId)).size;
  const last30dGmv = items.reduce((sum, item) => sum + item.commerce.last30dGmvInCents, 0);
  const totalChargebacks = items.reduce((sum, item) => sum + item.commerce.chargebackOrders, 0);
  const totalRefunded = items.reduce((sum, item) => sum + item.commerce.refundedOrders, 0);
  const moderationQueue = items.filter((item) => item.status === 'PENDING').length;
  const maxProductGmv = Math.max(1, ...items.map((item) => item.commerce.gmvInCents));
  const feedItems = useMemo(
    () =>
      items.slice(0, 8).map((item) => ({
        id: item.id,
        title: item.name,
        body:
          item.commerce.approvedOrders > 0
            ? `${formatInteger(item.commerce.approvedOrders)} pedidos aprovados e ${formatMoney(
                item.commerce.gmvInCents,
              )} em GMV global.`
            : 'Catálogo pronto para receber tráfego, checkout e moderação operacional.',
        meta: new Date(item.updatedAt).toLocaleString('pt-BR'),
      })),
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
    if (!reason) {
      return;
    }

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
      <AdminSubinterfaceTabs
        items={TABS.map((tab) => ({ key: tab.key, label: tab.label }))}
        active={activeTab}
        onChange={(nextTab: string) =>
          startTransition(() => {
            router.push(`/produtos?tab=${encodeURIComponent(nextTab)}`);
          })
        }
      />

      <section
        style={{
          position: 'relative',
          padding: '30px 0 24px',
          marginBottom: 8,
          fontFamily: FONT_SANS,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 220,
            height: 88,
            transform: 'translate(-50%, -50%)',
            borderRadius: '999px',
            background: 'radial-gradient(ellipse, rgba(232,93,48,0.18), transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div className="relative flex flex-col items-center gap-4 text-center lg:flex-row lg:justify-center">
          <div className="lg:absolute lg:right-0 lg:top-1/2 lg:-translate-y-1/2">
            <Button
              type="button"
              onClick={() =>
                startTransition(() => {
                  router.push('/produtos?tab=moderacao');
                })
              }
              className="h-11 rounded-[10px] px-5"
            >
              Abrir moderação
            </Button>
          </div>
          <div>
            <div
              style={{
                marginBottom: 6,
                fontFamily: FONT_MONO,
                fontSize: 10,
                letterSpacing: '0.25em',
                textTransform: 'uppercase',
                color: 'var(--app-text-tertiary)',
              }}
            >
              GMV TOTAL DO CATÁLOGO
            </div>
            <div
              style={{
                position: 'relative',
                zIndex: 1,
                fontFamily: FONT_MONO,
                fontSize: 72,
                lineHeight: 1,
                fontWeight: 700,
                color: 'var(--app-accent)',
                letterSpacing: '-0.04em',
              }}
            >
              {formatMoney(totalGmv)}
            </div>
            <div
              style={{
                marginTop: 8,
                fontFamily: FONT_MONO,
                fontSize: 12,
                color: 'var(--app-text-secondary)',
              }}
            >
              {formatInteger(activeProducts)}/{formatInteger(items.length)} ativos ·{' '}
              {formatInteger(workspaceCount)} produtores · {formatInteger(totalApproved)} pedidos
              aprovados
            </div>
          </div>
        </div>
      </section>

      <AdminTicker items={tickerItems} />

      <section className="grid gap-4 py-6">
        <div
          className="rounded-[12px] border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] p-4"
          style={{ fontFamily: FONT_SANS }}
        >
          <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[13px] font-semibold text-[var(--app-text-primary)]">
                {activeTab === 'moderacao' ? 'Fila de moderação' : 'Catálogo global'}
              </div>
              <div className="mt-1 text-[12px] text-[var(--app-text-secondary)]">
                Hero, ticker, catálogo, chart, saúde, motor IA e feed no mesmo ritmo do app.
              </div>
            </div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
              GMV 30D {formatMoney(last30dGmv)} · Revenue Kloel{' '}
              {formatMoney(dashboard?.kpis.revenueKloel.value ?? null)}
            </div>
          </div>

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
        </div>

        <div className="grid gap-3">
          {items.length === 0 ? (
            <div
              className="rounded-[12px] border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] px-6 py-10 text-center"
              style={{ fontFamily: FONT_SANS }}
            >
              <div className="mb-2 text-[15px] font-semibold text-[var(--app-text-primary)]">
                Nenhum produto encontrado
              </div>
              <div className="text-[12px] text-[var(--app-text-secondary)]">
                Ajuste os filtros para explorar o catálogo global ou abra a fila de moderação.
              </div>
            </div>
          ) : null}
          {items.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              busyId={busyId}
              onApprove={approveProduct}
              onReject={rejectProduct}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.14fr)_minmax(320px,0.86fr)]">
        <Surface title="Receita por produto">
          <AdminProgressList
            items={items.slice(0, 8).map((item) => ({
              label: item.name,
              valueLabel: formatMoney(item.commerce.gmvInCents),
              progress: pct(item.commerce.gmvInCents, maxProductGmv),
            }))}
          />
        </Surface>

        <div className="grid gap-4">
          <Surface title="Saúde operacional">
            <AdminProgressList
              items={[
                {
                  label: 'Produtos ativos',
                  valueLabel: `${formatInteger(activeProducts)} (${pct(activeProducts, items.length)}%)`,
                  progress: pct(activeProducts, items.length),
                },
                {
                  label: 'Pedidos aprovados',
                  valueLabel: formatInteger(totalApproved),
                  progress: pct(totalApproved, totalApproved + totalPending),
                },
                {
                  label: 'Fila de moderação',
                  valueLabel: formatInteger(moderationQueue),
                  progress: pct(moderationQueue, Math.max(1, items.length)),
                },
                {
                  label: 'Chargebacks no catálogo',
                  valueLabel: formatInteger(totalChargebacks),
                  progress: pct(totalChargebacks, Math.max(1, totalApproved)),
                },
              ]}
            />
          </Surface>

          <Surface title="Motor IA" tone="accent">
            <div className="mb-3 flex items-center gap-2">
              <div
                className="h-3 w-10 rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, rgba(232,93,48,0.22), rgba(232,93,48,0.9), rgba(232,93,48,0.22))',
                }}
              />
            </div>
            <div className="text-[12px] leading-6 text-[var(--app-text-secondary)]">
              {items.length > 0
                ? `O catálogo monitorado soma ${formatMoney(totalGmv)} em GMV, ${formatInteger(
                    totalApproved,
                  )} pedidos aprovados e ${formatInteger(
                    moderationQueue,
                  )} produto${moderationQueue === 1 ? '' : 's'} aguardando decisão operacional.`
                : 'Assim que o catálogo ganhar produtos, o backoffice passa a receber leitura operacional e insights de moderação.'}
            </div>
          </Surface>
        </div>
      </div>

      <div className="grid gap-4 pt-4 md:grid-cols-3">
        {[
          {
            label: 'Revenue Kloel',
            value: formatMoney(dashboard?.kpis.revenueKloel.value ?? null),
            detail: 'Receita própria do marketplace',
          },
          {
            label: 'Reembolsos',
            value: formatInteger(totalRefunded),
            detail: 'Pedidos devolvidos neste catálogo',
          },
          {
            label: 'Moderação',
            value: formatInteger(moderationQueue),
            detail: 'Produtos aguardando decisão',
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-[12px] border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] px-5 py-5"
            style={{ fontFamily: FONT_SANS }}
          >
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
              {item.label}
            </div>
            <div
              className="text-[26px] font-bold tracking-[-0.04em] text-[var(--app-text-primary)]"
              style={{ fontFamily: FONT_MONO }}
            >
              {item.value}
            </div>
            <div className="mt-2 text-[11px] text-[var(--app-text-secondary)]">{item.detail}</div>
          </div>
        ))}
      </div>

      <Surface title="Feed ao vivo" eyebrow="Feed ao vivo">
        <AdminTimelineFeed items={feedItems} />
      </Surface>
    </AdminPage>
  );
}
