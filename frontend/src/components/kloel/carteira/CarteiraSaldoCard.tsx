'use client';

import { kloelT } from '@/lib/i18n/t';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { IC, TYPE_CONFIG } from './carteira.config';
import { formatCompactNumber } from './carteira.helpers';
import type { BalanceData, TransactionItem } from './carteira.types';

function Fmt(v: number) {
  return Math.abs(v).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function RevenueChart({ data }: { data: number[] }) {
  const revenueWeek = data.length > 0 ? data : [0, 0, 0, 0, 0, 0, 0];
  const hasRevenue = revenueWeek.some((v) => v > 0);
  const dayKeys = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
  const max = Math.max(...revenueWeek);

  return (
    <div
      style={{
        background: 'var(--app-bg-card)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 6,
        padding: 20,
        position: 'relative',
      }}
    >
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--app-text-primary)',
          display: 'block',
          marginBottom: 16,
        }}
      >
        {kloelT(`Receita — Ultimos 7 dias`)}
      </span>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 6,
          height: 100,
          position: 'relative',
        }}
      >
        {hasRevenue
          ? revenueWeek.map((v, i) => (
              <div
                key={`rev-bar-${dayKeys[i]}`}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 8,
                    color: 'var(--app-text-tertiary)',
                  }}
                >
                  {formatCompactNumber(v)}
                </span>
                <div
                  style={{
                    width: '100%',
                    height: `${(v / max) * 70}px`,
                    background:
                      i === revenueWeek.length - 1
                        ? 'colors.ember.primary'
                        : 'colors.ember.primary40',
                    borderRadius: '3px 3px 0 0',
                  }}
                />
              </div>
            ))
          : revenueWeek.map((_, i) => (
              <div
                key={`empty-bar-${dayKeys[i]}`}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: 2,
                    background: 'var(--app-bg-secondary)',
                    borderRadius: '3px 3px 0 0',
                  }}
                />
              </div>
            ))}
        {!hasRevenue && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1,
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: 'var(--app-text-tertiary)',
                fontFamily: "'Sora',sans-serif",
              }}
            >
              {kloelT(`Nenhuma receita ainda`)}
            </span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'].map((d) => (
          <span
            key={d}
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 9,
              color: 'var(--app-text-tertiary)',
              flex: 1,
              textAlign: 'center',
            }}
          >
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}

function RecentTransactionsCard({
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
                borderBottom: i < Math.min(txList.length, 5) - 1 ? '1px solid var(--app-border-subtle)' : 'none',
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

export default function CarteiraSaldoCard({
  bal,
  revenueChart,
  txList,
  onOpenWithdraw,
  onOpenAntecipate,
  onNavigateExtrato,
}: {
  bal: BalanceData;
  revenueChart: number[];
  txList: TransactionItem[];
  onOpenWithdraw: () => void;
  onOpenAntecipate: () => void;
  onNavigateExtrato: () => void;
}) {
  const { isMobile } = useResponsiveViewport();

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr 1fr',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 24,
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
              background: 'colors.ember.primary',
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--app-text-secondary)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: 8,
            }}
          >
            {kloelT(`Saldo disponivel`)}
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 32,
              fontWeight: 700,
              color: 'colors.ember.primary',
              display: 'block',
              marginBottom: 4,
            }}
          >
            {kloelT(`R$`)} {Fmt(bal.available)}
          </span>
          <span style={{ fontSize: 11, color: 'var(--app-text-tertiary)' }}>
            {kloelT(`Pronto para saque`)}
          </span>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              type="button"
              onClick={onOpenWithdraw}
              style={{
                flex: 1,
                padding: '10px 16px',
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
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {IC.upload(12)} {kloelT(`Sacar`)}
            </button>
            <button
              type="button"
              onClick={onOpenAntecipate}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: 'none',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                color: 'var(--app-text-secondary)',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: "'Sora',sans-serif",
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {IC.spark(12)} {kloelT(`Antecipar`)}
            </button>
          </div>
        </div>

        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 18,
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
            {kloelT(`A receber`)}
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 22,
              fontWeight: 600,
              color: '#F59E0B',
            }}
          >
            {kloelT(`R$`)} {Fmt(bal.pending)}
          </span>
          <span
            style={{
              fontSize: 11,
              color: 'var(--app-text-tertiary)',
              display: 'block',
              marginTop: 4,
            }}
          >
            {kloelT(`Aguardando liberacao`)}
          </span>
        </div>

        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 18,
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
            {kloelT(`Bloqueado`)}
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 22,
              fontWeight: 600,
              color: 'var(--app-text-tertiary)',
            }}
          >
            {kloelT(`R$`)} {Fmt(bal.blocked)}
          </span>
          <span
            style={{
              fontSize: 11,
              color: 'var(--app-text-tertiary)',
              display: 'block',
              marginTop: 4,
            }}
          >
            {kloelT(`Em garantia`)}
          </span>
        </div>

        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 18,
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
            {kloelT(`Total acumulado`)}
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 22,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
            }}
          >
            {kloelT(`R$`)} {Fmt(bal.total)}
          </span>
          <span
            style={{
              fontSize: 11,
              color: 'var(--app-text-tertiary)',
              display: 'block',
              marginTop: 4,
            }}
          >
            {kloelT(`Todas as origens`)}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <RevenueChart data={revenueChart} />
        <RecentTransactionsCard txList={txList} onNavigateExtrato={onNavigateExtrato} />
      </div>
    </>
  );
}
