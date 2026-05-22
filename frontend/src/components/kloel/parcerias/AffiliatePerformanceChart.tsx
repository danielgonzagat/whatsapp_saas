'use client';

import { kloelT } from '@/lib/i18n/t';
import type { Affiliate, AffiliatePerformance } from './partnershipTypes';
import { C, FONT, MONTH_LABELS } from './ParceriasDesignTokens';

export default function AffiliatePerformanceChart({
  affiliate,
  perfData,
}: {
  affiliate: Affiliate;
  perfData: AffiliatePerformance | null;
}) {
  const a = affiliate;
  const rawChartData: number[] = perfData?.monthlyPerformance || a.monthlyPerformance || new Array(12).fill(0);
  const chartData = rawChartData.map((value, idx) => ({ value, label: MONTH_LABELS[idx] ?? `m${idx}` }));
  const chartMax = Math.max(...rawChartData, 1);

  return (
    <div style={{ marginBottom: 20 }}>
      <h4 style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: C.secondary, marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
        {kloelT(`Performance (12 meses)`)}
      </h4>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '12px 14px' }}>
        {chartData.map((point) => (
          <div key={`chart-bar-${point.label}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ width: '100%', height: `${(point.value / chartMax) * 56}px`, background: C.ember, borderRadius: 4, opacity: 0.6 + (point.value / chartMax) * 0.4, transition: 'height 300ms ease' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontFamily: FONT.sans, fontSize: 9, color: C.muted }}>{kloelT(`Jan`)}</span>
        <span style={{ fontFamily: FONT.sans, fontSize: 9, color: C.muted }}>{kloelT(`Jun`)}</span>
        <span style={{ fontFamily: FONT.sans, fontSize: 9, color: C.muted }}>{kloelT(`Dez`)}</span>
      </div>
    </div>
  );
}
