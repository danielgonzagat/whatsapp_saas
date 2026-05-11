'use client';

import { kloelT } from '@/lib/i18n/t';
import { V, FONT_MONO, chartCardStyle } from '../analytics.design-tokens';
import { R$, Fmt } from '../analytics.design-tokens';
import { ICONS } from '../shared/Icons';
import { MetricCard, ChartTooltip } from '../shared/Components';
import { useReport } from '../use-report';
import type { ReportFilters, ChurnResponse } from '../analytics.types';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function ChurnTab({ filters }: { filters: ReportFilters }) {
  const { data, isLoading } = useReport<ChurnResponse>('churn', filters);
  const monthly = data?.monthly || [];

  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard title={kloelT(`Cancelamentos`)} value={String(data?.total || 0)} sub={kloelT(`Periodo selecionado`)} color={V.r} icon={ICONS.ban} loading={isLoading} />
      </div>
      {monthly.length > 0 && (
        <div style={{ ...chartCardStyle, padding: 20 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: V.t, display: 'block', marginBottom: 16 }}>{kloelT(`Evolucao de cancelamentos`)}</span>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke={V.b} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: V.t3, fontFamily: FONT_MONO }} stroke={V.b} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: V.t3, fontFamily: FONT_MONO }} stroke={V.b} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="total" fill={V.r} radius={[3, 3, 0, 0]} name="Cancelamentos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {!isLoading && monthly.length === 0 && (
        <div style={{ ...chartCardStyle, padding: 40, textAlign: 'center' }}><span style={{ color: V.t3, fontSize: 13 }}>{kloelT(`Nenhum cancelamento no periodo`)}</span></div>
      )}
    </>
  );
}
