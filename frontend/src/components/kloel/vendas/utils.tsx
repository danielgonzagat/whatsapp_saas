import { colors } from '@/lib/design-tokens';

export const SORA = "var(--font-sora), 'Sora', sans-serif";
export const MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";

export const SALE_STATUS: Record<string, { label: string; color: string }> = {
  paid: { label: 'Pago', color: 'colors.ember.primary' },
  pending: { label: 'Pendente', color: '#F59E0B' },
  refunded: { label: 'Reembolsado', color: 'var(--app-text-secondary)' },
  cancelled: { label: 'Cancelado', color: 'var(--app-text-tertiary)' },
  overdue: { label: 'Atrasado', color: '#EF4444' },
};

export const SUB_STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Ativa', color: 'colors.ember.primary' },
  PAST_DUE: { label: 'Atrasada', color: '#F59E0B' },
  CANCELLED: { label: 'Cancelada', color: 'var(--app-text-tertiary)' },
  PAUSED: { label: 'Pausada', color: 'var(--app-text-secondary)' },
  TRIALING: { label: 'Trial', color: '#3B82F6' },
};

export const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  PROCESSING: { label: 'Processando', color: '#F59E0B' },
  SHIPPED: { label: 'Enviado', color: '#3B82F6' },
  DELIVERED: { label: 'Entregue', color: 'colors.ember.primary' },
  RETURNED: { label: 'Devolvido', color: 'var(--app-text-secondary)' },
  CANCELLED: { label: 'Cancelado', color: 'var(--app-text-tertiary)' },
};

export const PAY_METHODS: Record<string, string> = {
  PIX: 'colors.ember.primary',
  CREDIT_CARD: '#3B82F6',
  BOLETO: '#F59E0B',
  DEBIT: '#10B981',
};

export function fmtBRL(v: number): string {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

export function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('pt-BR');
}
