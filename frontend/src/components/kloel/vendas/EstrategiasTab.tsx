'use client';

import { kloelT } from '@/lib/i18n/t';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { Stat } from './Stat';
import { SORA, MONO } from './utils';
import type { SalesStatsData, SubStatsData, OrderStatsData, PipelineStage } from './types';

interface EstrategiasTabProps {
  isMobile: boolean;
  salesStats: SalesStatsData;
  subStats: SubStatsData;
  orderStats: OrderStatsData;
  orderAlertsCount: number;
  alertCounts: Record<string, number> | null;
  salesStages: PipelineStage[];
  onNavigate: (route: string) => void;
  onTabChange: (tab: string) => void;
  onShowSmartPayment: () => void;
}

interface StrategyCard {
  title: string;
  desc: string;
  metric: string;
  cta: string;
  action: () => void;
}

export function EstrategiasTab({
  isMobile,
  salesStats,
  subStats,
  orderStats,
  orderAlertsCount,
  alertCounts,
  salesStages,
  onNavigate,
  onTabChange,
  onShowSmartPayment,
}: EstrategiasTabProps) {
  const cards: StrategyCard[] = [
    {
      title: 'Recuperar carrinhos',
      desc: 'Acione follow-ups para leads que não finalizaram a compra.',
      metric: `${alertCounts?.possibleLost || 0} sinais de perda`,
      cta: 'Abrir Follow-ups',
      action: () => onNavigate('/followups'),
    },
    {
      title: 'Oferecer bump e cupom',
      desc: 'Use produtos publicados para destravar mais ticket e conversão.',
      metric: `${salesStats.totalTransactions || 0} transações`,
      cta: 'Abrir Produtos',
      action: () => onNavigate('/products?feature=order-bump'),
    },
    {
      title: 'Escalar recorrência',
      desc: 'Revise churn, atrasos e saúde das assinaturas sem sair de Vendas.',
      metric: `${subStats.pastDueCount || 0} atrasadas`,
      cta: 'Abrir Assinaturas',
      action: () => onTabChange('assinaturas'),
    },
    {
      title: 'Cobrança imediata',
      desc: 'Gere um link de pagamento ou cobrança avulsa para não perder timing.',
      metric: `${salesStats.pendingCount || 0} pendências`,
      cta: 'Criar Cobrança',
      action: () => onShowSmartPayment(),
    },
    {
      title: 'Fulfillment físico',
      desc: 'Concentre rastreio, envio e entregas dos produtos físicos.',
      metric: `${orderStats.shipped || 0} em trânsito`,
      cta: 'Abrir Físicos',
      action: () => onTabChange('fisicos'),
    },
    {
      title: 'Pipeline comercial',
      desc: 'Revise gargalos do CRM e destrave negócios em aberto.',
      metric: `${salesStages.length || 0} etapas`,
      cta: 'Abrir Pipeline',
      action: () => onTabChange('pipeline'),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, 1fr)',
          gap: 12,
        }}
      >
        <Stat
          label={kloelT('Receita viva')}
          value={fmtBRL(salesStats.totalRevenue || 0)}
          color="colors.ember.primary"
          sub={kloelT('Volume do período')}
        />
        <Stat
          label={kloelT('Assinaturas ativas')}
          value={String(subStats.activeCount || 0)}
          color="#10B981"
          sub={kloelT('Base recorrente')}
        />
        <Stat
          label={kloelT('Pedidos a enviar')}
          value={String(orderStats.processing || 0)}
          color="#F59E0B"
          sub={kloelT('Fulfillment pendente')}
        />
        <Stat
          label={kloelT('Alertas')}
          value={String(orderAlertsCount)}
          color={orderAlertsCount > 0 ? '#EF4444' : 'var(--app-text-secondary)'}
          sub={kloelT('Pontos de atenção')}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        {cards.map((card) => (
          <div
            key={card.title}
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: 18,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                marginBottom: 8,
                fontFamily: SORA,
              }}
            >
              {card.title}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--app-text-secondary)',
                lineHeight: 1.6,
                minHeight: 56,
                fontFamily: SORA,
              }}
            >
              {card.desc}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: 'colors.ember.primary',
                marginTop: 10,
              }}
            >
              {card.metric}
            </div>
            <button
              type="button"
              onClick={card.action}
              style={{
                marginTop: 14,
                padding: '8px 16px',
                background: 'colors.ember.primary',
                border: 'none',
                borderRadius: 6,
                color: 'var(--app-text-on-accent)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: SORA,
              }}
            >
              {card.cta}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtBRL(v: number): string {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}
