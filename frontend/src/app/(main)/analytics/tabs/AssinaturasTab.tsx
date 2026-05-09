'use client';

import { kloelT } from '@/lib/i18n/t';
import { V, FONT_MONO, chartCardStyle } from '../analytics.design-tokens';
import { R$ } from '../analytics.design-tokens';
import { ICONS } from '../shared/Icons';
import { MetricCard, StatusDot, Pagination, TableHeader, EmptyState } from '../shared/Components';
import { NeuroPulse } from '../shared/NeuroPulse';
import { statusMap } from '../shared/status-maps';
import { useReport } from '../use-report';
import type {
  ReportFilters,
  ReportRow,
  AssinaturasResponse,
  SubscriptionSummaryRow,
} from '../analytics.types';

export function AssinaturasTab({
  baseFilters,
  page,
  setPage,
}: {
  baseFilters: ReportFilters & { page: number; perPage: number };
  page: number;
  setPage: (p: number) => void;
}) {
  const { data, isLoading } = useReport<AssinaturasResponse>('assinaturas', baseFilters);
  const rows = data?.data || [];
  const summary = data?.summary || [];
  const activeCount =
    summary.find((s: SubscriptionSummaryRow) => s.status === 'ACTIVE')?._count || 0;
  const cancelledCount =
    summary.find((s: SubscriptionSummaryRow) => s.status === 'CANCELLED')?._count || 0;
  const pastDueCount =
    summary.find((s: SubscriptionSummaryRow) => s.status === 'PAST_DUE')?._count || 0;
  const othersCount = summary
    .filter(
      (s: SubscriptionSummaryRow) =>
        !['ACTIVE', 'CANCELLED', 'PAST_DUE'].includes(s.status),
    )
    .reduce((acc: number, s: SubscriptionSummaryRow) => acc + (s._count || 0), 0);

  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title={kloelT(`Ativas`)}
          value={String(activeCount)}
          color={V.g2}
          icon={ICONS.check}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Canceladas`)}
          value={String(cancelledCount)}
          color={V.r}
          icon={ICONS.ban}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Atrasadas`)}
          value={String(pastDueCount)}
          color={V.y}
          icon={ICONS.alert}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Outros`)}
          value={String(othersCount)}
          color={V.t3}
          icon={ICONS.clock}
          loading={isLoading}
        />
      </div>
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
          { c: V.cy, l: 'Iniciada' },
          { c: V.bl, l: 'Aguardando' },
          { c: V.g2, l: 'Ativa' },
          { c: V.y, l: 'Atrasada' },
          { c: V.r, l: 'Cancelada' },
          { c: V.t3, l: 'Inativa' },
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
            { l: 'Assinante', w: '1.8fr' },
            { l: 'Produto', w: '1fr' },
            { l: 'Valor', w: '0.7fr' },
            { l: 'Prox. Cobranca', w: '0.9fr' },
            { l: 'Status', w: '0.4fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NeuroPulse w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message={kloelT(`Nenhuma assinatura encontrada`)} />
        ) : (
          rows.map((s: ReportRow, i: number) => {
            const st = statusMap[s.status ?? ''] || { c: V.t3, l: s.status };
            return (
              <div
                key={s.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.8fr 1fr .7fr .9fr .4fr',
                  padding: '12px 14px',
                  borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = V.e;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div>
                  <span style={{ fontSize: 11, color: V.t, display: 'block' }}>
                    {s.customerName}
                  </span>
                  <span style={{ fontSize: 9, color: V.t3 }}>{s.customerEmail}</span>
                </div>
                <span style={{ fontSize: 11, color: V.em }}>{s.planName || '—'}</span>
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 10,
                    fontWeight: 600,
                    color: V.t,
                  }}
                >
                  {R$(s.amount || 0)}
                </span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: V.t2 }}>
                  {s.nextBillingAt
                    ? new Date(s.nextBillingAt).toLocaleDateString('pt-BR')
                    : '—'}
                </span>
                <StatusDot color={st.c} />
              </div>
            );
          })
        )}
        <Pagination total={data?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}
