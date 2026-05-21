'use client';

import { kloelT } from '@/lib/i18n/t';
import { V, FONT_MONO, chartCardStyle, inputStyle } from '../analytics.design-tokens';
import { R$ } from '../analytics.design-tokens';
import { ICONS } from '../shared/Icons';
import { MetricCard, StatusDot, Pagination, TableHeader, EmptyState, FilterBar, FilterField } from '../shared/Components';
import { NeuroPulse } from '../shared/NeuroPulse';
import { statusMap } from '../shared/status-maps';
import { useReport } from '../use-report';
import type { ReportFilters, ReportRow, PaginatedReport, SetFilters } from '../analytics.types';

export function AfterPayTab({
  filters,
  setFilters,
  baseFilters,
  page,
  setPage,
}: {
  filters: ReportFilters;
  setFilters: SetFilters;
  baseFilters: ReportFilters & { page: number; perPage: number };
  page: number;
  setPage: (p: number) => void;
}) {
  const { data, isLoading } = useReport<PaginatedReport>('afterpay', baseFilters);
  const rows = data?.data || [];
  const aReceberTotal = rows.reduce((acc: number, r: ReportRow) => acc + (r.totalInCents || 0), 0);
  const atrasadasCount = rows.filter((r: ReportRow) => r.status === 'PAST_DUE' || r.status === 'OVERDUE').length;
  const quitadosCount = rows.filter((r: ReportRow) => r.status === 'PAID' || r.status === 'DELIVERED').length;

  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title={kloelT(`Parcelamentos`)}
          value={String(data?.total || 0)}
          sub={kloelT(`Cartao de credito`)}
          color={V.bl}
          icon={ICONS.clock}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`A receber`)}
          value={R$(aReceberTotal)}
          sub={kloelT(`Valor total pendente`)}
          color={V.bl}
          icon={ICONS.dollar}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Parcelas atrasadas`)}
          value={String(atrasadasCount)}
          sub={kloelT(`Em atraso`)}
          color={V.y}
          icon={ICONS.alert}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Quitados`)}
          value={String(quitadosCount)}
          sub={kloelT(`Pagos integralmente`)}
          color={V.g2}
          icon={ICONS.check}
          loading={isLoading}
        />
      </div>
      <FilterBar>
        <FilterField label={kloelT(`Produto`)}>
          <select style={inputStyle} value={filters.product || ''} onChange={(e) => setFilters((f) => ({ ...f, product: e.target.value }))}>
            <option value="">{kloelT(`Todos`)}</option>
          </select>
        </FilterField>
        <FilterField label={kloelT(`Status`)}>
          <select style={inputStyle} value={filters.status || ''} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">{kloelT(`Todos`)}</option>
            <option value="PAID">{kloelT(`Pago`)}</option>
            <option value="PENDING">{kloelT(`Pendente`)}</option>
            <option value="PAST_DUE">{kloelT(`Atrasado`)}</option>
          </select>
        </FilterField>
      </FilterBar>
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
          { c: V.bl, l: 'Processando' },
          { c: V.g2, l: 'Pago' },
          { c: V.y, l: 'Atrasado' },
          { c: V.r, l: 'Cancelado' },
          { c: V.t3, l: 'Pendente' },
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
            { l: 'Pedido', w: '0.8fr' },
            { l: 'Comprador', w: '1.4fr' },
            { l: 'Produto', w: '1fr' },
            { l: 'Valor', w: '0.7fr' },
            { l: 'Status', w: '0.4fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NeuroPulse w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message={kloelT(`Nenhum parcelamento encontrado`)} />
        ) : (
          rows.map((a: ReportRow, i: number) => {
            const st = statusMap[a.status ?? ''] || { c: V.t3, l: a.status };
            return (
              <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.4fr 1fr 0.7fr 0.4fr', padding: '12px 14px', borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none', alignItems: 'center' }} onMouseEnter={(e) => { e.currentTarget.style.background = V.e; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: V.t3 }}>{a.orderNumber || a.id?.slice(0, 12)}</span>
                <div>
                  <span style={{ fontSize: 11, color: V.t, display: 'block' }}>{a.customerName || '—'}</span>
                  <span style={{ fontSize: 9, color: V.t3 }}>{a.customerEmail}</span>
                </div>
                <span style={{ fontSize: 10, color: V.em, fontWeight: 500 }}>{a.plan?.name || '—'}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, color: V.t }}>{R$(a.totalInCents || 0)}</span>
                <StatusDot color={st.c} />
              </div>
            );
          })
        )}
        <Pagination total={data?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}
