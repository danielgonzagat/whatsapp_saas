'use client';

import { kloelT } from '@/lib/i18n/t';
import { Stat } from './Stat';
import { Badge } from './Badge';
import { TH } from './TH';
import { SORA, MONO, SUB_STATUS, fmtBRL, fmtDate } from './utils';
import type { SubStatsData, SubscriptionItem } from './types';

interface GestaoAssinaturasProps {
  subStats: SubStatsData;
  subscriptions: SubscriptionItem[];
  onOpenDetail: (id: string, type: 'sale' | 'sub' | 'order') => void;
}

const LIFECYCLE_BARS = [
  { label: 'Trial', key: 'trial' as const, color: '#3B82F6' },
  { label: 'Ativas', key: 'active' as const, color: 'colors.ember.primary' },
  { label: 'Atrasadas', key: 'past_due' as const, color: '#F59E0B' },
  { label: 'Pausadas', key: 'paused' as const, color: 'var(--app-text-secondary)' },
  { label: 'Canceladas', key: 'cancelled' as const, color: 'var(--app-text-tertiary)' },
];

export function GestaoAssinaturas({
  subStats,
  subscriptions,
  onOpenDetail,
}: GestaoAssinaturasProps) {
  const st = subStats;
  const lc = st.lifecycle || {};

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <Stat
          label="MRR"
          value={fmtBRL(st.mrr || 0)}
          color="colors.ember.primary"
          trend={st.mrrTrend}
        />
        <Stat label={kloelT('Assinaturas ativas')} value={String(st.activeCount || 0)} />
        <Stat
          label={kloelT('Churn rate')}
          value={`${st.churnRate || 0}%`}
          color={(st.churnRate || 0) > 5 ? '#EF4444' : '#10B981'}
        />
        <Stat label={kloelT('LTV medio')} value={fmtBRL(st.avgLtv || 0)} />
        <Stat
          label={kloelT('ARR projetado')}
          value={fmtBRL(st.arr || 0)}
          color="colors.ember.primary"
        />
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 24 }}
      >
        {LIFECYCLE_BARS.map((s) => (
          <div
            key={s.label}
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: 14,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                background: s.color,
                opacity: 0.5,
              }}
            />
            <span
              style={{
                fontFamily: MONO,
                fontSize: 24,
                fontWeight: 700,
                color: s.color,
                display: 'block',
              }}
            >
              {lc[s.key] || 0}
            </span>
            <span
              style={{
                fontSize: 10,
                color: 'var(--app-text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '.06em',
                fontFamily: SORA,
              }}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1.2fr 1fr 0.8fr 1fr 0.8fr',
            gap: 12,
            padding: '10px 16px',
            borderBottom: '1px solid var(--app-border-subtle)',
          }}
        >
          <TH>{kloelT('Assinante')}</TH>
          <TH>{kloelT('Plano')}</TH>
          <TH>{kloelT('Valor/mes')}</TH>
          <TH>{kloelT('Status')}</TH>
          <TH>LTV</TH>
          <TH>{kloelT('Prox. cobranca')}</TH>
        </div>
        {subscriptions.length === 0 ? (
          <div
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: '60px 20px',
              textAlign: 'center',
            }}
          >
            <span
              style={{
                fontSize: 14,
                color: 'var(--app-text-secondary)',
                display: 'block',
                marginBottom: 8,
              }}
            >
              {kloelT('Nenhuma assinatura encontrada')}
            </span>
            <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)' }}>
              {kloelT('Assinaturas aparecerao aqui quando seus clientes assinarem')}
            </span>
          </div>
        ) : (
          subscriptions.map((s, i) => (
            <div
              key={s.id}
              onClick={() => onOpenDetail(s.id, 'sub')}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.2fr 1fr 0.8fr 1fr 0.8fr',
                gap: 12,
                padding: '12px 16px',
                borderBottom:
                  i < subscriptions.length - 1 ? '1px solid var(--app-border-subtle)' : 'none',
                cursor: 'pointer',
                transition: 'background .1s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--app-bg-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).click();
                }
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--app-text-primary)',
                    display: 'block',
                    fontFamily: SORA,
                  }}
                >
                  {s.customerName}
                </span>
                <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                  {kloelT('Desde')} {fmtDate(s.startedAt || new Date())}
                </span>
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--app-text-secondary)',
                  alignSelf: 'center',
                  fontFamily: SORA,
                }}
              >
                {s.planName}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--app-text-primary)',
                  alignSelf: 'center',
                }}
              >
                {fmtBRL(s.amount)}
              </span>
              <div style={{ alignSelf: 'center' }}>
                <Badge status={s.status} config={SUB_STATUS} />
              </div>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: 'colors.ember.primary',
                  fontWeight: 600,
                  alignSelf: 'center',
                }}
              >
                {fmtBRL(s.totalPaid || 0)}
              </span>
              <span
                style={{ fontSize: 11, color: 'var(--app-text-tertiary)', alignSelf: 'center' }}
              >
                {s.nextBillingAt ? fmtDate(s.nextBillingAt) : '\u2014'}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
