export function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '—';
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export function formatInteger(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '—';
  }
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
}

export function statusTone(status: string) {
  switch (status) {
    case 'APPROVED':
    case 'ACTIVE':
      return {
        dot: '#22C55E',
        badge: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700',
      };
    case 'PENDING':
      return {
        dot: '#F59E0B',
        badge: 'border-amber-500/25 bg-amber-500/10 text-amber-700',
      };
    case 'REJECTED':
      return {
        dot: '#EF4444',
        badge: 'border-red-500/25 bg-red-500/10 text-red-600',
      };
    default:
      return {
        dot: 'var(--app-text-tertiary)',
        badge:
          'border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] text-[var(--app-text-secondary)]',
      };
  }
}

export function pct(value: number, total: number) {
  if (!total) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}
