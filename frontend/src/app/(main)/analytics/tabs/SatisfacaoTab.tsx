'use client';

import { kloelT } from '@/lib/i18n/t';
import { useNps } from '@/hooks/useDetailedReports';
import { V, FONT_MONO, chartCardStyle } from '../analytics.design-tokens';
import { ICONS } from '../shared/Icons';
import { MetricCard, NeuroPulse, TableHeader, EmptyState, ChartTooltip } from '../shared/Components';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface DistributionBucket {
  score: number;
  total: number;
}

export function SatisfacaoTab() {
  const { nps, isLoading } = useNps();

  const distribution: DistributionBucket[] = useMemo(() => {
    const buckets = Array.from({ length: 11 }, (_, score) => ({
      score,
      total: nps.responses.filter((item) => Number(item.details?.score ?? -1) === score).length,
    }));
    return buckets;
  }, [nps.responses]);

  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title="NPS"
          value={String(nps.nps || 0)}
          sub={kloelT(`Net Promoter Score`)}
          color={V.g2}
          icon={ICONS.check}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Nota media`)}
          value={String(nps.avg || '0.0')}
          sub={kloelT(`Media das respostas`)}
          color={V.em}
          icon={ICONS.perc}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Respostas`)}
          value={String(nps.total || 0)}
          sub={kloelT(`Coletas registradas`)}
          color={V.bl}
          icon={ICONS.users}
          loading={isLoading}
        />
      </div>

      {!isLoading && distribution.some((item) => item.total > 0) && (
        <div style={{ ...chartCardStyle, padding: 20, marginBottom: 20 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: V.t, display: 'block', marginBottom: 16 }}>
            {kloelT(`Distribuicao de notas`)}
          </span>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={distribution}>
              <CartesianGrid strokeDasharray="3 3" stroke={V.b} vertical={false} />
              <XAxis
                dataKey="score"
                tick={{ fontSize: 9, fill: V.t3, fontFamily: FONT_MONO }}
                stroke={V.b}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: V.t3, fontFamily: FONT_MONO }}
                stroke={V.b}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="total" fill={V.g2} radius={[3, 3, 0, 0]} name="Respostas" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {isLoading ? (
        <div style={{ ...chartCardStyle, padding: 20 }}>
          <NeuroPulse w={200} h={20} />
        </div>
      ) : nps.responses.length === 0 ? (
        <EmptyState message={kloelT(`Nenhuma resposta de satisfacao registrada ainda`)} />
      ) : (
        <div style={{ ...chartCardStyle, overflow: 'hidden' }}>
          <TableHeader
            cols={[
              { l: 'Nota', w: '0.5fr' },
              { l: 'Comentario', w: '2fr' },
              { l: 'Pedido', w: '0.8fr' },
              { l: 'Data', w: '0.8fr' },
            ]}
          />
          {nps.responses.map((response, index) => (
            <div
              key={response.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '0.5fr 2fr 0.8fr 0.8fr',
                padding: '12px 14px',
                borderBottom: index < nps.responses.length - 1 ? `1px solid ${V.b}` : 'none',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = V.e; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{
                fontFamily: FONT_MONO,
                fontSize: 16,
                fontWeight: 700,
                color:
                  Number(response.details?.score ?? 0) >= 9
                    ? V.g2
                    : Number(response.details?.score ?? 0) >= 7
                      ? V.y
                      : V.r,
              }}>
                {response.details?.score ?? '\u2014'}
              </span>
              <span style={{ fontSize: 11, color: V.t }}>
                {response.details?.comment || kloelT(`Sem comentario`)}
              </span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: V.t2 }}>
                {response.details?.orderId || '\u2014'}
              </span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: V.t2 }}>
                {response.createdAt
                  ? new Date(response.createdAt).toLocaleDateString('pt-BR')
                  : '\u2014'}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
