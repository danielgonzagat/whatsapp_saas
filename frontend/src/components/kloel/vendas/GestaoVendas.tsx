'use client';

import { kloelT } from '@/lib/i18n/t';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { IC } from './VendasView.icons';
import { Stat } from './Stat';
import { TH } from './TH';
import { MiniChart } from './MiniChart';
import { SORA, MONO, SALE_STATUS, fmtBRL } from './utils';
import { MobileSaleRow, DesktopSaleRow } from './SaleRow';
import type { SalesStatsData, SaleItem } from './types';

interface GestaoVendasProps {
  salesStats: SalesStatsData;
  chart: number[];
  search: string;
  onSearchChange: (v: string) => void;
  filterStatus: string;
  onFilterStatusChange: (v: string) => void;
  sales: SaleItem[];
  onOpenDetail: (id: string, type: 'sale' | 'sub' | 'order') => void;
}

const FILTER_OPTIONS = ['todos', 'paid', 'pending', 'refunded'] as const;

export function GestaoVendas({
  salesStats,
  chart,
  search,
  onSearchChange,
  filterStatus,
  onFilterStatusChange,
  sales,
  onOpenDetail,
}: GestaoVendasProps) {
  const { isMobile } = useResponsiveViewport();
  const st = salesStats;

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <Stat
          label={kloelT('Faturamento total')}
          value={fmtBRL(st.totalRevenue || 0)}
          color="colors.ember.primary"
          trend={st.revenueTrend}
        />
        <Stat
          label={kloelT('Transacoes')}
          value={String(st.totalTransactions || 0)}
          sub={kloelT('Ultimos 30 dias')}
        />
        <Stat
          label={kloelT('Pendentes')}
          value={fmtBRL(st.totalPending || 0)}
          color="#F59E0B"
          sub={`${st.pendingCount || 0} transacoes`}
        />
        <Stat label={kloelT('Ticket medio')} value={fmtBRL(st.avgTicket || 0)} />
      </div>

      {chart.length > 0 && (
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 18,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'flex-start' : 'center',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                fontFamily: SORA,
              }}
            >
              {kloelT('Vendas — Ultimos 30 dias')}
            </span>
            {st.revenueTrend ? (
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: st.revenueTrend > 0 ? '#10B981' : '#EF4444',
                }}
              >
                {st.revenueTrend > 0 ? '+' : ''}
                {st.revenueTrend}%
              </span>
            ) : null}
          </div>
          <MiniChart data={chart} />
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          alignItems: isMobile ? 'stretch' : 'center',
          flexDirection: isMobile ? 'column' : 'row',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: '8px 14px',
          }}
        >
          <span style={{ color: 'var(--app-text-tertiary)' }}>{IC.search(14)}</span>
          <input
            aria-label="Buscar por cliente ou produto"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={kloelT('Buscar por cliente ou produto...')}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--app-text-primary)',
              fontSize: 12,
              fontFamily: SORA,
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {FILTER_OPTIONS.map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => onFilterStatusChange(f)}
              style={{
                padding: '7px 14px',
                background: filterStatus === f ? 'var(--app-bg-card)' : 'colors.ember.primary',
                border: '1px solid colors.ember.primary',
                borderRadius: 6,
                color: filterStatus === f ? 'colors.ember.primary' : 'var(--app-text-on-accent)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: SORA,
              }}
            >
              {f === 'todos' ? 'Todos' : SALE_STATUS[f]?.label || f}
            </button>
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
        {!isMobile && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1.5fr 1fr 1fr 0.8fr 0.8fr',
              gap: 12,
              padding: '10px 16px',
              borderBottom: '1px solid var(--app-border-subtle)',
            }}
          >
            <TH>{kloelT('Cliente')}</TH>
            <TH>{kloelT('Produto')}</TH>
            <TH>{kloelT('Valor')}</TH>
            <TH>{kloelT('Metodo')}</TH>
            <TH>{kloelT('Status')}</TH>
            <TH>{kloelT('Data')}</TH>
          </div>
        )}
        {sales.length === 0 ? (
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
              {kloelT('Nenhuma venda encontrada')}
            </span>
            <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)' }}>
              {kloelT('Pedidos aparecerao aqui quando seus clientes comprarem')}
            </span>
          </div>
        ) : (
          sales.map((s, i) =>
            isMobile ? (
              <MobileSaleRow
                key={s.id}
                sale={s}
                isLast={i === sales.length - 1}
                onOpenDetail={onOpenDetail}
              />
            ) : (
              <DesktopSaleRow
                key={s.id}
                sale={s}
                isLast={i === sales.length - 1}
                onOpenDetail={onOpenDetail}
              />
            ),
          )
        )}
      </div>
    </>
  );
}


