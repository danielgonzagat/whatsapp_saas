'use client';

import { kloelT } from '@/lib/i18n/t';
import { V, FONT_MONO, chartCardStyle } from '../analytics.design-tokens';
import { EmptyState, ChartTooltip } from '../shared/Components';
import { NeuroPulse } from '../shared/NeuroPulse';
import { useReport } from '../use-report';
import type { ReportFilters, ReportRow } from '../analytics.types';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export function IndProdTab({ filters }: { filters: ReportFilters }) {
  const { data, isLoading } = useReport<ReportRow[]>('indicadores-produto', filters);
  const rows = Array.isArray(data) ? data : [];

  return (
    <>
      {rows.length > 0 ? (
        <div style={{ ...chartCardStyle, padding: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: V.t,
              display: 'block',
              marginBottom: 16,
            }}
          >
            {kloelT(`Vendas por dia`)}
          </span>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rows}>
              <CartesianGrid
                strokeDasharray={kloelT(`3 3`)}
                stroke={V.b}
                vertical={false}
              />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 7, fill: V.t3, fontFamily: FONT_MONO }}
                stroke={V.b}
                tickLine={false}
                tickFormatter={(v: string) =>
                  typeof v === 'string' ? v.slice(8, 10) : ''
                }
              />
              <YAxis
                tick={{ fontSize: 8, fill: V.t3, fontFamily: FONT_MONO }}
                stroke={V.b}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="vendas"
                fill={V.p}
                radius={[3, 3, 0, 0]}
                name="Vendas"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : isLoading ? (
        <div style={{ ...chartCardStyle, padding: 20 }}>
          <NeuroPulse w={200} h={20} />
        </div>
      ) : (
        <EmptyState
          message={kloelT(`Selecione um produto para ver indicadores`)}
        />
      )}
    </>
  );
}
