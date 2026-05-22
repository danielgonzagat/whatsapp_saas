'use client';

import { kloelT } from '@/lib/i18n/t';
import { useSmartTime, useAnalyticsStats, useReports } from '@/hooks/useReports';
import { V, FONT_MONO, chartCardStyle, R$ } from '../analytics.design-tokens';
import { ICONS } from '../shared/Icons';
import { MetricCard, EmptyState, NeuroPulse } from '../shared/Components';
import type { ReportFilters } from '../analytics.types';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

export function EngajamentoTab({ filters }: { filters: ReportFilters }) {
  const { smartTime, isLoading: stLoading } = useSmartTime();
  const { stats, isLoading: statsLoading } = useAnalyticsStats();
  const { report, isLoading: rLoading } = useReports(
    filters.startDate && filters.endDate
      ? `custom:${filters.startDate}:${filters.endDate}`
      : '30d',
  );

  const heatmapLookup = new Map<string, number>();
  if (smartTime?.heatmap) {
    for (const cell of smartTime.heatmap) {
      heatmapLookup.set(`${cell.day}:${cell.hour}`, cell.score);
    }
  }

  const maxScore = smartTime?.heatmap?.length
    ? Math.max(...smartTime.heatmap.map((c) => c.score), 1)
    : 1;

  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title={kloelT(`Mensagens enviadas`)}
          value={rLoading ? '' : String(report?.messages?.total ?? 0)}
          {...(report?.messages?.outbound !== undefined ? { sub: kloelT(`${report.messages.outbound} saida`) } : {})}
          color={V.bl}
          icon={ICONS.phone}
          loading={rLoading}
        />
        <MetricCard
          title={kloelT(`Taxa de entrega`)}
          value={statsLoading ? '' : `${stats.deliveryRate ?? 0}%`}
          sub={kloelT(`Ultimo periodo`)}
          color={V.g2}
          icon={ICONS.check}
          loading={statsLoading}
        />
        <MetricCard
          title={kloelT(`Flows ativos`)}
          value={statsLoading ? '' : String(stats.flows ?? 0)}
          sub={kloelT(`${stats.flowCompleted ?? 0} concluidos`)}
          color={V.em}
          icon={ICONS.chart}
          loading={statsLoading}
        />
        <MetricCard
          title={kloelT(`Melhor horario`)}
          value={stLoading ? '' : `${smartTime?.peakHour ?? '--'}:00`}
          {...(smartTime?.peakDay ? { sub: kloelT(`${smartTime.peakDay}`) } : {})}
          color={V.p}
          icon={ICONS.clock}
          loading={stLoading}
        />
      </div>

      {/* ── Smart Time Heatmap ── */}
      {!stLoading && !smartTime ? (
        <div style={{ marginBottom: 20 }}>
          <EmptyState message={kloelT(`Dados de melhor horario indisponiveis para este periodo`)} />
        </div>
      ) : (
        <div style={{ ...chartCardStyle, padding: 20, marginBottom: 20 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: V.t, display: 'block', marginBottom: 14 }}>
            {kloelT(`Heatmap de engajamento`)}
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(24, 1fr)`, gap: 2 }}>
            <div />
            {Array.from({ length: 24 }, (_, h) => (
              <span
                key={h}
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 7,
                  color: V.t3,
                  textAlign: 'center' as const,
                  lineHeight: '14px',
                }}
              >
                {h}
              </span>
            ))}
            {DAYS.map((day) => (
              <div key={day} style={{ display: 'contents' }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: V.t3, lineHeight: '20px' }}>
                  {day}
                </span>
                {Array.from({ length: 24 }, (_, hour) => {
                  const score = heatmapLookup.get(`${day}:${hour}`) ?? 0;
                  const opacity = score === 0 ? 0.04 : 0.15 + (score / maxScore) * 0.85;
                  return (
                    <div
                      key={hour}
                      title={`${day} ${hour}:00 — ${score}`}
                      style={{
                        background: V.em,
                        opacity,
                        borderRadius: 4,
                        height: 18,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
            <span style={{ fontSize: 8, color: V.t3, fontFamily: FONT_MONO }}>
              {kloelT(`Menos ativo`)}
            </span>
            {[0.04, 0.25, 0.5, 0.75, 1].map((o) => (
              <div key={o} style={{ width: 14, height: 14, background: V.em, opacity: o, borderRadius: 4 }} />
            ))}
            <span style={{ fontSize: 8, color: V.t3, fontFamily: FONT_MONO }}>
              {kloelT(`Mais ativo`)}
            </span>
          </div>
        </div>
      )}

      {/* ── Report Grid ── */}
      {!rLoading && !report ? (
        <div style={{ marginBottom: 20 }}>
          <EmptyState message={kloelT(`Dados do relatorio indisponiveis`)} />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { t: kloelT(`Mensagens`), v: rLoading ? '' : String(report?.messages?.total ?? 0), c: V.bl, i: ICONS.phone, l: rLoading },
            { t: kloelT(`Leads novos`), v: rLoading ? '' : String(report?.leads?.newContacts ?? 0), c: V.g2, i: ICONS.users, l: rLoading },
            { t: kloelT(`Flows executados`), v: rLoading ? '' : String(report?.flows?.executions ?? 0), c: V.em, i: ICONS.chart, l: rLoading },
            { t: kloelT(`Flows concluidos`), v: rLoading ? '' : String(report?.flows?.completed ?? 0), c: V.g2, i: ICONS.check, l: rLoading },
            { t: kloelT(`Receita (vendas)`), v: rLoading ? '' : R$(report?.sales?.revenue ?? 0), c: V.g2, i: ICONS.dollar, l: rLoading },
          ].map((m) => (
            <MetricCard key={m.t} title={m.t} value={m.v} color={m.c} icon={m.i} loading={m.l} />
          ))}
        </div>
      )}

      {/* ── Sentiment ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        <div style={{ ...chartCardStyle, padding: 20 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: V.t, display: 'block', marginBottom: 14 }}>
            {kloelT(`Sentimento`)}
          </span>
          {statsLoading ? (
            <NeuroPulse w={200} h={20} />
          ) : stats.sentiment?.positive === undefined ? (
            <EmptyState message={kloelT(`Dados de sentimento indisponiveis`)} />
          ) : (
            ['positive', 'neutral', 'negative'].map((key) => {
              const val = (stats.sentiment as Record<string, number>)[key] ?? 0;
              const colors: Record<string, string> = { positive: V.g2, neutral: V.y, negative: V.r };
              const label = key === 'positive' ? 'Positivo' : key === 'neutral' ? 'Neutro' : 'Negativo';
              const total = (stats.sentiment?.positive ?? 0) + (stats.sentiment?.neutral ?? 0) + (stats.sentiment?.negative ?? 0);
              const pct = total > 0 ? Math.round((val / total) * 100) : 0;
              return (
                <div key={key} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: V.t2 }}>{kloelT(label)}</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: colors[key] }}>{pct}%</span>
                  </div>
                  <div style={{ height: 6, background: V.e, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: colors[key], borderRadius: 4, transition: 'width .4s' }} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Lead Score ── */}
        <div style={{ ...chartCardStyle, padding: 20 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: V.t, display: 'block', marginBottom: 14 }}>
            {kloelT(`Lead Score`)}
          </span>
          {statsLoading ? (
            <NeuroPulse w={200} h={20} />
          ) : stats.leadScore?.high === undefined ? (
            <EmptyState message={kloelT(`Dados de lead score indisponiveis`)} />
          ) : (
            ['high', 'medium', 'low'].map((key) => {
              const val = (stats.leadScore as Record<string, number>)[key] ?? 0;
              const colors: Record<string, string> = { high: V.g2, medium: V.y, low: V.r };
              const label = key === 'high' ? 'Alto' : key === 'medium' ? 'Medio' : 'Baixo';
              const total = (stats.leadScore?.high ?? 0) + (stats.leadScore?.medium ?? 0) + (stats.leadScore?.low ?? 0);
              const pct = total > 0 ? Math.round((val / total) * 100) : 0;
              return (
                <div key={key} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: V.t2 }}>{kloelT(label)}</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: colors[key] }}>{pct}%</span>
                  </div>
                  <div style={{ height: 6, background: V.e, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: colors[key], borderRadius: 4, transition: 'width .4s' }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
