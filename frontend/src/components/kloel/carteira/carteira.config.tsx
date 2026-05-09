import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { IC } from './carteira.icons';
import type { TransactionItem } from './carteira.types';

export { IC };

export const BANK_ACCOUNT_ARIA_LABEL = kloelT(`Conta bancaria`);
export const BANK_ACCOUNT_PLACEHOLDER = kloelT(`12345-6`);

export const TYPE_CONFIG: Record<
  string,
  { label: string; color: string; icon: (s: number) => React.ReactElement; sign: string }
> = {
  sale: { label: 'Venda', color: 'colors.ember.primary', icon: IC.arrowDown, sign: '+' },
  commission: { label: 'Comissão', color: colors.semantic.success, icon: IC.arrowDown, sign: '+' },
  withdrawal: { label: 'Saque', color: 'var(--app-text-secondary)', icon: IC.arrowUp, sign: '' },
  refund: { label: 'Reembolso', color: colors.semantic.error, icon: IC.arrowUp, sign: '' },
  anticipation: { label: 'Antecipação', color: colors.semantic.info, icon: IC.spark, sign: '+' },
};

export const STATUS_COLOR: Record<string, string> = {
  completed: 'colors.ember.primary',
  pending: colors.semantic.warning,
  processing: colors.semantic.info,
  failed: colors.semantic.error,
};

export const STATUS_LABEL: Record<string, string> = {
  completed: 'Concluido',
  pending: 'Pendente',
  processing: 'Processando',
  failed: 'Falhou',
};

export function renderTransactionRow(
  t: TransactionItem,
  index: number,
  total: number,
  isMobile: boolean,
) {
  const cfg = TYPE_CONFIG[t.type] || TYPE_CONFIG.sale;
  return (
    <div
      key={t.id}
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '36px 2fr 0.8fr 0.6fr 1fr 0.6fr',
        gap: 12,
        padding: '12px 16px',
        borderBottom: index < total - 1 ? '1px solid var(--app-border-subtle)' : 'none',
        alignItems: 'center',
        transition: 'background .1s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--app-bg-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none';
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          background: `${cfg.color}12`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: cfg.color,
        }}
      >
        {cfg.icon(14)}
      </div>
      <div>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--app-text-primary)',
            display: 'block',
          }}
        >
          {t.desc}
        </span>
        {t.fee > 0 && (
          <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
            {kloelT(`Taxa: R$`)} {Math.abs(t.fee).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: cfg.color,
          background: `${cfg.color}12`,
          padding: '3px 8px',
          borderRadius: 4,
          textTransform: 'uppercase',
          fontFamily: "'JetBrains Mono',monospace",
          textAlign: isMobile ? 'left' : 'center',
          justifySelf: isMobile ? 'flex-start' : undefined,
        }}
      >
        {cfg.label}
      </span>
      <span
        style={{
          fontSize: 10,
          color: STATUS_COLOR[t.status],
          fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        {STATUS_LABEL[t.status]}
      </span>
      <span
        style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 14,
          fontWeight: 600,
          color: t.amount > 0 ? cfg.color : 'var(--app-text-secondary)',
        }}
      >
        {t.amount > 0 ? '+' : ''}
        {kloelT(`R$`)}{' '}
        {Math.abs(t.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
        {t.date}
        <br />
        {t.time}
      </span>
    </div>
  );
}
