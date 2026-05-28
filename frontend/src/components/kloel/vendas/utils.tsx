import { colors } from '@/lib/design-tokens';
import { formatBRL } from '@/lib/common/money';

export const SORA = "var(--font-sora), 'Sora', sans-serif";
export const MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";

export const SALE_STATUS: Record<string, { label: string; color: string }> = {
  paid: { label: 'Pago', color: 'colors.ember.primary' },
  pending: { label: 'Pendente', color: colors.semantic.warning },
  refunded: { label: 'Reembolsado', color: 'var(--app-text-secondary)' },
  cancelled: { label: 'Cancelado', color: 'var(--app-text-tertiary)' },
  overdue: { label: 'Atrasado', color: colors.semantic.error },
};

export const SUB_STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Ativa', color: 'colors.ember.primary' },
  PAST_DUE: { label: 'Atrasada', color: colors.semantic.warning },
  CANCELLED: { label: 'Cancelada', color: 'var(--app-text-tertiary)' },
  PAUSED: { label: 'Pausada', color: 'var(--app-text-secondary)' },
  TRIALING: { label: 'Trial', color: colors.semantic.info },
};

export const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  PROCESSING: { label: 'Processando', color: colors.semantic.warning },
  SHIPPED: { label: 'Enviado', color: colors.semantic.info },
  DELIVERED: { label: 'Entregue', color: 'colors.ember.primary' },
  RETURNED: { label: 'Devolvido', color: 'var(--app-text-secondary)' },
  CANCELLED: { label: 'Cancelado', color: 'var(--app-text-tertiary)' },
};

export const PAY_METHODS: Record<string, string> = {
  PIX: 'colors.ember.primary',
  CREDIT_CARD: colors.semantic.info,
  BOLETO: colors.semantic.warning,
  DEBIT: colors.semantic.success,
};

export const fmtBRL = formatBRL;

export function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('pt-BR');
}
