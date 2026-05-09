'use client';

import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import type { DashboardHomeResponse, DashboardHomePeriod } from '@/lib/api/home';
import { useMemo } from 'react';

const FONT_MONO = "'JetBrains Mono', monospace";

const formatCurrency = (amountInCents: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format((Number(amountInCents || 0) || 0) / 100);

const formatInteger = (value: number) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(value || 0) || 0);

const formatOneDecimal = (value: number, suffix = '') =>
  `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(Number(value || 0) || 0)}${suffix}`;

function Sparkline({
  data,
  color,
  width = 84,
  height = 30,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  const points = useMemo(() => {
    if (!data.length) {
      return '';
    }
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    return data
      .map((value, index) => {
        const x = data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
        const y = height - ((value - min) / range) * (height - 6) - 3;
        return `${x},${y}`;
      })
      .join(' ');
  }, [data, height, width]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Surface({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: KLOEL_THEME.bgCard,
        border: `1px solid ${KLOEL_THEME.borderPrimary}`,
        borderRadius: 6,
        padding: 18,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

type HeroTile = { label: string; value: string; meta: string; tone: string };

function HeroTilesGrid({ tiles, compact }: { tiles: HeroTile[]; compact: boolean }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr 1fr' : 'repeat(2, minmax(0, 1fr))',
        gap: 10,
      }}
    >
      {tiles.map((item) => (
        <div
          key={item.label}
          style={{
            minHeight: 102,
            padding: '14px 16px',
            borderRadius: 6,
            background: KLOEL_THEME.bgSecondary,
            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: KLOEL_THEME.textTertiary, marginBottom: 8 }}>
            {item.label}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: item.tone, lineHeight: 1.1 }}>
            {item.value}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: KLOEL_THEME.textSecondary }}>
            {item.meta}
          </div>
        </div>
      ))}
    </div>
  );
}

type MetricTile = { label: string; value: string; tone: string; delta: string; series: number[] };

function MetricsRow({ items, isLoading }: { items: MetricTile[]; isLoading: boolean }) {
  return (
    <>
      {items.map((item) => (
        <Surface key={item.label} style={{ padding: 18 } as React.CSSProperties}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: KLOEL_THEME.textTertiary, marginBottom: 8 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, color: item.tone }}>
                {isLoading ? '...' : item.value}
              </div>
            </div>
            <Sparkline data={item.series} color={KLOEL_THEME.accent} />
          </div>
          <div style={{ fontSize: 11, color: KLOEL_THEME.textSecondary }}>{item.delta}</div>
        </Surface>
      ))}
    </>
  );
}

export default function HomeKpiTiles({
  home,
  isLoading,
  compact,
  activeRangeLabel,
}: {
  home: DashboardHomeResponse | undefined;
  isLoading: boolean;
  compact: boolean;
  activeRangeLabel: string;
}) {
  const revenueSeries = home?.series.revenueInCents || [];
  const orderSeries = home?.series.paidOrders || [];
  const conversionSeries = home?.series.conversionRatePct || [];
  const averageTicketSeries = home?.series.averageTicketInCents || [];

  return (
    <>
      <Surface style={{ padding: compact ? 18 : 26, overflow: 'hidden', position: 'relative' } as React.CSSProperties}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? '1fr' : 'minmax(0, 1.2fr) minmax(360px, 0.9fr)',
            gap: 18,
            alignItems: 'stretch',
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: KLOEL_THEME.textTertiary, fontFamily: FONT_MONO, marginBottom: 10 }}>
              {kloelT(`Receita total dos seus produtos`)}
            </div>
            <div style={{ fontSize: compact ? 36 : 52, fontWeight: 700, lineHeight: 0.98, letterSpacing: '-0.05em', color: KLOEL_THEME.accent }}>
              {isLoading ? '...' : formatCurrency(home?.hero.totalRevenueInCents || 0)}
            </div>
            <div style={{ marginTop: 10, color: KLOEL_THEME.textSecondary, fontSize: 13 }}>
              {kloelT(`Receita aprovada em`)}{' '}
              <span style={{ color: KLOEL_THEME.textPrimary }}>{activeRangeLabel}</span>.
            </div>
          </div>

          <HeroTilesGrid
            compact={compact}
            tiles={[
              {
                label: 'Total deste mês',
                value: formatCurrency(home?.hero.monthRevenueInCents || 0),
                meta: `Mês anterior · ${formatCurrency(home?.hero.previousMonthRevenueInCents || 0)}`,
                tone: KLOEL_THEME.accent,
              },
              {
                label: 'Vendas de hoje',
                value: formatCurrency(home?.hero.todayRevenueInCents || 0),
                meta: `Ontem · ${formatCurrency(home?.hero.yesterdayRevenueInCents || 0)}`,
                tone: KLOEL_THEME.accent,
              },
              {
                label: 'Saldo disponível',
                value: formatCurrency(home?.hero.availableBalanceInCents || 0),
                meta: 'Disponível para saque',
                tone: KLOEL_THEME.success,
              },
              {
                label: 'A receber',
                value: formatCurrency(home?.hero.pendingBalanceInCents || 0),
                meta: 'Receitas em processamento',
                tone: KLOEL_THEME.warning,
              },
            ]}
          />
        </div>
      </Surface>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr' : 'repeat(4, minmax(0, 1fr))',
          gap: 12,
        }}
      >
        <MetricsRow
          isLoading={isLoading}
          items={[
            {
              label: 'Receita',
              value: formatCurrency(home?.hero.totalRevenueInCents || 0),
              tone: KLOEL_THEME.accent,
              delta:
                home?.hero.revenueDeltaPct === null
                  ? 'Sem comparativo anterior'
                  : `${(home?.hero.revenueDeltaPct || 0) >= 0 ? '+' : ''}${formatOneDecimal(home?.hero.revenueDeltaPct || 0, '%')} vs período anterior`,
              series: revenueSeries,
            },
            {
              label: 'Vendas',
              value: formatInteger(home?.metrics.paidOrders || 0),
              tone: KLOEL_THEME.textPrimary,
              delta: `${formatInteger(home?.metrics.totalOrders || 0)} pedidos gerados no período`,
              series: orderSeries,
            },
            {
              label: 'Conversão',
              value: formatOneDecimal(home?.metrics.conversionRatePct || 0, '%'),
              tone: KLOEL_THEME.textPrimary,
              delta: 'Taxa de checkout concluído',
              series: conversionSeries,
            },
            {
              label: 'Ticket médio',
              value: formatCurrency(home?.metrics.averageTicketInCents || 0),
              tone: KLOEL_THEME.textPrimary,
              delta: 'Média por pedido aprovado',
              series: averageTicketSeries,
            },
          ]}
        />
      </div>
    </>
  );
}
