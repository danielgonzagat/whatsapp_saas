'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

// Monochrome Ember progression — dark → light, so the biggest slice is the
// boldest. Matches the brand's single-accent palette rule.
const COLORS = [
  'var(--primary)',
  'rgba(232, 93, 48, 0.72)',
  'rgba(232, 93, 48, 0.48)',
  'rgba(232, 93, 48, 0.28)',
  'rgba(232, 93, 48, 0.16)',
];

export interface BreakdownDatum {
  label: string;
  gmvInCents: number;
}

export interface BreakdownDonutProps {
  data: BreakdownDatum[];
}

export function BreakdownDonut({ data }: BreakdownDonutProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Sem dados no período
      </div>
    );
  }

  const rows = data.map((d, idx) => ({
    name: d.label,
    value: d.gmvInCents / 100,
    color: COLORS[idx % COLORS.length],
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={rows}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={88}
          strokeWidth={0}
          paddingAngle={1}
        >
          {rows.map((row) => (
            <Cell key={row.name} fill={row.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 12,
          }}
          labelStyle={{ color: 'var(--foreground)' }}
          formatter={(val, name) => [BRL.format(Number(val ?? 0)), String(name ?? '')]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
