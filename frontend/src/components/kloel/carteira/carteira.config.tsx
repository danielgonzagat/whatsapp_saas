import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { IC } from './carteira.icons';

export { IC };

export const BANK_ACCOUNT_ARIA_LABEL = kloelT(`Conta bancaria`);
export const BANK_ACCOUNT_PLACEHOLDER = kloelT(`12345-6`);

export const TYPE_CONFIG: Record<
  string,
  { label: string; color: string; icon: (s: number) => React.ReactElement; sign: string }
> = {
  sale: { label: 'Venda', color: colors.ember.primary, icon: IC.arrowDown, sign: '+' },
  commission: { label: 'Comissão', color: colors.semantic.success, icon: IC.arrowDown, sign: '+' },
  withdrawal: { label: 'Saque', color: 'var(--app-text-secondary)', icon: IC.arrowUp, sign: '' },
  refund: { label: 'Reembolso', color: colors.semantic.error, icon: IC.arrowUp, sign: '' },
  anticipation: { label: 'Antecipação', color: colors.semantic.info, icon: IC.spark, sign: '+' },
};

export const STATUS_COLOR: Record<string, string> = {
  completed: colors.ember.primary,
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

