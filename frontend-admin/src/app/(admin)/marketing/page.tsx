'use client';

import {
  AdminPage,
  AdminSectionHeader,
  AdminSubinterfaceTabs,
  AdminSurface,
  AdminTicker,
  AdminTimelineFeed,
} from '@/components/admin/admin-monitor-ui';
import { adminDashboardApi, type AdminHomeResponse } from '@/lib/api/admin-dashboard-api';
import { useAdminChatHistory } from '@/lib/admin-chat-history';
import { adminProductsApi, type ListProductsResponse } from '@/lib/api/admin-products-api';
import { useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useMemo } from 'react';
import useSWR from 'swr';

const TABS = [
  { key: 'conversas', label: 'Conversas' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'email', label: 'Email' },
] as const;

const FONT_SANS = "var(--font-sora), 'Sora', sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function formatInteger(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
}

export default function MarketingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'conversas';
  const { sessions } = useAdminChatHistory();
  const { data } = useSWR<AdminHomeResponse>(['admin/dashboard/home', '30D'], () =>
    adminDashboardApi.home({ period: '30D', compare: 'NONE' }),
  );
  const { data: productsData } = useSWR<ListProductsResponse>('admin/products/marketing-top', () =>
    adminProductsApi.list({ take: 6 }),
  );

  const tickerItems = useMemo(
    () =>
      sessions.length > 0
        ? sessions.slice(0, 10).map((session) => `${session.title} · ${session.lastMessagePreview}`)
        : ['Aguardando novas conversas'],
    [sessions],
  );

  const topProducts = useMemo(
    () =>
      (productsData?.items || [])
        .slice()
        .sort((left, right) => right.commerce.gmvInCents - left.commerce.gmvInCents)
        .slice(0, 3),
    [productsData?.items],
  );

  const channelCards = [
    {
      label: 'WhatsApp',
      accent: '#25D366',
      status: sessions.length > 0 ? 'Conectado' : 'Sem conexão ativa',
      stats: `${formatInteger(sessions.length)} conversas · ${formatInteger(
        sessions.reduce((sum, session) => sum + session.messageCount, 0),
      )} msgs`,
    },
    {
      label: 'Instagram',
      accent: '#E1306C',
      status: 'Sem eventos do período',
      stats: 'DMs e leads ainda não apareceram nesta leitura',
    },
    {
      label: 'TikTok',
      accent: '#111111',
      status: 'Sem eventos do período',
      stats: 'Mensageria ainda não apareceu nesta leitura',
    },
    {
      label: 'Facebook',
      accent: '#1877F2',
      status: 'Sem eventos do período',
      stats: 'Mensageria ainda não apareceu nesta leitura',
    },
    {
      label: 'Email',
      accent: '#F59E0B',
      status: 'Sem campanhas no período',
      stats: 'Campanhas e respostas ainda não entraram nesta leitura',
    },
  ];

  const feedItems = useMemo(
    () =>
      sessions.slice(0, 8).map((session) => ({
        id: session.id,
        title: session.title,
        body: session.lastMessagePreview,
        meta: `${formatInteger(session.messageCount)} mensagens · ${new Date(
          session.updatedAt,
        ).toLocaleString('pt-BR')}`,
      })),
    [sessions],
  );

  return (
    <AdminPage>
      <AdminSubinterfaceTabs
        items={TABS.map((tab) => ({ key: tab.key, label: tab.label }))}
        active={activeTab}
        onChange={(nextTab: string) =>
          startTransition(() => {
            router.push(`/marketing?tab=${encodeURIComponent(nextTab)}`);
          })
        }
      />

      <AdminSurface
        className="px-5 py-6 text-center lg:px-6"
        style={{ fontFamily: FONT_SANS, background: 'var(--app-bg-card)' }}
      >
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: 'var(--app-text-tertiary)',
          }}
        >
          RECEITA TOTAL GERADA PELA IA
        </div>
        <div
          style={{
            marginTop: 8,
            fontFamily: FONT_MONO,
            fontSize: 72,
            lineHeight: 1,
            fontWeight: 700,
            color: 'var(--app-accent)',
            letterSpacing: '-0.04em',
          }}
        >
          {formatMoney(data?.kpis.revenueKloel.value ?? null)}
        </div>
        <div
          style={{
            marginTop: 6,
            fontFamily: FONT_MONO,
            fontSize: 12,
            color: 'var(--app-text-secondary)',
          }}
        >
          {formatInteger(sessions.reduce((sum, session) => sum + session.messageCount, 0))} msgs ·{' '}
          {formatInteger(sessions.length)} leads ·{' '}
          {formatInteger(data?.kpis.approvedCount.value ?? null)} vendas
        </div>
      </AdminSurface>

      <AdminTicker items={tickerItems} />

      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Canais"
          description="A mesma leitura por canal do app, agora no escopo global da plataforma."
        />
        <div className="grid gap-2">
          {channelCards.map((card) => (
            <div
              key={card.label}
              className="relative flex flex-col gap-2 overflow-hidden rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3 lg:flex-row lg:items-center"
            >
              <div
                className="absolute inset-y-0 left-0 w-[3px]"
                style={{ background: card.accent }}
                aria-hidden="true"
              />
              <div className="pl-1 text-[14px] font-semibold text-[var(--app-text-primary)]">
                {card.label}
              </div>
              <span
                className="inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{
                  borderColor: `${card.accent}33`,
                  background: `${card.accent}14`,
                  color: card.accent,
                }}
              >
                {card.status}
              </span>
              <div
                className="text-[11px] text-[var(--app-text-secondary)] lg:ml-auto"
                style={{ fontFamily: FONT_MONO }}
              >
                {card.stats}
              </div>
            </div>
          ))}
        </div>
      </AdminSurface>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.86fr)]">
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="Produtos mais vendidos"
            description="Complemento admin em cima do layout do Marketing do app."
          />
          <div className="grid gap-3 md:grid-cols-3">
            {topProducts.map((product) => (
              <div
                key={product.id}
                className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] p-4"
              >
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex size-12 items-center justify-center overflow-hidden rounded-[10px] border border-[var(--app-border-primary)] bg-[var(--app-bg-card)]">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-[var(--app-text-tertiary)]">Kloel</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-[var(--app-text-primary)]">
                      {product.name}
                    </div>
                    <div
                      className="truncate text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]"
                      style={{ fontFamily: FONT_MONO }}
                    >
                      {product.workspaceName || product.workspaceId}
                    </div>
                  </div>
                </div>
                <div
                  className="text-[13px] font-semibold text-[var(--app-accent)]"
                  style={{ fontFamily: FONT_MONO }}
                >
                  {formatMoney(product.commerce.gmvInCents)}
                </div>
                <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                  {formatInteger(product.commerce.approvedOrders)} vendas aprovadas
                </div>
              </div>
            ))}
          </div>
        </AdminSurface>

        <div className="grid gap-3">
          <AdminSurface className="px-5 py-5 lg:px-6">
            <AdminSectionHeader
              title="Cérebro IA ativo"
              description="Painel global da inteligência operacional da Kloel."
            />
            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-6 text-center">
              <div className="mb-3 size-10 rounded-full bg-[var(--app-accent-light)]" />
              <div className="text-[16px] font-semibold text-[var(--app-text-primary)]">
                Cérebro IA ativo
              </div>
              <div
                className="mt-2 text-[13px] text-[var(--app-accent)]"
                style={{ fontFamily: FONT_MONO }}
              >
                {formatInteger(sessions.length)} conversas ativas
              </div>
              <div className="mt-4 flex gap-8">
                <div className="text-center">
                  <div
                    className="text-[18px] font-semibold text-[var(--app-text-primary)]"
                    style={{ fontFamily: FONT_MONO }}
                  >
                    {formatInteger(topProducts.length)}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                    Produtos
                  </div>
                </div>
                <div className="text-center">
                  <div
                    className="text-[18px] font-semibold text-[var(--app-text-primary)]"
                    style={{ fontFamily: FONT_MONO }}
                  >
                    {formatInteger(data?.kpis.approvedCount.value ?? null)}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                    Vendas
                  </div>
                </div>
              </div>
            </div>
          </AdminSurface>

          <AdminSurface className="px-5 py-5 lg:px-6">
            <AdminSectionHeader
              title="Rankings"
              description="Leitura executiva sem fugir do mesmo design system."
            />
            <div className="grid gap-2">
              {[
                {
                  label: 'Top produtores por conversas',
                  value: formatInteger(sessions.length),
                  detail: 'Baseado nas sessões recentes do admin',
                },
                {
                  label: 'Top produtos atendidos',
                  value: formatInteger(topProducts.length),
                  detail: 'Produtos com GMV observado',
                },
                {
                  label: 'Revenue Kloel',
                  value: formatMoney(data?.kpis.revenueKloel.value ?? null),
                  detail: 'Comissão própria da plataforma',
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3"
                >
                  <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                    {item.label}
                  </div>
                  <div
                    className="text-[15px] font-semibold text-[var(--app-text-primary)]"
                    style={{ fontFamily: FONT_MONO }}
                  >
                    {item.value}
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                    {item.detail}
                  </div>
                </div>
              ))}
            </div>
          </AdminSurface>
        </div>
      </div>

      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Feed em tempo real"
          description="Conversas globais da plataforma na superfície administrativa."
        />
        <AdminTimelineFeed items={feedItems} />
      </AdminSurface>
    </AdminPage>
  );
}
