'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Fmt } from './carteira.helpers';
import { IC } from './carteira.config';
import type { AnticipationItem } from './carteira.types';

export function CarteiraTabAntecipacoes({
  pending,
  onOpenAntecipate,
  anticipations,
  antTotals,
}: {
  pending: number;
  onOpenAntecipate: () => void;
  anticipations: AnticipationItem[];
  antTotals: Record<string, number>;
}) {
  const antList = anticipations;
  const totalAnticipated = antTotals.totalAnticipated || 0;
  const totalFees = antTotals.totalFees || 0;
  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 1fr',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 16,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--app-text-secondary)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: 6,
            }}
          >
            {kloelT(`Antecipavel agora`)}
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 20,
              fontWeight: 600,
              color: 'colors.ember.primary',
            }}
          >
            {kloelT(`R$`)} {Fmt(pending)}
          </span>
        </div>
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 16,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--app-text-secondary)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: 6,
            }}
          >
            {kloelT(`Total antecipado`)}
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 20,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
            }}
          >
            {kloelT(`R$`)} {Fmt(totalAnticipated)}
          </span>
        </div>
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 16,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--app-text-secondary)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: 6,
            }}
          >
            {kloelT(`Taxas pagas`)}
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 20,
              fontWeight: 600,
              color: 'var(--app-text-secondary)',
            }}
          >
            {kloelT(`R$`)} {Fmt(totalFees)}
          </span>
        </div>
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={onOpenAntecipate}
            style={{
              padding: '10px 24px',
              background: 'colors.ember.primary',
              color: 'var(--app-text-on-accent)',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'Sora',sans-serif",
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {IC.spark(14)} {kloelT(`Antecipar agora`)}
          </button>
        </div>
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
            gridTemplateColumns: '1fr 0.8fr 0.6fr 1fr 0.7fr 0.6fr',
            gap: 12,
            padding: '10px 16px',
            borderBottom: '1px solid var(--app-border-subtle)',
          }}
        >
          {['Valor original', 'Taxa', '% Taxa', 'Valor liquido', 'Parcelas', 'Data'].map((h) => (
            <span
              key={h}
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--app-text-tertiary)',
                letterSpacing: '.06em',
                textTransform: 'uppercase',
              }}
            >
              {h}
            </span>
          ))}
        </div>
        {antList.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--app-text-tertiary)' }}>
              {kloelT(`Nenhuma antecipacao realizada`)}
            </span>
          </div>
        ) : (
          antList.map((a: AnticipationItem, i: number) => (
            <div
              key={a.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 0.8fr 0.6fr 1fr 0.7fr 0.6fr',
                gap: 12,
                padding: '14px 16px',
                borderBottom:
                  i < antList.length - 1 ? '1px solid var(--app-border-subtle)' : 'none',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 13,
                  color: 'var(--app-text-primary)',
                }}
              >
                {kloelT(`R$`)} {Fmt(a.original || a.originalAmount || 0)}
              </span>
              <span
                style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: colors.semantic.error }}
              >
                {kloelT(`- R$`)} {Fmt(a.fee || a.feeAmount || 0)}
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 11,
                  color: 'var(--app-text-secondary)',
                }}
              >
                {a.feePct || a.feePercent || 3.0}%
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'colors.ember.primary',
                }}
              >
                {kloelT(`R$`)} {Fmt(a.net || a.netAmount || 0)}
              </span>
              <span style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
                {a.installments || '—'}x
              </span>
              <span style={{ fontSize: 11, color: 'var(--app-text-tertiary)' }}>
                {a.date || (a.createdAt ? new Date(a.createdAt).toLocaleDateString('pt-BR') : '')}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
