'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { Stat } from './Stat';
import { Badge } from './Badge';
import { TH } from './TH';
import { SORA, MONO, ORDER_STATUS, fmtBRL, fmtDate } from './utils';
import type { OrderStatsData, OrderPipelineData, OrderItem } from './types';

interface GestaoFisicosProps {
  orderStats: OrderStatsData;
  pipeline: OrderPipelineData;
  orders: OrderItem[];
  onOpenDetail: (id: string, type: 'sale' | 'sub' | 'order') => void;
}

const PIPELINE_LEGEND = [
  { l: 'Processando', c: colors.semantic.warning, key: 'processing' as const },
  { l: 'Enviados', c: colors.semantic.info, key: 'shipped' as const },
  { l: 'Entregues', c: 'colors.ember.primary', key: 'delivered' as const },
];

export function GestaoFisicos({
  orderStats,
  pipeline,
  orders,
  onOpenDetail,
}: GestaoFisicosProps) {
  const st = orderStats;
  const pl = pipeline;
  const total = st.total || 1;

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <Stat
          label={kloelT('Pedidos totais')}
          value={String(st.total || 0)}
          sub={kloelT('Ultimos 30 dias')}
        />
        <Stat
          label={kloelT('Aguardando envio')}
          value={String(st.processing || 0)}
          color="#F59E0B"
        />
        <Stat label={kloelT('Em transito')} value={String(st.shipped || 0)} color="#3B82F6" />
        <Stat
          label={kloelT('Entregues')}
          value={String(st.delivered || 0)}
          color="colors.ember.primary"
        />
      </div>

      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          padding: 18,
          marginBottom: 24,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            display: 'block',
            marginBottom: 14,
            fontFamily: SORA,
          }}
        >
          {kloelT('Pipeline de fulfillment')}
        </span>
        <div style={{ display: 'flex', gap: 4, height: 8, borderRadius: 4, overflow: 'hidden' }}>
          <div
            style={{
              width: `${((pl.processing || 0) / total) * 100}%`,
              background: colors.semantic.warning,
              borderRadius: '4px 0 0 4px',
            }}
          />
          <div
            style={{
              width: `${((pl.shipped || 0) / total) * 100}%`,
              background: colors.semantic.info,
            }}
          />
          <div
            style={{
              width: `${((pl.delivered || 0) / total) * 100}%`,
              background: 'colors.ember.primary',
              borderRadius: '0 4px 4px 0',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          {PIPELINE_LEGEND.map((s) => (
            <span
              key={s.l}
              style={{
                fontSize: 10,
                color: 'var(--app-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontFamily: SORA,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 2, background: s.c }} />
              {s.l} ({pl[s.key] || 0})
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1.5fr 1fr 0.8fr 1.2fr 0.8fr',
            gap: 12,
            padding: '10px 16px',
            borderBottom: '1px solid var(--app-border-subtle)',
          }}
        >
          <TH>{kloelT('Cliente')}</TH>
          <TH>{kloelT('Produto')}</TH>
          <TH>{kloelT('Valor')}</TH>
          <TH>{kloelT('Status')}</TH>
          <TH>{kloelT('Rastreamento')}</TH>
          <TH>{kloelT('Destino')}</TH>
        </div>
        {orders.length === 0 ? (
          <div
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: '60px 20px',
              textAlign: 'center',
            }}
          >
            <span
              style={{
                fontSize: 14,
                color: 'var(--app-text-secondary)',
                display: 'block',
                marginBottom: 8,
              }}
            >
              {kloelT('Nenhum pedido encontrado')}
            </span>
            <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)' }}>
              {kloelT('Pedidos aparecerao aqui quando seus clientes comprarem')}
            </span>
          </div>
        ) : (
          orders.map((o, i) => (
            <div
              key={o.id}
              onClick={() => onOpenDetail(o.id, 'order')}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.5fr 1fr 0.8fr 1.2fr 0.8fr',
                gap: 12,
                padding: '12px 16px',
                borderBottom:
                  i < orders.length - 1 ? '1px solid var(--app-border-subtle)' : 'none',
                cursor: 'pointer',
                transition: 'background .1s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--app-bg-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).click();
                }
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--app-text-primary)',
                    display: 'block',
                    fontFamily: SORA,
                  }}
                >
                  {o.customerName}
                </span>
                <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                  {fmtDate(o.createdAt || new Date())}
                </span>
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--app-text-secondary)',
                  alignSelf: 'center',
                  fontFamily: SORA,
                }}
              >
                {o.productName}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--app-text-primary)',
                  alignSelf: 'center',
                }}
              >
                {fmtBRL(o.amount)}
              </span>
              <div style={{ alignSelf: 'center' }}>
                <Badge status={o.status} config={ORDER_STATUS} />
              </div>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: o.trackingCode
                    ? 'var(--app-text-secondary)'
                    : 'var(--app-text-placeholder)',
                  alignSelf: 'center',
                }}
              >
                {o.trackingCode || 'Aguardando'}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--app-text-secondary)',
                  alignSelf: 'center',
                  fontFamily: SORA,
                }}
              >
                {o.addressState || '\u2014'}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
