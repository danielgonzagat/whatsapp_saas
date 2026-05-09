'use client';

import { kloelT } from '@/lib/i18n/t';
import { V, FONT_MONO, chartCardStyle } from '../analytics.design-tokens';
import { R$ } from '../analytics.design-tokens';
import { ICONS } from '../shared/Icons';
import { MetricCard, StatusDot, NeuroPulse, Pagination, TableHeader } from '../shared/Components';
import { statusMap } from '../shared/status-maps';
import { useReport } from '../use-report';
import type { ReportFilters, ReportRow, PaginatedReport } from '../analytics.types';

export function AbandonosTab({ baseFilters, page, setPage }: { baseFilters: ReportFilters & { page: number; perPage: number }; page: number; setPage: (p: number) => void }) {
  const { data, isLoading } = useReport<PaginatedReport>('abandonos', baseFilters);
  const rows = data?.data || [];
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard title={kloelT(`Total abandonos`)} value={String(data?.total || 0)} sub={kloelT(`Checkouts nao finalizados`)} color={V.r} icon={ICONS.ban} loading={isLoading} />
      </div>
      <div style={{ ...chartCardStyle, overflow: 'hidden' }}>
        <TableHeader cols={[{ l: 'Comprador', w: '1.6fr' }, { l: 'Produto', w: '1fr' }, { l: 'Plano', w: '1fr' }, { l: 'Valor', w: '0.7fr' }, { l: 'Data', w: '0.8fr' }]} />
        {isLoading ? (
          <div style={{ padding: 20 }}><NeuroPulse w={200} h={20} /></div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: V.t3, fontSize: 12 }}>{kloelT(`Nenhum abandono no periodo`)}</div>
        ) : (
          rows.map((a: ReportRow, i: number) => (
            <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 0.7fr 0.8fr', padding: '12px 14px', borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none', alignItems: 'center' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = V.e; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <div><span style={{ fontSize: 11, color: V.t, display: 'block', fontWeight: 500 }}>{a.customerName || '—'}</span><span style={{ fontSize: 9, color: V.t3 }}>{a.customerEmail}</span></div>
              <span style={{ fontSize: 10, color: V.em, fontWeight: 500 }}>{a.plan?.product?.name || '—'}</span>
              <span style={{ fontSize: 10, color: V.t2 }}>{a.plan?.name || '—'}</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, color: V.t }}>{R$(a.totalInCents || 0)}</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: V.t2 }}>{a.createdAt ? new Date(a.createdAt).toLocaleDateString('pt-BR') : '—'}</span>
            </div>
          ))
        )}
        <Pagination total={data?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}
