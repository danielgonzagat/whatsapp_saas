'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { GmvDailyPoint } from '@/lib/api/admin-dashboard-api';

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

/** Gmv chart props shape. */
export interface GmvChartProps {
  data: GmvDailyPoint[];
}

interface ChartRow {
  date: string;
  label: string;
  gmv: number;
}

function toRows(data: GmvDailyPoint[]): ChartRow[] {
  return data.map((row) => ({
    date: row.date,
    label: SHORT_DATE.format(new Date(row.date + 'T00:00:00Z')),
    gmv: row.gmvInCents / 100,
  }));
}

/** Gmv chart. */
export function GmvChart({ data }: GmvChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Sem vendas no período
      </div>
    );
  }

  const rows = toRows(data);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={{ stroke: 'var(--border)' }}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
        />
        <YAxis
          tickLine={false}
          axisLine={{ stroke: 'var(--border)' }}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          tickFormatter={(v: number) => BRL.format(v)}
          width={80}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 12,
          }}
          labelStyle={{ color: 'var(--foreground)' }}
          formatter={(val) => [BRL.format(Number(val ?? 0)), 'GMV']}
        />
        <Line
          type="monotone"
          dataKey="gmv"
          stroke="var(--primary)"
          strokeWidth={2}
          dot={{ fill: 'var(--primary)', r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
