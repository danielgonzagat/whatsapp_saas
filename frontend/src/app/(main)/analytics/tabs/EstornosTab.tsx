'use client';

import { kloelT } from '@/lib/i18n/t';
import { V, FONT_MONO, chartCardStyle, inputStyle } from '../analytics.design-tokens';
import { R$ } from '../analytics.design-tokens';
import { ICONS } from '../shared/Icons';
import { MetricCard, StatusDot, Pagination, TableHeader, EmptyState, FilterBar, FilterField } from '../shared/Components';
import { NeuroPulse } from '../shared/NeuroPulse';
import { useReport } from '../use-report';
import type { ReportFilters, ReportRow, PaginatedReport, SetFilters, SetPage } from '../analytics.types';

export function EstornosTab({
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
  setPage: SetPage;
}) {
  const { data, isLoading } = useReport<PaginatedReport>('estornos', baseFilters);
  const rows = data?.data || [];
  const valorTotal = rows.reduce((acc: number, r: ReportRow) => acc + (r.totalInCents || 0), 0);
  const processando = rows.filter((r: ReportRow) => r.status === 'PROCESSING').length;
  const negados = rows.filter((r: ReportRow) => r.status === 'DECLINED' || r.status === 'DENIED').length;

  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title={kloelT(`Total estornos`)}
          value={String(data?.total || 0)}
          sub={kloelT(`No periodo`)}
          color={V.r}
          icon={ICONS.undo}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Valor estornado`)}
          value={R$(valorTotal)}
          sub={kloelT(`Valor total devolvido`)}
          color={V.p}
          icon={ICONS.dollar}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Processando`)}
          value={String(processando)}
          sub={kloelT(`Em analise`)}
          color={V.bl}
          icon={ICONS.clock}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Negados`)}
          value={String(negados)}
          sub={kloelT(`Estornos recusados`)}
          color={V.y}
          icon={ICONS.ban}
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
            <option value="PROCESSING">{kloelT(`Processando`)}</option>
            <option value="REFUNDED">{kloelT(`Estornado`)}</option>
            <option value="DENIED">{kloelT(`Negado`)}</option>
            <option value="CANCELED">{kloelT(`Cancelado`)}</option>
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
          { c: V.p, l: 'Estornado' },
          { c: V.y, l: 'Negado' },
          { c: V.r, l: 'Cancelado' },
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
            { l: 'Pedido', w: '0.7fr' },
            { l: 'Comprador', w: '1.3fr' },
            { l: 'Produto', w: '1fr' },
            { l: 'Valor', w: '0.7fr' },
            { l: 'Data', w: '0.8fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NeuroPulse w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message={kloelT(`Nenhum estorno no periodo`)} />
        ) : (
          rows.map((r: ReportRow, i: number) => (
            <div
              key={r.id || i}
              style={{
                display: 'grid',
                gridTemplateColumns: '0.7fr 1.3fr 1fr 0.7fr 0.8fr',
                padding: '12px 14px',
                borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = V.e; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: V.t2 }}>
                {r.orderNumber || r.id?.slice(0, 10)}
              </span>
              <div>
                <span style={{ fontSize: 11, color: V.t, display: 'block' }}>
                  {r.customerName || '\u2014'}
                </span>
                <span style={{ fontSize: 9, color: V.t3 }}>{r.customerEmail}</span>
              </div>
              <span style={{ fontSize: 10, color: V.em, fontWeight: 500 }}>
                {r.plan?.product?.name || '\u2014'}
              </span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, color: V.r }}>
                {R$(r.totalInCents || 0)}
              </span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: V.t2 }}>
                {r.refundedAt ? new Date(r.refundedAt).toLocaleDateString('pt-BR') : '\u2014'}
              </span>
            </div>
          ))
        )}
        <Pagination total={data?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}
