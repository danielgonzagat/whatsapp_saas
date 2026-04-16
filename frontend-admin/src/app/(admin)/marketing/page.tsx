'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useMemo } from 'react';
import useSWR from 'swr';
import {
  AdminHeroSplit,
  AdminMetricGrid,
  AdminPage,
  AdminPageIntro,
  AdminPillTabs,
  AdminSectionHeader,
  AdminSurface,
  AdminTicker,
} from '@/components/admin/admin-monitor-ui';
import { adminDashboardApi, type AdminHomeResponse } from '@/lib/api/admin-dashboard-api';
import { useAdminChatHistory } from '@/lib/admin-chat-history';

const TABS = [
  { key: 'conversas', label: 'Conversas' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'email', label: 'Email' },
] as const;

export default function MarketingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'conversas';
  const { sessions } = useAdminChatHistory();
  const { data } = useSWR<AdminHomeResponse>(['admin/dashboard/home', '30D'], () =>
    adminDashboardApi.home({ period: '30D', compare: 'NONE' }),
  );

  const tickerItems = useMemo(
    () => sessions.slice(0, 8).map((session) => `${session.title} · ${session.lastMessagePreview}`),
    [sessions],
  );

  const channelCards = [
    {
      label: 'WhatsApp',
      accent: '#25D366',
      status: sessions.length > 0 ? 'Ativo' : 'Dados sendo coletados',
      meta: `${sessions.length} conversas recentes`,
    },
    {
      label: 'Instagram',
      accent: '#E1306C',
      status: 'Dados sendo coletados',
      meta: 'Integração em observação',
    },
    {
      label: 'TikTok',
      accent: '#111111',
      status: 'Dados sendo coletados',
      meta: 'Integração em observação',
    },
    {
      label: 'Facebook',
      accent: '#1877F2',
      status: 'Dados sendo coletados',
      meta: 'Integração em observação',
    },
    {
      label: 'Email',
      accent: '#F59E0B',
      status: 'Dados sendo coletados',
      meta: 'Integração em observação',
    },
  ];

  return (
    <AdminPage>
      <AdminPageIntro
        eyebrow="CANAL E CONVERSA"
        title="Marketing"
        description="Conversas, canais e leitura operacional da IA em toda a plataforma."
      />

      <AdminPillTabs
        items={TABS.map((tab) => ({ key: tab.key, label: tab.label }))}
        active={activeTab}
        onChange={(nextTab) =>
          startTransition(() => {
            router.push(`/marketing?tab=${encodeURIComponent(nextTab)}`);
          })
        }
      />

      <AdminHeroSplit
        label="Receita total gerada pela IA"
        value={data?.kpis.gmv.value ?? null}
        description="Acumulado global das operações assistidas pela superfície administrativa."
        compactCards={[
          {
            label: 'Mensagens',
            value: sessions.reduce((sum, session) => sum + session.messageCount, 0),
            kind: 'integer',
            note: 'Mensagens dentro das sessões recentes',
          },
          {
            label: 'Leads',
            value: sessions.length,
            kind: 'integer',
            note: 'Sessões com histórico carregado',
          },
          {
            label: 'Vendas',
            value: data?.kpis.approvedCount.value ?? null,
            kind: 'integer',
            note: 'Pedidos aprovados no período',
          },
          {
            label: 'Taxa de aprovação',
            value: data?.kpis.approvalRate.value ?? null,
            kind: 'percentage',
            note: 'Sinal macro do funil',
          },
        ]}
      />

      <AdminTicker items={tickerItems} />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="grid gap-3">
          <AdminSurface className="px-5 py-5 lg:px-6">
            <AdminSectionHeader
              title="Canais"
              description="Mesmo padrão visual do app, com leitura agregada e estado claro de disponibilidade."
            />
            <div className="grid gap-3 md:grid-cols-2">
              {channelCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-4"
                  style={{ borderLeft: `4px solid ${card.accent}` }}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-[14px] font-semibold text-[var(--app-text-primary)]">
                      {card.label}
                    </div>
                    <span className="rounded-full border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-secondary)]">
                      {card.status}
                    </span>
                  </div>
                  <div className="text-[12px] text-[var(--app-text-secondary)]">{card.meta}</div>
                </div>
              ))}
            </div>
          </AdminSurface>

          <AdminSurface className="px-5 py-5 lg:px-6">
            <AdminSectionHeader
              title="Feed em tempo real"
              description="Últimas conversas administrativas carregadas no histórico."
            />
            <div className="grid gap-2">
              {sessions.slice(0, 8).map((session) => (
                <div
                  key={session.id}
                  className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3"
                >
                  <div className="mb-1 truncate text-[13px] font-semibold text-[var(--app-text-primary)]">
                    {session.title}
                  </div>
                  <div className="line-clamp-2 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                    {session.lastMessagePreview}
                  </div>
                </div>
              ))}
            </div>
          </AdminSurface>
        </div>

        <div className="grid gap-3">
          <AdminMetricGrid
            items={[
              {
                label: 'Cérebro IA ativo',
                value: sessions.length,
                kind: 'integer',
                detail: 'Sessões recentes em memória',
                tone: 'text-[var(--app-accent)]',
              },
              {
                label: 'Produtos atendidos',
                value: null,
                kind: 'integer',
                detail: 'Dados sendo coletados',
              },
              {
                label: 'Objeções resolvidas',
                value: null,
                kind: 'integer',
                detail: 'Dados sendo coletados',
              },
              {
                label: 'Pico operacional',
                value: sessions.length ? sessions[0]?.messageCount || 0 : null,
                kind: 'integer',
                detail: 'Maior volume na sessão mais recente',
              },
            ]}
          />

          <AdminSurface className="px-5 py-5 lg:px-6">
            <AdminSectionHeader
              title="Rankings"
              description="Sem expor backlog: o dado indisponível permanece honesto e legível."
            />
            <div className="grid gap-2">
              {[
                'Top 10 produtores por volume de conversas',
                'Top 10 produtores por taxa de conversão',
                'Top 10 produtos mais atendidos',
                'Heatmap de horários de pico',
              ].map((label) => (
                <div
                  key={label}
                  className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3"
                >
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                    {label}
                  </div>
                  <div className="text-[14px] font-semibold text-[var(--app-text-primary)]">—</div>
                  <div className="mt-1 text-[12px] text-[var(--app-text-secondary)]">
                    Dados sendo coletados
                  </div>
                </div>
              ))}
            </div>
          </AdminSurface>
        </div>
      </div>
    </AdminPage>
  );
}
