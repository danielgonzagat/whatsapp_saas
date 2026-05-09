'use client';

import { kloelT } from '@/lib/i18n/t';
import type { Affiliate, AffiliatePerformance } from './partnershipTypes';
import { IC } from './ParceriasView.icons';
import { C, FONT } from './ParceriasDesignTokens';

export default function AffiliateMetricsGrid({
  affiliate,
  perfData,
  loading,
}: {
  affiliate: Affiliate;
  perfData: AffiliatePerformance | null;
  loading: boolean;
}) {
  const a = affiliate;
  const totalSales = perfData?.totalSales ?? a.totalSales ?? 0;
  const totalRevenue = perfData?.totalRevenue ?? a.revenue ?? 0;
  const commission = perfData?.commission ?? a.commission ?? 0;

  const cards = [
    { label: kloelT(`Vendas`), value: totalSales, icon: IC.box, color: C.text },
    { label: kloelT(`Comissao`), value: `${commission}%`, icon: IC.dollar, color: C.ember },
    { label: kloelT(`Receita`), value: 'R$ ' + Number(totalRevenue).toLocaleString('pt-BR', { minimumFractionDigits: 0 }), icon: IC.trend, color: C.text },
    { label: kloelT(`Temperatura`), value: `${a.temperature || 0}`, icon: IC.star, color: (a.temperature || 0) > 70 ? '#10B981' : '#F59E0B' },
  ];

  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20,
        opacity: loading ? 0.5 : 1, transition: 'opacity 200ms ease',
      }}
    >
      {cards.map((sc) => (
        <div key={sc.label}
          style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '14px 12px', textAlign: 'center' as const }}>
          <span style={{ color: C.muted }}>{sc.icon(14)}</span>
          <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: sc.color, marginTop: 4 }}>{sc.value}</div>
          <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.muted, marginTop: 2 }}>{sc.label}</div>
        </div>
      ))}
    </div>
  );
}
