'use client';

import { kloelT } from '@/lib/i18n/t';
import { V, FONT_MONO, chartCardStyle } from '../analytics.design-tokens';
import { R$, Fmt } from '../analytics.design-tokens';
import { ICONS } from '../shared/Icons';
import { MetricCard } from '../shared/Components';
import { useReport } from '../use-report';
import type { ReportFilters, MetricasResponse } from '../analytics.types';

export function MetricasTab({ filters }: { filters: ReportFilters }) {
  const { data, isLoading } = useReport<MetricasResponse>('metricas', filters);
  const methods = data?.byMethod || {};
  const total = data?.totalSales || 0;

  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title={kloelT(`Total vendas`)}
          value={Fmt(total)}
          color={V.em}
          icon={ICONS.chart}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Conversão`)}
          value={`${data?.conversao || 0}%`}
          color={V.g2}
          icon={ICONS.perc}
          loading={isLoading}
        />
        <MetricCard
          title="ROAS"
          value={data?.roas ? `${data.roas}x` : '\u2014'}
          sub={
            data?.totalAdSpend
              ? `Ad spend: ${R$(data.totalAdSpend)}`
              : 'Registre gastos com an\u00FAncios'
          }
          color={
            data?.roas && Number.parseFloat(data.roas) >= 3
              ? V.g2
              : data?.roas && Number.parseFloat(data.roas) >= 1.5
                ? V.y
                : V.r
          }
          icon={ICONS.target}
          loading={isLoading}
        />
      </div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        {[
          { l: 'Cartão', v: methods.CREDIT_CARD || 0, c: V.g2 },
          { l: 'Pix', v: methods.PIX || 0, c: V.bl },
          { l: 'Boleto', v: methods.BOLETO || 0, c: V.y },
        ].map((m) => (
          <div key={m.l} style={{ ...chartCardStyle, padding: 16, flex: 1 }}>
            <span style={{ fontSize: 11, color: V.t2, display: 'block' }}>{m.l}</span>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 28,
                fontWeight: 700,
                color: m.c,
                display: 'block',
                marginTop: 4,
              }}
            >
              {Fmt(m.v)}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <div
                style={{
                  flex: 1,
                  height: 4,
                  background: V.e,
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${total > 0 ? (m.v / total) * 100 : 0}%`,
                    height: '100%',
                    background: m.c,
                    borderRadius: 2,
                  }}
                />
              </div>
              <span style={{ fontSize: 10, color: V.t3 }}>
                {total > 0 ? ((m.v / total) * 100).toFixed(1) : 0}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
