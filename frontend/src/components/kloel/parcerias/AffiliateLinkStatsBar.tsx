'use client';

import type { AffiliateLinksTotals } from './partnershipTypes';
import { C, FONT } from './ParceriasDesignTokens';

function fmtMoney(n: number) {
  return 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

export default function AffiliateLinkStatsBar({ totals }: { totals: AffiliateLinksTotals }) {
  const cards = [
    { label: 'Cliques', value: totals.clicks },
    { label: 'Vendas', value: totals.sales },
    { label: 'Receita', value: fmtMoney(totals.revenue) },
    { label: 'Comissao', value: fmtMoney(totals.commission) },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
      {cards.map((s) => (
        <div key={s.label}
          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '14px 16px' }}>
          <div style={{ fontFamily: FONT.sans, fontSize: 11, color: C.secondary, marginBottom: 4 }}>{s.label}</div>
          <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: C.text }}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}
