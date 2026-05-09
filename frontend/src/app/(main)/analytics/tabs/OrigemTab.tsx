'use client';

import { kloelT } from '@/lib/i18n/t';
import { V, FONT_MONO, FONT_SORA, chartCardStyle } from '../analytics.design-tokens';
import { R$, Fmt } from '../analytics.design-tokens';
import { ICONS } from '../shared/Icons';
import { MetricCard, TableHeader, EmptyState, ChartTooltip } from '../shared/Components';
import { NeuroPulse } from '../shared/NeuroPulse';
import { useReport } from '../use-report';
import type { ReportFilters, ReportRow } from '../analytics.types';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const PIE_COLORS = [V.em, V.bl, V.p, V.g2, V.y, V.cy, V.pk, V.r, V.t3];

export function OrigemTab({ filters }: { filters: ReportFilters }) {
  const { data, isLoading } = useReport<ReportRow[]>('origem', filters);
  const rows = Array.isArray(data) ? data : [];
  const totalVendas = rows.reduce((s: number, r: ReportRow) => s + (Number(r.vendas) || 0), 0);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', gap: 16, flexDirection: 'column' }}>
        <NeuroPulse w={300} h={60} />
        <NeuroPulse w={400} h={200} />
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        <MetricCard
          title={kloelT(`Total vendas rastreadas`)}
          value={Fmt(totalVendas)}
          color={V.em}
          icon={ICONS.globe}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Fontes ativas`)}
          value={String(rows.length)}
          color={V.bl}
          icon={ICONS.link}
          loading={isLoading}
        />
      </div>
      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <div style={{ ...chartCardStyle, padding: 20, flex: 1.5 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: V.t,
                display: 'block',
                marginBottom: 16,
              }}
            >
              {kloelT(`Vendas por origem`)}
            </span>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={rows.map((d: ReportRow) => ({
                  name:
                    (d.source || '').length > 16 ? `${(d.source || '').slice(0, 14)}...` : d.source,
                  vendas: d.vendas,
                }))}
                layout="vertical"
                margin={{ left: 10 }}
              >
                <CartesianGrid strokeDasharray={kloelT(`3 3`)} stroke={V.b} horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 8, fill: V.t3, fontFamily: FONT_MONO }}
                  stroke={V.b}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 9, fill: V.t2, fontFamily: FONT_SORA }}
                  stroke={V.b}
                  tickLine={false}
                  width={100}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="vendas" fill={V.em} radius={[0, 4, 4, 0]} name="Vendas" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ ...chartCardStyle, padding: 20, flex: 1 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: V.t,
                display: 'block',
                marginBottom: 16,
              }}
            >
              {kloelT(`Distribuição`)}
            </span>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={rows.map((d: ReportRow) => ({ name: d.source, value: d.vendas }))}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  dataKey="value"
                  stroke={V.void}
                  strokeWidth={2}
                >
                  {rows.map((r: ReportRow, i: number) => (
                    <Cell key={r.source || `cell-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {!isLoading && rows.length === 0 && (
        <EmptyState message={kloelT(`Nenhuma venda paga no período`)} />
      )}
      {rows.length > 0 && (
        <div style={{ ...chartCardStyle, overflow: 'hidden' }}>
          <TableHeader
            cols={[
              { l: 'Fonte', w: '1.5fr' },
              { l: 'Vendas', w: '0.6fr' },
              { l: 'Receita', w: '1fr' },
              { l: '% Total', w: '1fr' },
            ]}
          />
          {rows.map((o: ReportRow, i: number) => {
            const perc = totalVendas > 0 ? ((o.vendas ?? 0) / totalVendas) * 100 : 0;
            return (
              <div
                key={o.source}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 0.6fr 1fr 1fr',
                  padding: '12px 14px',
                  borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = V.e;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 8,
                      background: PIE_COLORS[i % PIE_COLORS.length],
                    }}
                  />
                  <span style={{ fontSize: 12, color: V.t, fontWeight: 500 }}>{o.source}</span>
                </div>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: V.bl, fontWeight: 600 }}>
                  {Fmt(o.vendas ?? 0)}
                </span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: V.t2 }}>
                  {R$(o.receita || 0)}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 5,
                      background: V.e,
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${perc}%`,
                        height: '100%',
                        background: PIE_COLORS[i % PIE_COLORS.length],
                        borderRadius: 3,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 11,
                      fontWeight: 700,
                      color: V.em,
                      minWidth: 44,
                      textAlign: 'right',
                    }}
                  >
                    {perc.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
