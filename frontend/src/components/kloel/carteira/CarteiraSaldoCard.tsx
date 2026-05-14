'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { IC } from './carteira.config';
import { Fmt } from './carteira.helpers';
import { RevenueChart } from './carteira-revenue-chart';
import { RecentTransactionsCard } from './carteira-recent-transactions';
import type { BalanceData, TransactionItem } from './carteira.types';

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
              color: colors.semantic.warning,
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
