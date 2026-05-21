'use client';

import { kloelT } from '@/lib/i18n/t';
import { V, FONT_MONO, chartCardStyle } from '../analytics.design-tokens';
import { ICONS } from '../shared/Icons';
import { MetricCard, StatusDot, Pagination, TableHeader, EmptyState } from '../shared/Components';
import { NeuroPulse } from '../shared/NeuroPulse';
import { useReport } from '../use-report';
import type { ReportFilters, ReportRow, PaginatedReport } from '../analytics.types';
import type { SetPage } from '../analytics.types';

export function RecusaTab({
  baseFilters,
  page,
  setPage,
}: {
  baseFilters: ReportFilters;
  page: number;
  setPage: SetPage;
}) {
  const { data, isLoading } = useReport<PaginatedReport>('recusa', baseFilters);
  const rows = data?.data || [];

  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        <MetricCard
          title={kloelT(`Total recusas`)}
          value={String(data?.total || 0)}
          sub={kloelT(`No período`)}
          color={V.r}
          icon={ICONS.alert}
          loading={isLoading}
        />
      </div>
      <div style={{ ...chartCardStyle, overflow: 'hidden' }}>
        <TableHeader
          cols={[
            { l: 'Pedido', w: '0.7fr' },
            { l: 'Comprador', w: '1.3fr' },
            { l: 'Produto', w: '1fr' },
            { l: 'Data', w: '0.8fr' },
            { l: 'Status', w: '0.4fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NeuroPulse w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message={kloelT(`Nenhuma recusa no período`)} />
        ) : (
          rows.map((r: ReportRow, i: number) => (
            <div
              key={r.id || i}
              style={{
                display: 'grid',
                gridTemplateColumns: '0.7fr 1.3fr 1fr 0.8fr .4fr',
                padding: '12px 14px',
                borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                alignItems: 'center',
              }}
            >
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: V.t2 }}>
                {r.order?.orderNumber || r.id?.slice(0, 10)}
              </span>
              <div>
                <span style={{ fontSize: 11, color: V.t, display: 'block' }}>
                  {r.order?.customerName}
                </span>
                <span style={{ fontSize: 9, color: V.t3 }}>{r.order?.customerEmail}</span>
              </div>
              <span style={{ fontSize: 10, color: V.em, fontWeight: 500 }}>
                {r.order?.plan?.product?.name || '\u2014'}
              </span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: V.t2 }}>
                {r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR') : '\u2014'}
              </span>
              <StatusDot color={V.r} />
            </div>
          ))
        )}
        <Pagination total={data?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}
