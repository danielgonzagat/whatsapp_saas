'use client';

import { useRouter } from 'next/navigation';
import { AdminSurface } from '@/components/admin/admin-monitor-ui';
import type { AdminHomeResponse } from '@/lib/api/admin-dashboard-api';
import type { AdminProductRow } from '@/lib/api/admin-products-api';
import type { AdminSupportOverviewItem } from '@/lib/api/admin-support-api';
import { AdminEmptyState } from './admin-empty-state';
import { formatCurrency, formatInteger, formatRelativeTime } from './admin-formatters';
import { AdminStatusChip } from './admin-status-chip';

export function AdminProductsSection({
  data,
  topProducts,
  recentConversations,
}: {
  data: AdminHomeResponse | undefined;
  topProducts: AdminProductRow[];
  recentConversations: AdminSupportOverviewItem[];
}) {
  const router = useRouter();

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <AdminSurface className="px-5 py-5 lg:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
              Produtos
            </div>
            <div className="text-[13px] text-[var(--app-text-secondary)]">
              Produtos que mais movimentaram o catálogo em{' '}
              {data?.range.label?.toLowerCase() || '30 dias'}.
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/produtos')}
            className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--app-border-primary)] px-3 text-[12px] font-semibold text-[var(--app-text-secondary)] transition hover:text-[var(--app-text-primary)]"
          >
            Ver todos
          </button>
        </div>

        {topProducts.length ? (
          <div className="flex flex-col gap-2">
            {topProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => router.push(`/produtos/${product.id}`)}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3 text-left transition hover:border-[var(--app-accent-medium)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-elevated)] text-[var(--app-accent)]">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-semibold">
                        {product.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-bold text-[var(--app-text-primary)]">
                      {product.name}
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                      {`${product.category || 'Produto'} · ${product.workspaceName || product.workspaceId}`}{' '}
                      · {formatInteger(product.commerce.approvedOrders)} vendas
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-[14px] font-bold text-[var(--app-text-primary)]">
                    {formatCurrency(product.commerce.last30dGmvInCents)}
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--app-text-tertiary)]">gmv 30d</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <AdminEmptyState label="Nenhum produto com receita para exibir." />
        )}
      </AdminSurface>

      <AdminSurface className="px-5 py-5 lg:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
              Conversas recentes
            </div>
            <div className="text-[13px] text-[var(--app-text-secondary)]">
              Fila mais recente de suporte com leitura rápida de status.
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/contas')}
            className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--app-border-primary)] px-3 text-[12px] font-semibold text-[var(--app-text-secondary)] transition hover:text-[var(--app-text-primary)]"
          >
            Abrir fila
          </button>
        </div>

        {recentConversations.length ? (
          <div className="flex flex-col gap-2">
            {recentConversations.map((conversation) => (
              <button
                key={conversation.conversationId}
                type="button"
                onClick={() => router.push(`/contas/suporte/${conversation.conversationId}`)}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3 text-left transition hover:border-[var(--app-accent-medium)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[var(--app-border-primary)] bg-[var(--app-bg-elevated)] text-[12px] font-bold text-[var(--app-accent)]">
                    {(conversation.contactName || conversation.workspaceName || 'K')
                      .split(' ')
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-bold text-[var(--app-text-primary)]">
                      {conversation.contactName || conversation.workspaceName}
                    </div>
                    <div className="mt-1 truncate text-[11px] text-[var(--app-text-secondary)]">
                      {conversation.workspaceName} · {conversation.channel}
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="mb-1 text-[10px] text-[var(--app-text-tertiary)]">
                    {formatRelativeTime(conversation.lastMessageAt)}
                  </div>
                  <AdminStatusChip status={conversation.status} />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <AdminEmptyState label="Nenhuma conversa recente para exibir." />
        )}
      </AdminSurface>
    </div>
  );
}
