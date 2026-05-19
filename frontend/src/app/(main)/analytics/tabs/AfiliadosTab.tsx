'use client';

import { kloelT } from '@/lib/i18n/t';
import { V, FONT_MONO, chartCardStyle } from '../analytics.design-tokens';
import { R$ } from '../analytics.design-tokens';
import { StatusDot, NeuroPulse, TableHeader, EmptyState } from '../shared/Components';
import { statusMap } from '../shared/status-maps';
import { useReport } from '../use-report';
import type { ReportFilters, ReportRow } from '../analytics.types';

export function AfiliadosTab({ filters }: { filters: ReportFilters }) {
  const { data, isLoading } = useReport<ReportRow[]>('afiliados', filters);
  const rows = Array.isArray(data) ? data : [];

  return (
    <div style={{ ...chartCardStyle, overflow: 'hidden' }}>
      <TableHeader
        cols={[
          { l: 'Afiliado', w: '2fr' },
          { l: 'Vendas', w: '0.8fr' },
          { l: 'Receita', w: '1fr' },
          { l: 'Comissao', w: '1fr' },
          { l: 'Status', w: '0.4fr' },
        ]}
      />
      {isLoading ? (
        <div style={{ padding: 20 }}>
          <NeuroPulse w={200} h={20} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState message={kloelT(`Nenhum afiliado encontrado`)} />
      ) : (
        rows.map((a: ReportRow, i: number) => (
          <div
            key={a.id || i}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr .8fr 1fr 1fr .4fr',
              padding: '12px 14px',
              borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = V.e; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div>
              <span style={{ fontSize: 12, fontWeight: 500, color: V.t, display: 'block' }}>
                {a.partnerName || '\u2014'}
              </span>
              <span style={{ fontSize: 9, color: V.t3 }}>{a.partnerEmail}</span>
            </div>
            <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: V.bl, fontWeight: 600 }}>
              {a.totalSales || 0}
            </span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: V.t2 }}>
              {R$((a.totalRevenue || 0) * 100)}
            </span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, color: V.em }}>
              {R$((a.totalCommission || 0) * 100)}
            </span>
            <StatusDot color={(statusMap[a.status ?? ''] || { c: V.t3 }).c} />
          </div>
        ))
      )}
    </div>
  );
}
