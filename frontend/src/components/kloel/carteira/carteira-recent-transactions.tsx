'use client';
import { kloelT } from '@/lib/i18n/t';
import { TYPE_CONFIG } from './carteira.config';
import { Fmt } from './carteira.helpers';
import type { TransactionItem } from './carteira.types';

export function RecentTransactionsCard({
  txList,
  onNavigateExtrato,
}: {
  txList: TransactionItem[];
  onNavigateExtrato: () => void;
}) {
  return (
    <div
      style={{
        background: 'var(--app-bg-card)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 6,
        padding: 20,
      }}
    >
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--app-text-primary)',
          display: 'block',
          marginBottom: 14,
        }}
      >
        {kloelT(`Ultimas transacoes`)}
      </span>
      {txList.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)' }}>
            {kloelT(`Nenhuma transacao encontrada`)}
          </span>
        </div>
      ) : (
        txList.slice(0, 5).map((t, i) => {
          const cfg = TYPE_CONFIG[t.type] || TYPE_CONFIG.sale;
          return (
            <div
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 0',
                borderBottom:
                  i < Math.min(txList.length, 5) - 1
                    ? '1px solid var(--app-border-subtle)'
                    : 'none',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: `${cfg.color}12`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: cfg.color,
                  flexShrink: 0,
                }}
              >
                {cfg.icon(12)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--app-text-primary)',
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.desc}
                </span>
                <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                  {t.date} {t.time}
                </span>
              </div>
              <span
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 13,
                  fontWeight: 600,
                  color: t.amount > 0 ? cfg.color : 'var(--app-text-secondary)',
                }}
              >
                {t.amount > 0 ? '+' : ''}
                {kloelT(`R$`)} {Fmt(t.amount)}
              </span>
            </div>
          );
        })
      )}
      <button
        type="button"
        onClick={onNavigateExtrato}
        style={{
          width: '100%',
          marginTop: 10,
          padding: '8px 14px',
          background: 'none',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          color: 'var(--app-text-secondary)',
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: "'Sora',sans-serif",
        }}
      >
        {kloelT(`Ver extrato completo`)}
      </button>
    </div>
  );
}
