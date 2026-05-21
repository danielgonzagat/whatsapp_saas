'use client';

import { useId } from 'react';
import { kloelT } from '@/lib/i18n/t';
import { V, FONT_MONO, chartCardStyle } from '../analytics.design-tokens';
import { R$, Fmt } from '../analytics.design-tokens';
import { ICONS } from '../shared/Icons';
import { MetricCard, StatusDot, NeuroPulse, Pagination, TableHeader, ChartTooltip } from '../shared/Components';
import { statusMap, formIcon } from '../shared/status-maps';
import { useReport } from '../use-report';
import type { ReportFilters, ReportRow, VendasSummary, PaginatedReport } from '../analytics.types';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface VendasTabProps {
  filters: ReportFilters;
  baseFilters: ReportFilters & { page: number; perPage: number };
  page: number;
  setPage: (p: number) => void;
  isMobile: boolean;
}

export function VendasTab({ filters, baseFilters, page, setPage, isMobile }: VendasTabProps) {
  const gid = useId();
  const { data: summary, isLoading: ls } = useReport<VendasSummary>('vendas/summary', filters);
  const { data: daily } = useReport<ReportRow[]>('vendas/daily', filters);
  const { data: vendas, isLoading: lv } = useReport<PaginatedReport>('vendas', baseFilters);
  const rows = vendas?.data || [];
  const dailyData = Array.isArray(daily) ? daily : [];

  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard title={kloelT(`Total de operacoes`)} value={summary ? R$(summary.totalRevenue || 0) : '...'} sub={summary ? `${Fmt(summary.totalCount || 0)} operacoes · Ticket medio ${R$(summary.ticketMedio || 0)}` : ''} color={V.em} icon={ICONS.dollar} loading={ls} />
        <MetricCard title={kloelT(`Conversao`)} value={summary ? `${summary.conversao || 0}%` : '...'} sub={`${summary?.paidCount || 0} aprovadas`} color={V.bl} icon={ICONS.perc} loading={ls} />
        <MetricCard title={kloelT(`Total comissoes`)} value={summary ? R$(summary.totalCommission || 0) : '...'} sub={kloelT(`Comissoes do periodo`)} color={V.g2} icon={ICONS.users} loading={ls} />
      </div>
      {dailyData.length > 0 && (
        <div style={{ ...chartCardStyle, padding: 20, marginBottom: 20 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: V.t, display: 'block', marginBottom: 16 }}>{kloelT(`Receita diaria`)}</span>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dailyData}>
              <defs><linearGradient id={`${gid}-gR`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={V.em} stopOpacity={0.25} /><stop offset="95%" stopColor={V.em} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={V.b} vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 8, fill: V.t3, fontFamily: FONT_MONO }} stroke={V.b} tickLine={false} tickFormatter={(v: string) => (typeof v === 'string' ? v.slice(8, 10) : '')} />
              <YAxis tick={{ fontSize: 8, fill: V.t3, fontFamily: FONT_MONO }} stroke={V.b} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v / 100000).toFixed(0)}k`} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="receita" stroke={V.em} fill={`url(#${gid}-gR)`} strokeWidth={2} dot={false} name="Receita" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {dailyData.length > 0 && (
        <div style={{ ...chartCardStyle, padding: 20, marginBottom: 20 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: V.t, display: 'block', marginBottom: 16 }}>{kloelT(`Volume de operacoes`)}</span>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={V.b} vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 7, fill: V.t3, fontFamily: FONT_MONO }} stroke={V.b} tickLine={false} tickFormatter={(v: string) => (typeof v === 'string' ? v.slice(8, 10) : '')} />
              <YAxis tick={{ fontSize: 8, fill: V.t3, fontFamily: FONT_MONO }} stroke={V.b} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="vendas" fill={V.em} radius={[3, 3, 0, 0]} name="Operacoes" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14, padding: '10px 16px', ...chartCardStyle, flexWrap: 'wrap' }}>
        {[{ c: V.bl, l: 'Processando' }, { c: V.g2, l: 'Aprovado' }, { c: V.y, l: 'Pendente' }, { c: V.r, l: 'Frustrada' }, { c: V.p, l: 'Estornado' }, { c: V.t3, l: 'Cancelado' }].map((s) => (
          <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><StatusDot color={s.c} /><span style={{ fontSize: 10, color: V.t2 }}>{s.l}</span></div>
        ))}
      </div>
      <div style={{ ...chartCardStyle, overflowX: isMobile ? ('auto' as const) : ('hidden' as const) }}>
        <TableHeader cols={[{ l: 'Pedido', w: '0.7fr' }, { l: 'Comprador', w: '1.4fr' }, { l: 'Pagamento', w: '0.5fr' }, { l: 'Pedido', w: '0.8fr' }, { l: 'Total', w: '0.7fr' }, { l: 'Status', w: '0.4fr' }]} />
        {lv ? (
          <div style={{ padding: 20 }}><NeuroPulse w={200} h={20} /></div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: V.t3, fontSize: 12 }}>{kloelT(`Nenhuma operacao no periodo`)}</div>
        ) : (
          rows.map((s: ReportRow, i: number) => {
            const st = statusMap[s.status ?? ''] || { c: V.bl, l: s.status };
            const FI = formIcon[s.paymentMethod ?? ''] || ICONS.card;
            return (
              <section key={s.id} style={{ display: 'grid', gridTemplateColumns: '0.7fr 1.4fr 0.5fr 0.8fr 0.7fr 0.4fr', padding: '10px 14px', borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none', alignItems: 'center' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = V.e; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: V.t3 }}>{s.orderNumber || s.id?.slice(0, 12)}</span>
                <div><span style={{ fontSize: 11, color: V.t, display: 'block' }}>{s.customerName || '—'}</span><span style={{ fontSize: 9, color: V.t3 }}>{s.customerEmail || ''}</span></div>
                <span style={{ color: V.t2, display: 'flex', justifyContent: 'center' }}>{FI(16)}</span>
                <span style={{ fontSize: 9, color: V.t2, fontFamily: FONT_MONO }}>{s.createdAt ? new Date(s.createdAt).toLocaleDateString('pt-BR') : '—'}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, color: V.t }}>{R$(s.totalInCents || 0)}</span>
                <StatusDot color={st.c} />
              </section>
            );
          })
        )}
        <Pagination total={vendas?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}
