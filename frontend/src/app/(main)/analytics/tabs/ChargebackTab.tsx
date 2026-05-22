'use client';

import { kloelT } from '@/lib/i18n/t';
import { V, FONT_MONO, chartCardStyle } from '../analytics.design-tokens';
import { R$ } from '../analytics.design-tokens';
import { ICONS } from '../shared/Icons';
import { MetricCard, StatusDot, Pagination, TableHeader, EmptyState, ChartTooltip } from '../shared/Components';
import { NeuroPulse } from '../shared/NeuroPulse';
import { useReport } from '../use-report';
import type { ReportFilters, ReportRow, ChargebackResponse, SetPage } from '../analytics.types';
import { Bar, ComposedChart, Line, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function ChargebackTab({
  baseFilters,
  page,
  setPage,
}: {
  baseFilters: ReportFilters & { page: number; perPage: number };
  page: number;
  setPage: SetPage;
}) {
  const { data, isLoading } = useReport<ChargebackResponse>('chargeback', baseFilters);
  const rows = data?.data || [];
  const monthly = data?.monthly || [];
  const ganhosTotal = monthly.reduce((acc: number, r: ReportRow) => acc + (Number(r.ganhos) || 0), 0);
  const taxaMedia = monthly.length > 0
    ? monthly.reduce((acc: number, r: ReportRow) => acc + (Number(r.taxa) || 0), 0) / monthly.length
    : 0;

  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title={kloelT(`Ganhos cartao`)}
          value={R$(ganhosTotal)}
          sub={kloelT(`Receita de cartao`)}
          color={V.g2}
          icon={ICONS.check}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Total chargebacks`)}
          value={String(data?.total || 0)}
          sub={kloelT(`No periodo`)}
          color={V.pk}
          icon={ICONS.ban}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Taxa media`)}
          value={`${taxaMedia.toFixed(2)}%`}
          sub={kloelT(`Taxa de chargeback`)}
          color={V.y}
          icon={ICONS.perc}
          loading={isLoading}
        />
      </div>
      {monthly.length > 0 && (
        <div style={{ ...chartCardStyle, padding: 20, marginBottom: 20 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: V.t, display: 'block', marginBottom: 16 }}>
            {kloelT(`Evolucao de chargebacks`)}
          </span>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke={V.b} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: V.t3, fontFamily: FONT_MONO }} stroke={V.b} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: V.t3, fontFamily: FONT_MONO }} stroke={V.b} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="ganhos" fill={V.g2} radius={[3, 3, 0, 0]} name="Ganhos" />
              <Bar dataKey="chargebacks" fill={V.pk} radius={[3, 3, 0, 0]} name="Chargebacks" />
              <Line type="monotone" dataKey="taxa" stroke={V.y} strokeWidth={2} dot={false} name="Taxa" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 14,
          padding: '10px 16px',
          ...chartCardStyle,
          flexWrap: 'wrap',
        }}
      >
        {[
          { c: V.g2, l: 'Ganho' },
          { c: V.pk, l: 'Chargeback' },
          { c: V.y, l: 'Em disputa' },
          { c: V.r, l: 'Perdido' },
        ].map((s) => (
          <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <StatusDot color={s.c} />
            <span style={{ fontSize: 10, color: V.t2 }}>{s.l}</span>
          </div>
        ))}
      </div>
      <div style={{ ...chartCardStyle, overflow: 'hidden' }}>
        <TableHeader
          cols={[
            { l: 'Comprador', w: '1.5fr' },
            { l: 'Valor', w: '0.7fr' },
            { l: 'Data', w: '0.8fr' },
            { l: 'Status', w: '0.3fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NeuroPulse w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message={kloelT(`Nenhum chargeback encontrado`)} />
        ) : (
          rows.map((r: ReportRow, i: number) => (
            <div
              key={r.id || i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 0.7fr 0.8fr 0.3fr',
                padding: '12px 14px',
                borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = V.e; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div>
                <span style={{ fontSize: 11, color: V.t, display: 'block' }}>
                  {r.order?.customerName || '\u2014'}
                </span>
              </div>
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, color: V.t }}>
                {R$(r.order?.totalInCents || 0)}
              </span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: V.t2 }}>
                {r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR') : '\u2014'}
              </span>
              <StatusDot color={V.pk} />
            </div>
          ))
        )}
        <Pagination total={data?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}
