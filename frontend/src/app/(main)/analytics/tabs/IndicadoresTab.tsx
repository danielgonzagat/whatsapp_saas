'use client';

import { kloelT } from '@/lib/i18n/t';
import { V, FONT_MONO, chartCardStyle } from '../analytics.design-tokens';
import { R$ } from '../analytics.design-tokens';
import { NeuroPulse, TableHeader, EmptyState } from '../shared/Components';
import { useReport } from '../use-report';
import type { ReportFilters, ReportRow } from '../analytics.types';

export function IndicadoresTab({ filters }: { filters: ReportFilters }) {
  const { data, isLoading } = useReport<ReportRow[]>('indicadores', filters);
  const rows = Array.isArray(data) ? data : [];

  return (
    <div style={{ ...chartCardStyle, overflow: 'hidden' }}>
      <TableHeader
        cols={[
          { l: 'Afiliado', w: '1.8fr' },
          { l: 'Vendas', w: '0.8fr' },
          { l: 'Receita', w: '1fr' },
          { l: 'Comissao', w: '1fr' },
        ]}
      />
      {isLoading ? (
        <div style={{ padding: 20 }}>
          <NeuroPulse w={200} h={20} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState message={kloelT(`Nenhum indicador encontrado`)} />
      ) : (
        rows.map((a: ReportRow, i: number) => (
          <div
            key={a.partnerName || a.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.8fr .8fr 1fr 1fr',
              padding: '14px 14px',
              borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = V.e; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div>
              <span style={{ fontSize: 12, fontWeight: 500, color: V.t, display: 'block' }}>
                {a.partnerName}
              </span>
              <span style={{ fontSize: 9, color: V.t3 }}>{a.partnerEmail}</span>
            </div>
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: V.t2 }}>
              {a.totalSales || 0}
            </span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: V.g2, fontWeight: 600 }}>
              {R$((a.totalRevenue || 0) * 100)}
            </span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, color: V.em }}>
              {R$((a.totalCommission || 0) * 100)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
